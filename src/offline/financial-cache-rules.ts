import type { SyncStatus } from "./schema";

type LocalFinancialRecord = {
  restaurantId?: string;
  syncStatus?: SyncStatus;
};

export function shouldApplyServerFinancialRecordToLocal(local: LocalFinancialRecord | undefined, tenantId: string) {
  if (!local) return true;
  if (local.restaurantId && local.restaurantId !== tenantId) return false;
  return !local.syncStatus || local.syncStatus === "synced";
}

export function shouldTombstoneMissingServerFinancialRecord(local: LocalFinancialRecord | undefined, tenantId: string) {
  if (!local || local.restaurantId !== tenantId) return false;
  return !local.syncStatus || local.syncStatus === "synced";
}

export type PendingCashMovementSnapshot = {
  type: "IN" | "OUT";
  amount: number;
  referenceType?: string;
  syncStatus?: SyncStatus;
};

export function cashMovementAffectsRegisterBalance(movement: Pick<PendingCashMovementSnapshot, "referenceType">) {
  return ["ORDER", "PAYMENT", "ORDER_CANCEL"].includes(movement.referenceType ?? "");
}

export function pendingCashBalanceEffect(movements: PendingCashMovementSnapshot[]) {
  return movements.reduce((sum, movement) => {
    if (!movement.syncStatus || movement.syncStatus === "synced") return sum;
    if (!cashMovementAffectsRegisterBalance(movement)) return sum;
    const amount = numberValue(movement.amount);
    return movement.type === "IN" ? sum + amount : sum - amount;
  }, 0);
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
