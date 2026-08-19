import { syncPull, syncPush } from "@/lib/api";
import { offlineDb, tenantMetadataKey } from "./db";
import { getDeviceId } from "./device";
import { nextRetryTime, notifySyncStatusChanged, pendingOperations, recoverStaleSyncingOperations } from "./outbox";
import type { PullChange, PushOperation, PushResult, SyncQueueItem } from "./schema";

const syncLeaseMs = 60_000;
const maxPushBatches = 10;
const channelName = "restaurant-ops-sync";
let running = false;
let channel: BroadcastChannel | null = null;

function getChannel() {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(channelName);
  }
  return channel;
}

export async function startSync(tenantId: string, token: string) {
  if (!tenantId || !token || running) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await recoverStaleSyncingOperations(tenantId);
    notifySyncStatusChanged();
    return;
  }
  running = true;
  let leaseAcquired = false;
  const leaseOwnerId = await getDeviceId();
  try {
    await recoverStaleSyncingOperations(tenantId);
    leaseAcquired = await acquireSyncLease(tenantId, leaseOwnerId);
    if (!leaseAcquired) return;

    getChannel()?.postMessage({ type: "sync-started", tenantId });
    notifySyncStatusChanged();

    for (let index = 0; index < maxPushBatches; index += 1) {
      await refreshSyncLease(tenantId, leaseOwnerId);
      const pushed = await pushPendingOperations(tenantId, token);
      if (pushed === 0) break;
    }
    await refreshSyncLease(tenantId, leaseOwnerId);
    await pullServerChanges(tenantId, token);
  } finally {
    if (leaseAcquired) await releaseSyncLease(tenantId, leaseOwnerId);
    running = false;
    getChannel()?.postMessage({ type: "sync-finished", tenantId });
    notifySyncStatusChanged();
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
    const message = error instanceof Error ? error.message : "Sync request failed";
    await offlineDb.syncQueue.bulkPut(operations.map((operation) => markRetryableFailure(operation, message)));
    notifySyncStatusChanged();
  }

  return operations.length;
}

async function applyPushResults(operations: SyncQueueItem[], results: PushResult[]) {
  const byId = new Map(results.map((result) => [result.operationId, result]));
  const now = new Date().toISOString();
  const updates: SyncQueueItem[] = [];

  for (const operation of operations) {
    const result = byId.get(operation.operationId);
    if (!result) {
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
      await offlineDb.syncConflicts.put({
        id: `${operation.operationId}:${operation.entityId}`,
        operationId: operation.operationId,
        entityType: operation.entityType,
        entityId: operation.entityId,
        tenantId: operation.tenantId,
        message: result.error?.message ?? "Sync conflict",
        localPayload: operation.payload,
        serverPayload: result.response,
        createdAt: now
      });
      continue;
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
    if (!order) return;
    await offlineDb.orders.put({
      ...order,
      ...(result.response ?? {}),
      version: result.serverVersion ?? order.version,
      syncStatus: "synced",
      lastSyncedAt: now
    });
    if (operation.action === "completeOrder") {
      await markOrderCompletionArtifactsSynced(operation.entityId, result, now);
    }
  }
}

async function markOrderCompletionArtifactsSynced(orderId: string, result: PushResult, now: string) {
  const invoiceId = String(result.response?.invoiceId ?? `order_${orderId}`);
  const paymentId = String(result.response?.paymentId ?? "");
  const movementId = `order_${orderId}`;
  const journalId = `order_${orderId}`;

  const invoice = await offlineDb.invoices.get(invoiceId);
  if (invoice) await offlineDb.invoices.put({ ...invoice, syncStatus: "synced", lastSyncedAt: now, version: result.serverVersion ?? invoice.version });

  if (paymentId) {
    const payment = await offlineDb.payments.get(paymentId);
    if (payment) await offlineDb.payments.put({ ...payment, syncStatus: "synced", lastSyncedAt: now, version: result.serverVersion ?? payment.version });
  }

  const movement = await offlineDb.cashMovements.get(movementId);
  if (movement) await offlineDb.cashMovements.put({ ...movement, syncStatus: "synced", lastSyncedAt: now, version: result.serverVersion ?? movement.version });

  const journal = await offlineDb.journalEntries.get(journalId);
  if (journal) await offlineDb.journalEntries.put({ ...journal, syncStatus: "synced", lastSyncedAt: now, version: result.serverVersion ?? journal.version });
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
  const current = await table.get(change.entityId) as { syncStatus?: string } | undefined;
  if (current?.syncStatus === "pending" || current?.syncStatus === "syncing") return;
  await table.put({
    ...(change.data as Record<string, unknown>),
    id: change.entityId,
    restaurantId: tenantId,
    version: change.version,
    syncStatus: "synced",
    lastSyncedAt: new Date().toISOString()
  } as never);
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
