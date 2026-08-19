import { offlineDb, tenantMetadataKey } from "./db";
import { createOperationId, getDeviceId } from "./device";
import type { SyncAction, SyncEntityType, SyncQueueItem } from "./schema";

const staleSyncingMs = 45_000;

export type SyncQueueIssue = {
  operationId: string;
  entityType: SyncEntityType;
  entityId: string;
  action: SyncAction;
  status: SyncQueueItem["status"];
  entityLabel: string;
  code: string;
  message: string;
  retryable: boolean;
  retryCount: number;
  createdAt: string;
  lastAttemptAt?: string;
  dependencyIds: string[];
  blockedBy: string[];
};

export type QueueOperationInput = {
  entityType: SyncEntityType;
  entityId: string;
  action: SyncAction;
  payload: Record<string, unknown>;
  tenantId: string;
  userId: string;
  baseVersion?: number;
  branchId?: string;
  dependencyIds?: string[];
};

export async function queueOperation(input: QueueOperationInput) {
  const now = new Date().toISOString();
  const deviceId = await getDeviceId();
  const existingDependencies = await unsyncedDependenciesFor(input);
  const item: SyncQueueItem = {
    operationId: createOperationId(),
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    payload: input.payload,
    baseVersion: input.baseVersion,
    tenantId: input.tenantId,
    branchId: input.branchId,
    deviceId,
    userId: input.userId,
    createdAt: now,
    status: "pending",
    retryCount: 0,
    dependencyIds: [...new Set([...(input.dependencyIds ?? []), ...existingDependencies])]
  };

  await offlineDb.syncQueue.add(item);
  notifySyncStatusChanged();
  return item;
}

export async function pendingOperations(tenantId: string, limit = 25) {
  await recoverStaleSyncingOperations(tenantId);
  const now = new Date().toISOString();
  const items = await offlineDb.syncQueue
    .where("tenantId")
    .equals(tenantId)
    .filter((item) => {
      if (!["pending", "failed"].includes(item.status)) return false;
      if (item.status === "failed" && item.error?.retryable === false) return false;
      return !item.nextAttemptAt || item.nextAttemptAt <= now;
    })
    .sortBy("createdAt");

  const dependencyIds = [...new Set(items.flatMap((item) => item.dependencyIds))];
  const dependencies = dependencyIds.length ? await offlineDb.syncQueue.bulkGet(dependencyIds) : [];
  const dependencyStatus = new Map(dependencies.filter(Boolean).map((item) => [item!.operationId, item!.status]));

  return items
    .filter((item) => item.dependencyIds.every((dependencyId) => dependencyStatus.get(dependencyId) === "synced"))
    .slice(0, limit);
}

export async function syncQueueSummary(tenantId?: string) {
  if (tenantId) await recoverStaleSyncingOperations(tenantId);
  const collection = tenantId ? offlineDb.syncQueue.where("tenantId").equals(tenantId) : offlineDb.syncQueue.toCollection();
  const items = await collection.toArray();
  const issues = await syncQueueIssues(tenantId);
  const syncInProgress = tenantId ? await activeSyncLease(tenantId) : false;
  const recentSyncing = items.filter((item) => item.status === "syncing" && !isStaleSyncing(item)).length;
  return {
    pending: items.filter((item) => item.status === "pending").length,
    syncing: recentSyncing,
    failed: items.filter((item) => item.status === "failed").length,
    conflict: items.filter((item) => item.status === "conflict").length,
    totalWaiting: items.filter((item) => ["pending", "failed", "conflict"].includes(item.status)).length,
    issues,
    syncInProgress
  };
}

export async function syncQueueIssues(tenantId?: string, limit = 8): Promise<SyncQueueIssue[]> {
  if (tenantId) await recoverStaleSyncingOperations(tenantId);
  const collection = tenantId ? offlineDb.syncQueue.where("tenantId").equals(tenantId) : offlineDb.syncQueue.toCollection();
  const items = await collection.toArray();
  const problemItems = items
    .filter((item) => ["failed", "conflict"].includes(item.status) || hasBlockedDependency(item, items))
    .sort((first, second) => String(second.lastAttemptAt ?? second.createdAt).localeCompare(String(first.lastAttemptAt ?? first.createdAt)))
    .slice(0, limit);

  return Promise.all(problemItems.map((item) => toIssue(item, items)));
}

export async function retryFailedOperations(tenantId?: string) {
  if (tenantId) await recoverStaleSyncingOperations(tenantId, true);
  const collection = tenantId ? offlineDb.syncQueue.where("tenantId").equals(tenantId) : offlineDb.syncQueue.toCollection();
  const items = await collection
    .filter((item) => item.status === "failed" && item.error?.retryable !== false)
    .toArray();
  if (!items.length) return 0;

  await offlineDb.syncQueue.bulkPut(items.map((item) => ({
    ...item,
    status: "pending" as const,
    nextAttemptAt: undefined
  })));
  notifySyncStatusChanged();
  return items.length;
}

export async function recoverStaleSyncingOperations(tenantId: string, force = false) {
  const items = await offlineDb.syncQueue
    .where("tenantId")
    .equals(tenantId)
    .filter((item) => item.status === "syncing" && (force || isStaleSyncing(item)))
    .toArray();
  if (!items.length) return 0;

  const now = new Date().toISOString();
  await offlineDb.syncQueue.bulkPut(items.map((item) => ({
    ...item,
    status: "failed" as const,
    error: {
      code: "stale_sync",
      message: "انقطعت المزامنة قبل اكتمال الحفظ، ستتم إعادة المحاولة.",
      retryable: true
    },
    nextAttemptAt: undefined,
    lastAttemptAt: item.lastAttemptAt ?? now
  })));
  notifySyncStatusChanged();
  return items.length;
}

export function notifySyncStatusChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("restaurant-sync-status-changed"));
  }
}

export function nextRetryTime(retryCount: number) {
  const delayMs = Math.min(30_000, 1_000 * 2 ** Math.min(retryCount, 5));
  return new Date(Date.now() + delayMs).toISOString();
}

async function unsyncedDependenciesFor(input: QueueOperationInput) {
  const existing = await offlineDb.syncQueue
    .where("tenantId")
    .equals(input.tenantId)
    .filter((item) => {
      if (item.entityType !== input.entityType || item.entityId !== input.entityId) return false;
      return item.status !== "synced";
    })
    .toArray();
  return existing.map((item) => item.operationId);
}

function hasBlockedDependency(item: SyncQueueItem, items: SyncQueueItem[]) {
  if (!item.dependencyIds.length || item.status !== "pending") return false;
  const byId = new Map(items.map((entry) => [entry.operationId, entry]));
  return item.dependencyIds.some((dependencyId) => {
    const dependency = byId.get(dependencyId);
    return dependency?.status === "failed" || dependency?.status === "conflict";
  });
}

function isStaleSyncing(item: SyncQueueItem) {
  const lastAttempt = Date.parse(item.lastAttemptAt ?? item.createdAt);
  if (!Number.isFinite(lastAttempt)) return true;
  return Date.now() - lastAttempt > staleSyncingMs;
}

async function activeSyncLease(tenantId: string) {
  const metadata = await offlineDb.syncMetadata.get(tenantMetadataKey(tenantId));
  if (!metadata?.syncInProgress || !metadata.syncLeaseUntil) return false;
  return metadata.syncLeaseUntil > new Date().toISOString();
}

async function toIssue(item: SyncQueueItem, items: SyncQueueItem[]): Promise<SyncQueueIssue> {
  const blockedBy = item.dependencyIds.filter((dependencyId) => {
    const dependency = items.find((entry) => entry.operationId === dependencyId);
    return dependency?.status === "failed" || dependency?.status === "conflict";
  });
  const entityLabel = await localEntityLabel(item);
  const blocked = blockedBy.length > 0 && item.status === "pending";
  return {
    operationId: item.operationId,
    entityType: item.entityType,
    entityId: item.entityId,
    action: item.action,
    status: item.status,
    entityLabel,
    code: blocked ? "blocked_dependency" : item.error?.code ?? "unknown_error",
    message: blocked ? "بانتظار حل عملية سابقة على نفس الطلب أو الطاولة." : item.error?.message ?? "فشلت المزامنة بدون رسالة تفصيلية.",
    retryable: blocked ? false : item.error?.retryable !== false,
    retryCount: item.retryCount,
    createdAt: item.createdAt,
    lastAttemptAt: item.lastAttemptAt,
    dependencyIds: item.dependencyIds,
    blockedBy
  };
}

async function localEntityLabel(item: SyncQueueItem) {
  if (item.entityType === "order") {
    const order = await offlineDb.orders.get(item.entityId);
    return order?.name || order?.id || item.entityId;
  }
  if (item.entityType === "table") {
    const table = await offlineDb.opsTables.get(item.entityId);
    return table?.name || table?.id || item.entityId;
  }
  return item.entityId;
}
