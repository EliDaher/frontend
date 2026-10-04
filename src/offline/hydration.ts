import { offlineDb } from "./db";
import { shouldProtectHydratedRecordSnapshot } from "./hydration-rules";
import type { SyncEntityType } from "./schema";

type HydrationProtectionInput = {
  tenantId: string;
  entityType: SyncEntityType;
  entityId: string;
  local?: {
    restaurantId?: string;
    syncStatus?: "synced" | "pending" | "syncing" | "failed" | "conflict";
  } | null;
};

export async function shouldProtectHydratedRecord(input: HydrationProtectionInput) {
  const { tenantId, entityType, entityId, local } = input;
  const queueItems = await offlineDb.syncQueue
    .where("[tenantId+entityType+entityId]")
    .equals([tenantId, entityType, entityId])
    .filter((item) => item.status !== "synced")
    .toArray();
  if (queueItems.length > 0) return true;

  const conflicts = await offlineDb.syncConflicts
    .where("[tenantId+entityType+entityId]")
    .equals([tenantId, entityType, entityId])
    .filter((conflict) => !conflict.resolvedAt)
    .toArray();
  return shouldProtectHydratedRecordSnapshot({
    tenantId,
    local,
    hasUnresolvedOperation: queueItems.length > 0,
    hasUnresolvedConflict: conflicts.length > 0
  });
}
