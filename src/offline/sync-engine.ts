import { syncPull, syncPush } from "@/lib/api";
import { isAuthError } from "@/lib/api-errors";
import { inspectToken } from "./auth-session";
import { localConflictPayload } from "./conflict-payload";
import { offlineDb, tenantMetadataKey } from "./db";
import { getDeviceId } from "./device";
import { nextRetryTime, notifySyncStatusChanged, pendingOperations, recoverStaleSyncingOperations } from "./outbox";
import type { PullChange, PushOperation, PushResult, SyncQueueItem, SyncEntityType } from "./schema";

const syncLeaseMs = 60_000;
const maxPushBatches = 10;
const channelName = "restaurant-ops-sync";
let running = false;
const requestedWhileRunning = new Set<string>();
let channel: BroadcastChannel | null = null;

function getChannel() {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(channelName);
  }
  return channel;
}

export async function startSync(tenantId: string, token: string) {
  if (!tenantId || !token) return;
  if (running) {
    requestedWhileRunning.add(tenantId);
    return;
  }
  if (inspectToken(token).expired) {
    await pauseAuthenticationFailures(tenantId, "انتهت صلاحية الجلسة. سجّل الدخول لمتابعة المزامنة.");
    return;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await recoverStaleSyncingOperations(tenantId);
    await markRetryableCompletionFailures(tenantId);
    await markRetryableExpenseFailures(tenantId);
    await markRetryableCashMovementFailures(tenantId);
    notifySyncStatusChanged();
    return;
  }
  running = true;
  let leaseAcquired = false;
  const startedAt = performanceNow();
  const leaseOwnerId = await getDeviceId();
  let pushedOperations = 0;
  let pulledChanges = 0;
  try {
    await recoverStaleSyncingOperations(tenantId);
    await markRetryableCompletionFailures(tenantId);
    await markRetryableExpenseFailures(tenantId);
    await markRetryableCashMovementFailures(tenantId);
    await resumeAuthenticationFailures(tenantId);
    leaseAcquired = await acquireSyncLease(tenantId, leaseOwnerId);
    if (!leaseAcquired) return;

    getChannel()?.postMessage({ type: "sync-started", tenantId });
    notifySyncStatusChanged();

    for (let index = 0; index < maxPushBatches; index += 1) {
      await refreshSyncLease(tenantId, leaseOwnerId);
      const pushed = await pushPendingOperations(tenantId, token);
      if (pushed < 0) return;
      if (pushed === 0) break;
      pushedOperations += pushed;
    }
    await refreshSyncLease(tenantId, leaseOwnerId);
    try {
      pulledChanges = await pullServerChanges(tenantId, token);
    } catch (error) {
      if (isAuthError(error)) {
        await pauseAuthenticationFailures(tenantId, error instanceof Error ? error.message : "Invalid or expired token");
        return;
      }
      throw error;
    }
  } finally {
    if (leaseAcquired) await releaseSyncLease(tenantId, leaseOwnerId);
    running = false;
    getChannel()?.postMessage({ type: "sync-finished", tenantId });
    logSyncCycle(startedAt, pushedOperations, pulledChanges);
    notifySyncStatusChanged();
    await runRequestedFollowUpSync(tenantId, token);
  }
}

async function runRequestedFollowUpSync(tenantId: string, token: string) {
  if (!requestedWhileRunning.delete(tenantId)) return;
  if (inspectToken(token).expired) return;
  const dueOperations = await pendingOperations(tenantId, 1);
  if (dueOperations.length) {
    void startSync(tenantId, token);
  }
}

async function acquireSyncLease(tenantId: string, leaseOwnerId: string) {
  const key = tenantMetadataKey(tenantId);
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + syncLeaseMs).toISOString();

  return offlineDb.transaction("rw", offlineDb.syncMetadata, async () => {
    const current = await offlineDb.syncMetadata.get(key);
    if (current?.syncLeaseUntil && current.syncLeaseUntil > now.toISOString()) {
      return false;
    }

    await offlineDb.syncMetadata.put({
      key,
      tenantId,
      lastPullCursor: current?.lastPullCursor ?? 0,
      lastSyncedAt: current?.lastSyncedAt,
      syncInProgress: true,
      syncLeaseUntil: leaseUntil,
      syncLeaseOwnerId: leaseOwnerId
    });
    return true;
  });
}

async function refreshSyncLease(tenantId: string, leaseOwnerId: string) {
  const key = tenantMetadataKey(tenantId);
  const current = await offlineDb.syncMetadata.get(key);
  if (!current || current.syncLeaseOwnerId !== leaseOwnerId) return;
  await offlineDb.syncMetadata.put({
    ...current,
    syncInProgress: true,
    syncLeaseUntil: new Date(Date.now() + syncLeaseMs).toISOString()
  });
}

async function releaseSyncLease(tenantId: string, leaseOwnerId: string) {
  const key = tenantMetadataKey(tenantId);
  const current = await offlineDb.syncMetadata.get(key);
  if (!current) return;
  if (current.syncLeaseOwnerId && current.syncLeaseOwnerId !== leaseOwnerId) return;
  await offlineDb.syncMetadata.put({
    ...current,
    syncInProgress: false,
    syncLeaseUntil: undefined,
    syncLeaseOwnerId: undefined,
    lastSyncedAt: new Date().toISOString()
  });
}

async function pushPendingOperations(tenantId: string, token: string) {
  const operations = await pendingOperations(tenantId);
  if (!operations.length) return 0;

  const now = new Date().toISOString();
  await offlineDb.syncQueue.bulkPut(operations.map((operation) => ({ ...operation, status: "syncing", lastAttemptAt: now })));
  await markCompletionOperationsStatus(operations, "syncing");
  await markExpenseOperationsStatus(operations, "syncing");
  await markCashMovementOperationsStatus(operations, "syncing");
  notifySyncStatusChanged();

  const deviceId = await getDeviceId();
  const requestOperations: PushOperation[] = operations.map((operation) => ({
    operationId: operation.operationId,
    entityType: operation.entityType,
    entityId: operation.entityId,
    action: operation.action,
    payload: operation.payload,
    baseVersion: operation.baseVersion,
    dependencyIds: operation.dependencyIds,
    clientCreatedAt: operation.createdAt
  }));

  try {
    const response = await syncPush(token, deviceId, requestOperations);
    await applyPushResults(operations, response.results);
  } catch (error) {
    if (isAuthError(error)) {
      await offlineDb.syncQueue.bulkPut(operations.map((operation) => markAuthenticationFailure(operation, error instanceof Error ? error.message : "Invalid or expired token")));
      await markCompletionOperationsStatus(operations, "failed", "auth_required", error instanceof Error ? error.message : "Invalid or expired token");
      await markExpenseOperationsStatus(operations, "failed", "auth_required", error instanceof Error ? error.message : "Invalid or expired token");
      await markCashMovementOperationsStatus(operations, "failed", "auth_required", error instanceof Error ? error.message : "Invalid or expired token");
      notifySyncStatusChanged();
      return -1;
    }
    const message = error instanceof Error ? error.message : "Sync request failed";
    await offlineDb.syncQueue.bulkPut(operations.map((operation) => markRetryableFailure(operation, message)));
    await markCompletionOperationsStatus(operations, "pending", "network_error", message);
    await markExpenseOperationsStatus(operations, "pending", "network_error", message);
    await markCashMovementOperationsStatus(operations, "pending", "network_error", message);
    notifySyncStatusChanged();
  }

  return operations.length;
}

async function pauseAuthenticationFailures(tenantId: string, message: string) {
  await recoverStaleSyncingOperations(tenantId, true);
  const operations = await offlineDb.syncQueue
    .where("[tenantId+status]")
    .anyOf([[tenantId, "pending"], [tenantId, "failed"]])
    .toArray();
  if (operations.length) {
    await offlineDb.syncQueue.bulkPut(operations.map((operation) => markAuthenticationFailure(operation, message)));
    await markCompletionOperationsStatus(operations, "failed", "auth_required", message);
    await markExpenseOperationsStatus(operations, "failed", "auth_required", message);
    await markCashMovementOperationsStatus(operations, "failed", "auth_required", message);
  }
  notifySyncStatusChanged();
}

async function resumeAuthenticationFailures(tenantId: string) {
  const operations = await offlineDb.syncQueue
    .where("[tenantId+status]")
    .equals([tenantId, "failed"])
    .filter((operation) => operation.error?.code === "auth_required")
    .toArray();
  if (!operations.length) return;

  await offlineDb.syncQueue.bulkPut(operations.map((operation) => ({
    ...operation,
    status: "pending" as const,
    error: undefined,
    nextAttemptAt: undefined
  })));
  await markCompletionOperationsStatus(operations, "pending");
  await markExpenseOperationsStatus(operations, "pending");
  await markCashMovementOperationsStatus(operations, "pending");
  notifySyncStatusChanged();
}

async function applyPushResults(operations: SyncQueueItem[], results: PushResult[]) {
  const byId = new Map(results.map((result) => [result.operationId, result]));
  const now = new Date().toISOString();
  const updates: SyncQueueItem[] = [];

  for (const operation of operations) {
    const result = byId.get(operation.operationId);
    if (!result) {
      if (operation.action === "completeOrder") {
        await markCompletionArtifactsStatus(operation.entityId, "pending", "network_error", "Missing sync result");
      }
      if (operation.entityType === "expense" && operation.action === "create") {
        await markExpenseStatus(operation.entityId, "pending", "network_error", "Missing sync result");
      }
      if (operation.entityType === "cashMovement" && operation.action === "create") {
        await markCashMovementStatus(operation.entityId, "pending", "network_error", "Missing sync result");
      }
      updates.push(markRetryableFailure(operation, "Missing sync result"));
      continue;
    }

    if (result.status === "applied" || result.status === "duplicate") {
      updates.push({
        ...operation,
        status: "synced",
        error: undefined,
        serverResponse: result.response,
        lastAttemptAt: now,
        nextAttemptAt: undefined
      });
      await markEntitySynced(operation, result, now);
      continue;
    }

    if (result.status === "conflict") {
      updates.push({ ...operation, status: "conflict", error: result.error, lastAttemptAt: now });
      if (operation.action === "completeOrder") {
        await markCompletionArtifactsStatus(operation.entityId, "conflict", result.error?.code, result.error?.message);
      }
      if (operation.entityType === "expense" && operation.action === "create") {
        await markExpenseStatus(operation.entityId, "conflict", result.error?.code, result.error?.message);
      }
      if (operation.entityType === "cashMovement" && operation.action === "create") {
        await markCashMovementStatus(operation.entityId, "conflict", result.error?.code, result.error?.message);
      }
      await offlineDb.syncConflicts.put({
        id: `${operation.operationId}:${operation.entityId}`,
        operationId: operation.operationId,
        entityType: operation.entityType,
        entityId: operation.entityId,
        tenantId: operation.tenantId,
        message: result.error?.message ?? "Sync conflict",
        localPayload: localConflictPayload(operation),
        serverPayload: result.response,
        createdAt: now
      });
      continue;
    }

    if (operation.action === "completeOrder") {
      await markCompletionArtifactsStatus(
        operation.entityId,
        result.error?.retryable ? "pending" : "failed",
        result.error?.code,
        result.error?.message
      );
    }
    if (operation.entityType === "expense" && operation.action === "create") {
      await markExpenseStatus(
        operation.entityId,
        result.error?.retryable ? "pending" : "failed",
        result.error?.code,
        result.error?.message
      );
    }
    if (operation.entityType === "cashMovement" && operation.action === "create") {
      await markCashMovementStatus(
        operation.entityId,
        result.error?.retryable ? "pending" : "failed",
        result.error?.code,
        result.error?.message
      );
    }
    updates.push({
      ...operation,
      status: result.error?.retryable ? "failed" : "failed",
      error: result.error,
      retryCount: operation.retryCount + 1,
      nextAttemptAt: result.error?.retryable ? nextRetryTime(operation.retryCount + 1) : undefined,
      lastAttemptAt: now
    });
  }

  await offlineDb.syncQueue.bulkPut(updates);
  await reconcileFinancialArtifactStatuses(updates);
  notifySyncStatusChanged();
}

async function markEntitySynced(operation: SyncQueueItem, result: PushResult, now: string) {
  if (operation.entityType === "table") {
    const table = await offlineDb.opsTables.get(operation.entityId);
    if (!table) return;
    await offlineDb.opsTables.put({
      ...table,
      version: result.serverVersion ?? table.version,
      syncStatus: "synced",
      lastSyncedAt: now
    });
    return;
  }

  if (operation.entityType === "order") {
    const order = await offlineDb.orders.get(operation.entityId);
    const serverVersion = result.serverVersion ?? order?.version;
    if (!order) return;
    await offlineDb.orders.put({
      ...order,
      ...(result.response ?? {}),
      version: serverVersion,
      syncStatus: "synced",
      lastSyncedAt: now
    });
    await updateDependentOrderBaseVersions(operation, serverVersion);
    if (operation.action === "completeOrder") {
      await markOrderCompletionArtifactsSynced(operation.entityId, result, now);
    }
  }

  if (operation.entityType === "payment") {
    const relatedOrderId = String(result.response?.orderId ?? "");
    const relatedOrderVersion = Number(result.response?.orderVersion);
    if (relatedOrderId && Number.isFinite(relatedOrderVersion)) {
      const order = await offlineDb.orders.get(relatedOrderId);
      if (order) await offlineDb.orders.put({ ...order, version: relatedOrderVersion });
      await updateDependentOrderBaseVersions({ ...operation, entityType: "order", entityId: relatedOrderId }, relatedOrderVersion);
    }
    const invoiceId = String(operation.payload.invoiceId ?? "");
    const invoice = await offlineDb.invoices.get(invoiceId);
    if (invoice) {
      await offlineDb.invoices.put(clearSyncError({ ...invoice, syncStatus: "synced", lastSyncedAt: now }));
      if (invoice.orderId) {
        const order = await offlineDb.orders.get(invoice.orderId);
        if (order) await offlineDb.orders.put(clearSyncError({ ...order, syncStatus: "synced", lastSyncedAt: now }));
      }
      if (invoice.supplierId) {
        const supplier = await offlineDb.suppliers.get(invoice.supplierId);
        if (supplier) await offlineDb.suppliers.put(clearSyncError({ ...supplier, syncStatus: "synced", lastSyncedAt: now }));
      }
    }
    const count = Array.isArray(operation.payload.payments) ? operation.payload.payments.length : 0;
    for (let index = 0; index < count; index++) {
      const id = index === 0 ? operation.entityId : `${operation.entityId}_${index}`;
      const payment = await offlineDb.payments.get(id);
      if (payment) await offlineDb.payments.put(clearSyncError({ ...payment, syncStatus: "synced", lastSyncedAt: now }));
      const movement = await offlineDb.cashMovements.get(id);
      if (movement) await offlineDb.cashMovements.put(clearSyncError({ ...movement, syncStatus: "synced", lastSyncedAt: now }));
    }
    const journal = await offlineDb.journalEntries.get(operation.entityId);
    if (journal) await offlineDb.journalEntries.put(clearSyncError({ ...journal, syncStatus: "synced", lastSyncedAt: now }));
  }

  if (operation.entityType === "expense") {
    const expense = await offlineDb.expenses.get(operation.entityId);
    if (!expense) return;
    await offlineDb.expenses.put(clearSyncError({
      ...expense,
      ...(result.response ?? {}),
      id: operation.entityId,
      version: result.serverVersion ?? expense.version,
      syncStatus: "synced",
      lastSyncedAt: now
    }));
  }

  if (operation.entityType === "cashMovement") {
    const movement = await offlineDb.cashMovements.get(operation.entityId);
    if (!movement) return;
    await offlineDb.cashMovements.put(clearSyncError({
      ...movement,
      ...(result.response ?? {}),
      id: operation.entityId,
      version: result.serverVersion ?? movement.version,
      syncStatus: "synced",
      lastSyncedAt: now
    }));
  }
}

async function updateDependentOrderBaseVersions(operation: SyncQueueItem, serverVersion: number | undefined) {
  if (serverVersion === undefined) return;
  const dependents = await offlineDb.syncQueue
    .where("[tenantId+entityType+entityId]")
    .equals([operation.tenantId, "order", operation.entityId])
    .filter((item) => {
      if (!["pending", "failed"].includes(item.status)) return false;
      return item.dependencyIds.includes(operation.operationId);
    })
    .toArray();
  if (!dependents.length) return;

  await offlineDb.syncQueue.bulkPut(dependents.map((item) => ({
    ...item,
    baseVersion: serverVersion
  })));
}

async function markOrderCompletionArtifactsSynced(orderId: string, result: PushResult, now: string) {
  const invoiceId = String(result.response?.invoiceId ?? `order_${orderId}`);
  const paymentId = String(result.response?.paymentId ?? "");
  const movementId = `order_${orderId}`;
  const journalId = `order_${orderId}`;

  const invoice = await offlineDb.invoices.get(invoiceId);
  if (invoice) await offlineDb.invoices.put(clearSyncError({ ...invoice, syncStatus: "synced", lastSyncedAt: now, version: result.serverVersion ?? invoice.version }));

  if (paymentId) {
    const payment = await offlineDb.payments.get(paymentId);
    if (payment) await offlineDb.payments.put(clearSyncError({ ...payment, syncStatus: "synced", lastSyncedAt: now, version: result.serverVersion ?? payment.version }));
  }

  const movement = await offlineDb.cashMovements.get(movementId);
  if (movement) await offlineDb.cashMovements.put(clearSyncError({ ...movement, syncStatus: "synced", lastSyncedAt: now, version: result.serverVersion ?? movement.version }));

  const completionOrder = await offlineDb.orders.get(orderId);
  for (let index = 1; index < (completionOrder?.payments?.length ?? 0); index++) {
    const id = `order_${orderId}_${index}`;
    const payment = await offlineDb.payments.get(id);
    if (payment) await offlineDb.payments.put(clearSyncError({ ...payment, syncStatus: "synced", lastSyncedAt: now }));
    const movement = await offlineDb.cashMovements.get(id);
    if (movement) await offlineDb.cashMovements.put(clearSyncError({ ...movement, syncStatus: "synced", lastSyncedAt: now }));
  }
  const journal = await offlineDb.journalEntries.get(journalId);
  if (journal) await offlineDb.journalEntries.put(clearSyncError({ ...journal, syncStatus: "synced", lastSyncedAt: now, version: result.serverVersion ?? journal.version }));
}

async function pullServerChanges(tenantId: string, token: string) {
  const key = tenantMetadataKey(tenantId);
  const metadata = await offlineDb.syncMetadata.get(key);
  const cursor = metadata?.lastPullCursor ?? 0;
  const response = await syncPull(token, cursor);

  await offlineDb.transaction("rw", [
    offlineDb.opsTables,
    offlineDb.orders,
    offlineDb.menuItems,
    offlineDb.categories,
    offlineDb.recipeIngredients,
    offlineDb.cashRegisters,
    offlineDb.invoices,
    offlineDb.payments,
    offlineDb.expenses,
    offlineDb.cashMovements,
    offlineDb.journalEntries,
    offlineDb.syncMetadata
  ],
    async () => {
      for (const change of response.changes) {
        await applyPullChange(tenantId, change);
      }
      await offlineDb.syncMetadata.put({
        key,
        tenantId,
        lastPullCursor: response.cursor,
        lastSyncedAt: new Date().toISOString()
      });
    }
  );
  return response.changes.length;
}

async function applyPullChange(tenantId: string, change: PullChange) {
  const table = tableForEntity(change.entityType);
  if (!table) return;

  if (change.action === "delete") {
    const current = await table.get(change.entityId) as { syncStatus?: string } | undefined;
    if (current?.syncStatus === "pending") return;
    await table.put({
      ...(current ?? { id: change.entityId, restaurantId: tenantId }),
      deletedAt: change.changedAt,
      version: change.version,
      syncStatus: "synced",
      lastSyncedAt: new Date().toISOString()
    } as never);
    return;
  }

  if (!change.data) return;
  if (!changeBelongsToTenant(change, tenantId)) return;
  const current = await table.get(change.entityId) as { syncStatus?: string } | undefined;
  if (current?.syncStatus === "pending" || current?.syncStatus === "syncing") return;
  const reconciliation = reconciliationPatch(change, current as Record<string, unknown> | undefined);
  await table.put({
    ...(change.data as Record<string, unknown>),
    id: change.entityId,
    restaurantId: tenantId,
    version: change.version,
    syncStatus: "synced",
    lastSyncedAt: new Date().toISOString(),
    ...reconciliation
  } as never);
}

function changeBelongsToTenant(change: PullChange, tenantId: string) {
  const restaurantId = change.data?.restaurantId;
  return !restaurantId || restaurantId === tenantId;
}

async function markCompletionOperationsStatus(
  operations: SyncQueueItem[],
  status: "pending" | "syncing" | "failed" | "conflict",
  code?: string,
  message?: string
) {
  await Promise.all(
    operations
      .filter((operation) => operation.entityType === "order" && operation.action === "completeOrder")
      .map((operation) => markCompletionArtifactsStatus(operation.entityId, status, code, message))
  );
}

async function markRetryableCompletionFailures(tenantId: string) {
  const operations = await offlineDb.syncQueue
    .where("[tenantId+status]")
    .equals([tenantId, "failed"])
    .filter((operation) => operation.entityType === "order" && operation.action === "completeOrder" && operation.error?.retryable !== false)
    .toArray();
  if (!operations.length) return;
  await Promise.all(operations.map((operation) => markCompletionArtifactsStatus(
    operation.entityId,
    "failed",
    operation.error?.code,
    operation.error?.message
  )));
}

async function markRetryableExpenseFailures(tenantId: string) {
  const operations = await offlineDb.syncQueue
    .where("[tenantId+status]")
    .equals([tenantId, "failed"])
    .filter((operation) => operation.entityType === "expense" && operation.action === "create" && operation.error?.retryable !== false)
    .toArray();
  if (!operations.length) return;
  await Promise.all(operations.map((operation) => markExpenseStatus(
    operation.entityId,
    "failed",
    operation.error?.code,
    operation.error?.message
  )));
}

async function markRetryableCashMovementFailures(tenantId: string) {
  const operations = await offlineDb.syncQueue
    .where("[tenantId+status]")
    .equals([tenantId, "failed"])
    .filter((operation) => operation.entityType === "cashMovement" && operation.action === "create" && operation.error?.retryable !== false)
    .toArray();
  if (!operations.length) return;
  await Promise.all(operations.map((operation) => markCashMovementStatus(
    operation.entityId,
    "failed",
    operation.error?.code,
    operation.error?.message
  )));
}

async function markExpenseOperationsStatus(
  operations: SyncQueueItem[],
  status: "pending" | "syncing" | "failed" | "conflict",
  code?: string,
  message?: string
) {
  await Promise.all(
    operations
      .filter((operation) => operation.entityType === "expense" && operation.action === "create")
      .map((operation) => markExpenseStatus(operation.entityId, status, code, message))
  );
}

async function markCashMovementOperationsStatus(
  operations: SyncQueueItem[],
  status: "pending" | "syncing" | "failed" | "conflict",
  code?: string,
  message?: string
) {
  await Promise.all(
    operations
      .filter((operation) => operation.entityType === "cashMovement" && operation.action === "create")
      .map((operation) => markCashMovementStatus(operation.entityId, status, code, message))
  );
}

async function markExpenseStatus(
  expenseId: string,
  status: "pending" | "syncing" | "failed" | "conflict",
  code?: string,
  message?: string
) {
  const expense = await offlineDb.expenses.get(expenseId);
  if (!expense) return;
  await offlineDb.expenses.put({ ...expense, ...syncStatusPatch(status, code, message) });
}

async function markCashMovementStatus(
  movementId: string,
  status: "pending" | "syncing" | "failed" | "conflict",
  code?: string,
  message?: string
) {
  const movement = await offlineDb.cashMovements.get(movementId);
  if (!movement) return;
  await offlineDb.cashMovements.put({ ...movement, ...syncStatusPatch(status, code, message) });
}

async function markCompletionArtifactsStatus(
  orderId: string,
  status: "pending" | "syncing" | "failed" | "conflict",
  code?: string,
  message?: string
) {
  const ids = {
    invoiceId: `order_${orderId}`,
    paymentId: `order_${orderId}`,
    movementId: `order_${orderId}`,
    journalId: `order_${orderId}`
  };
  const [invoice, payment, movement, journal] = await Promise.all([
    offlineDb.invoices.get(ids.invoiceId),
    offlineDb.payments.get(ids.paymentId),
    offlineDb.cashMovements.get(ids.movementId),
    offlineDb.journalEntries.get(ids.journalId)
  ]);
  const patch = syncStatusPatch(status, code, message);
  await Promise.all([
    invoice ? offlineDb.invoices.put({ ...invoice, ...patch }) : Promise.resolve(),
    payment ? offlineDb.payments.put({ ...payment, ...patch }) : Promise.resolve(),
    movement ? offlineDb.cashMovements.put({ ...movement, ...patch }) : Promise.resolve(),
    journal ? offlineDb.journalEntries.put({ ...journal, ...patch }) : Promise.resolve()
  ]);
}

function syncStatusPatch(status: "pending" | "syncing" | "failed" | "conflict", code?: string, message?: string) {
  return status === "failed" || status === "conflict"
    ? { syncStatus: status, syncErrorCode: code, syncErrorMessage: message }
    : { syncStatus: status, syncErrorCode: undefined, syncErrorMessage: undefined };
}

function clearSyncError<T extends { syncErrorCode?: string; syncErrorMessage?: string }>(record: T) {
  return {
    ...record,
    syncErrorCode: undefined,
    syncErrorMessage: undefined
  };
}

function reconciliationPatch(change: PullChange, current: Record<string, unknown> | undefined) {
  if (change.entityType !== "invoice" || !current || !change.data) return {};
  const localTotal = Number(current.total);
  const serverTotal = Number((change.data as Record<string, unknown>).total);
  if (!Number.isFinite(localTotal) || !Number.isFinite(serverTotal) || Math.abs(localTotal - serverTotal) < 0.0001) return {};
  return {
    reconciliationWarning: "invoice_total_mismatch",
    localTotalBeforeReconcile: localTotal
  };
}

function tableForEntity(entityType: PullChange["entityType"]) {
  switch (entityType) {
    case "table":
      return offlineDb.opsTables;
    case "order":
      return offlineDb.orders;
    case "menuItem":
      return offlineDb.menuItems;
    case "category":
      return offlineDb.categories;
    case "recipeIngredient":
      return offlineDb.recipeIngredients;
    case "cashRegister":
      return offlineDb.cashRegisters;
    case "invoice":
      return offlineDb.invoices;
    case "payment":
      return offlineDb.payments;
    case "expense":
      return offlineDb.expenses;
    case "cashMovement":
      return offlineDb.cashMovements;
    case "journalEntry":
      return offlineDb.journalEntries;
    default:
      return null;
  }
}

function markRetryableFailure(operation: SyncQueueItem, message: string): SyncQueueItem {
  const retryCount = operation.retryCount + 1;
  return {
    ...operation,
    status: "pending",
    retryCount,
    nextAttemptAt: nextRetryTime(retryCount),
    error: {
      code: "network_error",
      message,
      retryable: true
    },
    lastAttemptAt: new Date().toISOString()
  };
}

function markAuthenticationFailure(operation: SyncQueueItem, message: string): SyncQueueItem {
  return {
    ...operation,
    status: "failed",
    error: {
      code: "auth_required",
      message,
      retryable: false
    },
    nextAttemptAt: undefined,
    lastAttemptAt: new Date().toISOString()
  };
}

function performanceNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function logSyncCycle(startedAt: number, pushedOperations: number, pulledChanges: number) {
  if (process.env.NODE_ENV === "production") return;
  const durationMs = Math.round(performanceNow() - startedAt);
  console.debug("[offline-sync] cycle", { durationMs, pushedOperations, pulledChanges });
}

async function reconcileFinancialArtifactStatuses(updated: SyncQueueItem[]) {
  if (!updated.length) return;
  const tenantId = updated[0].tenantId;
  const pending = await offlineDb.syncQueue.where("tenantId").equals(tenantId).filter(op => op.status !== "synced").toArray();
  const operations = [...updated.filter(op => op.status === "synced"), ...pending];
  const patches = new Map<string, { table: ReturnType<typeof tableForEntity>; id: string; op: SyncQueueItem }>();
  const add = (entity: SyncEntityType, id: string, op: SyncQueueItem) => { if (id) patches.set(`${entity}:${id}`, { table: tableForEntity(entity), id, op }); };
  for (const op of operations) {
    let registerIds: string[] = [];
    const rows = Array.isArray(op.payload.payments) ? op.payload.payments as Array<{ cashRegisterId?: string }> : null;
    registerIds = rows?.map(row => row.cashRegisterId ?? "") ?? [String(op.payload.cashRegisterId ?? "")];
    if (op.entityType === "order") {
      add("order", op.entityId, op);
      const order = await offlineDb.orders.get(op.entityId);
      if (op.action === "completeOrder") {
        add("invoice", `order_${op.entityId}`, op);
        add("journalEntry", `order_${op.entityId}`, op);
        for (let index = 0; index < (rows?.length ?? (Number(op.payload.paidAmount) > 0 ? 1 : 0)); index++) {
          const id = index === 0 ? `order_${op.entityId}` : `order_${op.entityId}_${index}`;
          add("payment", id, op); add("cashMovement", id, op);
        }
      }
      if (op.action === "cancelOrder" && order?.invoiceId) {
        add("invoice", order.invoiceId, op); add("invoice", `refund_order_${op.entityId}`, op); add("journalEntry", `reverse_order_${op.entityId}`, op);
        const payments = await offlineDb.payments.where("orderId").equals(op.entityId).filter(p => p.restaurantId === tenantId && p.type === "SALE").toArray();
        for (let index = 0; index < payments.length; index++) {
          const id = index === 0 ? `cancel_order_${op.entityId}` : `cancel_order_${op.entityId}_${index}`;
          add("payment", id, op); add("cashMovement", id, op);
          const movement = await offlineDb.cashMovements.get(payments[index].id);
          if (movement?.cashRegisterId) registerIds.push(movement.cashRegisterId);
        }
      }
    } else if (op.entityType === "payment") {
      if (op.payload.expenseId) {
        add("expense", String(op.payload.expenseId), op); add("journalEntry", `expense_${op.entityId}`, op);
        for (let index = 0; index < (rows?.length ?? 0); index++) add("cashMovement", `expense_${op.entityId}_${index}`, op);
      }
      const invoiceId = String(op.payload.invoiceId ?? "");
      add("invoice", invoiceId, op); add("journalEntry", op.entityId, op);
      const invoice = await offlineDb.invoices.get(invoiceId);
      if (invoice?.orderId) add("order", invoice.orderId, op);
      if (invoice?.supplierId) add("supplier", invoice.supplierId, op);
      for (let index = 0; index < (rows?.length ?? 0); index++) {
        const id = index === 0 ? op.entityId : `${op.entityId}_${index}`;
        add("payment", id, op); add("cashMovement", id, op);
      }
    } else if (op.entityType === "expense") {
      add("expense", op.entityId, op); add("journalEntry", `expense_${op.entityId}`, op);
      for (let index = 0; index < (rows?.length ?? 1); index++) add("cashMovement", `expense_${op.entityId}_${index}`, op);
    } else if (op.entityType === "cashMovement") add("cashMovement", op.entityId, op);
    for (const id of registerIds) add("cashRegister", id, op);
  }
  for (const { table, id, op } of patches.values()) {
    if (!table) continue;
    const record = await table.get(id) as Record<string, unknown> | undefined;
    if (!record || record.restaurantId !== tenantId) continue;
    const status = op.status === "synced" ? "synced" : op.status === "conflict" ? "conflict" : op.status === "failed" ? "failed" : "pending";
    await table.put({ ...record, syncStatus: status, syncErrorCode: op.error?.code, syncErrorMessage: op.error?.message } as never);
  }
}
