type SyncStatus = "synced" | "pending" | "syncing" | "failed" | "conflict";

type LocalHydrationRecord = {
  restaurantId?: string;
  syncStatus?: SyncStatus;
};

type HydrationProtectionSnapshot = {
  tenantId: string;
  local?: LocalHydrationRecord | null;
  hasUnresolvedOperation?: boolean;
  hasUnresolvedConflict?: boolean;
};

const protectedRecordStatuses = new Set<SyncStatus>(["pending", "syncing", "failed", "conflict"]);

export function hasProtectedSyncStatus(status: SyncStatus | undefined) {
  return Boolean(status && protectedRecordStatuses.has(status));
}

export function shouldProtectHydratedRecordSnapshot(input: HydrationProtectionSnapshot) {
  const { tenantId, local, hasUnresolvedOperation, hasUnresolvedConflict } = input;
  if (local && local.restaurantId && local.restaurantId !== tenantId) return true;
  if (hasProtectedSyncStatus(local?.syncStatus)) return true;
  return Boolean(hasUnresolvedOperation || hasUnresolvedConflict);
}
