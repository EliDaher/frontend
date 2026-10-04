import type { OpsOrder, RecipeIngredient } from "@/types/ops";
import type { SyncAction, SyncEntityType, SyncStatus } from "./schema";

type LocalSyncRecord = {
  restaurantId?: string;
  syncStatus?: SyncStatus;
};

export function shouldApplyServerInventoryRecordToLocal(local: LocalSyncRecord | undefined, tenantId: string) {
  if (!local) return true;
  if (local.restaurantId && local.restaurantId !== tenantId) return false;
  return !local.syncStatus || local.syncStatus === "synced";
}

export function shouldTombstoneMissingServerInventoryRecord(local: LocalSyncRecord | undefined, tenantId: string) {
  if (!local || local.restaurantId !== tenantId) return false;
  return !local.syncStatus || local.syncStatus === "synced";
}

export type PendingInventoryOperation = {
  entityType: SyncEntityType;
  entityId: string;
  action: SyncAction;
  status?: SyncStatus;
};

export type PendingInventoryEffects = {
  byInventoryItemId: Record<string, number>;
  pendingCompletionCount: number;
  unknownOrderCount: number;
  unknownRecipeCount: number;
};

export function pendingInventoryEffectsForOrders({
  orders,
  recipes,
  operations
}: {
  orders: Array<Pick<OpsOrder, "id" | "items">>;
  recipes: Array<Pick<RecipeIngredient, "menuItemId" | "inventoryItemId" | "quantity">>;
  operations: PendingInventoryOperation[];
}): PendingInventoryEffects {
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const recipesByMenuItemId = new Map<string, Array<Pick<RecipeIngredient, "inventoryItemId" | "quantity">>>();
  const byInventoryItemId = new Map<string, number>();
  let pendingCompletionCount = 0;
  let unknownOrderCount = 0;
  let unknownRecipeCount = 0;

  for (const recipe of recipes) {
    const current = recipesByMenuItemId.get(recipe.menuItemId) ?? [];
    current.push(recipe);
    recipesByMenuItemId.set(recipe.menuItemId, current);
  }

  for (const operation of operations) {
    if (operation.entityType !== "order" || operation.action !== "completeOrder" || operation.status === "synced") continue;
    pendingCompletionCount += 1;
    const order = ordersById.get(operation.entityId);
    if (!order) {
      unknownOrderCount += 1;
      continue;
    }

    for (const line of order.items) {
      const recipeLines = recipesByMenuItemId.get(line.menuItemId);
      if (!recipeLines?.length) {
        unknownRecipeCount += 1;
        continue;
      }

      for (const recipe of recipeLines) {
        const deduction = numberValue(recipe.quantity) * numberValue(line.quantity);
        byInventoryItemId.set(recipe.inventoryItemId, numberValue(byInventoryItemId.get(recipe.inventoryItemId)) + deduction);
      }
    }
  }

  return {
    byInventoryItemId: Object.fromEntries(byInventoryItemId.entries()),
    pendingCompletionCount,
    unknownOrderCount,
    unknownRecipeCount
  };
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
