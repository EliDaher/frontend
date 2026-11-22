import type { Table } from "dexie";
import { businessDay } from "@/lib/business-day";
import { adminRequest, syncPull } from "@/lib/api";
import { offlineDb, tenantMetadataKey } from "./db";
import { notifySyncStatusChanged } from "./outbox";
import type { SyncEntityType } from "./schema";

type RecordData = { id: string; restaurantId?: string; [key: string]: unknown };
// Tables have different document types, but this path only writes complete server documents.
type EntityTable = readonly [SyncEntityType, Table];

export async function reconcileBusinessDay(tenantId: string, token: string, tables: EntityTable[], now = new Date()) {
  const settings = await offlineDb.restaurants.get(tenantId);
  if (!settings) return; // Restaurant settings must be loaded before determining the boundary.
  const today = businessDay(now, settings);
  const key = tenantMetadataKey(tenantId);
  const metadata = await offlineDb.syncMetadata.get(key);
  const isOld = (date: unknown) => {
    const day = businessDay(typeof date === "string" ? date : undefined, settings);
    return Boolean(day && day < today);
  };
  const queue = await offlineDb.syncQueue.where("tenantId").equals(tenantId).toArray();
  const oldPending = queue.some(op => op.status !== "synced" && isOld(op.createdAt));
  if (metadata?.reconciledBusinessDay === today && !oldPending) return;
  if (!metadata?.reconciledBusinessDay && !oldPending && !metadata?.bootstrap?.complete) return;
  await offlineDb.syncMetadata.update(key, { reconcilingBusinessDay: true });
  notifySyncStatusChanged();
  try {
    const staged = new Map<SyncEntityType, Map<string, RecordData>>();
    let cursor: number | undefined;
    for (const [entity] of tables) {
      const records = new Map<string, RecordData>();
      staged.set(entity, records);
      let after: string | undefined;
      while (true) {
        const page = await adminRequest<{ records: RecordData[]; baselineCursor: number; after: string | null; hasMore: boolean }>(
          `/api/owner/sync/snapshot?entity=${entity}${after ? `&after=${encodeURIComponent(after)}` : ""}`, token);
        cursor ??= page.baselineCursor;
        for (const record of page.records) records.set(record.id, record);
        if (!page.hasMore) break;
        if (!page.after || page.after === after) throw new Error("Snapshot cursor did not advance");
        after = page.after;
      }
    }
    let through: number | undefined;
    while (true) {
      const page = await syncPull(token, cursor ?? 0, through);
      through = page.throughCursor;
      for (const change of page.changes) {
        const records = staged.get(change.entityType);
        if (!records) throw new Error("Unsupported sync entity");
        if (change.action === "delete") records.delete(change.entityId);
        else {
          if (!change.data) throw new Error("Missing sync document");
          records.set(change.entityId, { ...change.data, id: change.entityId, version: change.version });
        }
      }
      const more = page.hasMore ?? page.changes.length === 500;
      if (more && page.cursor === cursor) throw new Error("Sync cursor did not advance");
      cursor = page.cursor;
      if (!more) break;
    }
    await offlineDb.transaction("rw", [...tables.map(([, table]) => table), offlineDb.syncQueue, offlineDb.syncConflicts, offlineDb.syncMetadata], async () => {
      // Re-read after the network requests: another tab may have created operations.
      const operations = await offlineDb.syncQueue.where("tenantId").equals(tenantId).toArray();
      const protectedIds = new Set<string>();
      const protectValues = (value: unknown): void => {
        if (typeof value === "string") protectedIds.add(value);
        else if (Array.isArray(value)) value.forEach(protectValues);
        else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => {
          if (key === "id" || key.endsWith("Id") || key.endsWith("Ids") || (item && typeof item === "object")) protectValues(item);
        });
      };
      const retained = new Set(operations.filter(op => op.status !== "synced" && !isOld(op.createdAt)).map(op => op.operationId));
      // Keep prerequisites required by today's operations when absent on the server.
      let changed = true;
      while (changed) {
        changed = false;
        for (const op of operations.filter(op => retained.has(op.operationId))) {
          protectedIds.add(op.entityId);
          protectValues(op.payload);
          for (const id of op.dependencyIds) {
            const dependency = operations.find(item => item.operationId === id);
            if (dependency && dependency.status !== "synced" && !staged.get(dependency.entityType)?.has(dependency.entityId) && !retained.has(id)) {
              retained.add(id); changed = true;
            }
          }
        }
      }
      const local = new Map<SyncEntityType, RecordData[]>();
      for (const [entity, table] of tables) local.set(entity, await table.where("restaurantId").equals(tenantId).toArray());
      // Protect linked artifacts and references transitively, including split payments.
      changed = true;
      while (changed) {
        const before = protectedIds.size;
        for (const records of local.values()) for (const record of records) {
          const linked = [record.orderId, record.invoiceId, record.paymentId, record.referenceId];
          if (protectedIds.has(record.id) || linked.some(id => typeof id === "string" && protectedIds.has(id))) {
            protectedIds.add(record.id); protectValues(record);
          }
        }
        changed = before !== protectedIds.size;
      }
      const discarded = operations.filter(op => op.status !== "synced" && isOld(op.createdAt) && !retained.has(op.operationId));
      const discardedIds = new Set(discarded.map(op => op.operationId));
      for (const [entity, table] of tables) {
        for (const record of local.get(entity)!) {
          if (!protectedIds.has(record.id) && !staged.get(entity)!.has(record.id)) await table.delete(record.id);
        }
        for (const record of staged.get(entity)!.values()) {
          if (!protectedIds.has(record.id)) await table.put({ ...record, restaurantId: tenantId, syncStatus: "synced", lastSyncedAt: now.toISOString() });
        }
      }
      await offlineDb.syncQueue.bulkDelete([...discardedIds]);
      for (const op of operations.filter(op => retained.has(op.operationId))) {
        await offlineDb.syncQueue.put({ ...op, dependencyIds: op.dependencyIds.filter(id => !discardedIds.has(id)) });
      }
      const conflicts = await offlineDb.syncConflicts.where("tenantId").equals(tenantId).toArray();
      await offlineDb.syncConflicts.bulkDelete(conflicts.filter(c => discardedIds.has(c.operationId) || (!protectedIds.has(c.entityId) && isOld(c.createdAt))).map(c => c.id));
      const latest = await offlineDb.syncMetadata.get(key);
      await offlineDb.syncMetadata.put({ ...latest, key, tenantId, lastPullCursor: cursor ?? 0, reconciledBusinessDay: today, reconcilingBusinessDay: false, lastSyncedAt: now.toISOString(),
        bootstrap: { schemaVersion: 1, baselineCursor: cursor ?? 0, entityIndex: tables.length, generation: crypto.randomUUID(), complete: true } });
    });
  } finally {
    await offlineDb.syncMetadata.update(key, { reconcilingBusinessDay: false });
    notifySyncStatusChanged();
  }
}
