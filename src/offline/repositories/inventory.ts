import { adminBackgroundRequest } from "@/lib/api";
import type { MenuItem } from "@/types/menu";
import type { InventoryItem, InventoryTransaction, RecipeIngredient } from "@/types/ops";
import { pendingInventoryEffectsForOrders, shouldApplyServerInventoryRecordToLocal, shouldTombstoneMissingServerInventoryRecord } from "../inventory-cache-rules";
import { offlineDb } from "../db";
import { getDeviceId } from "../device";
import type { SyncStatus } from "../schema";
import type { OfflineContext } from "./tables";

const inventoryRefreshes = new Map<string, Promise<void>>();

export function hydrateInventory(context: OfflineContext) {
  void refreshInventory(context);
}

export function refreshInventory(context: OfflineContext) {
  const current = inventoryRefreshes.get(context.tenantId);
  if (current) return current;

  const refresh = pullInventory(context)
    .catch(() => undefined)
    .finally(() => {
      inventoryRefreshes.delete(context.tenantId);
    });
  inventoryRefreshes.set(context.tenantId, refresh);
  return refresh;
}

export async function listLocalInventoryItems(tenantId: string) {
  return offlineDb.inventoryItems.where("restaurantId").equals(tenantId).filter((item) => !item.deletedAt).toArray();
}

export async function listLocalInventoryTransactions(tenantId: string) {
  const transactions = await offlineDb.inventoryTransactions.where("restaurantId").equals(tenantId).filter((transaction) => !transaction.deletedAt).toArray();
  return transactions.sort((first, second) => String(second.createdAt ?? "").localeCompare(String(first.createdAt ?? "")));
}

export async function getPendingLocalInventoryEffects(tenantId: string) {
  const [orders, recipes, operations] = await Promise.all([
    offlineDb.orders.where("restaurantId").equals(tenantId).filter((order) => !order.deletedAt).toArray(),
    offlineDb.recipeIngredients.where("restaurantId").equals(tenantId).filter((recipe) => !recipe.deletedAt).toArray(),
    offlineDb.syncQueue.where("tenantId").equals(tenantId).filter((operation) => operation.action === "completeOrder" && operation.status !== "synced").toArray()
  ]);
  return pendingInventoryEffectsForOrders({ orders, recipes, operations });
}

async function pullInventory(context: OfflineContext) {
  const now = new Date().toISOString();
  const deviceId = await getDeviceId();
  const [items, transactions, recipes, menuItems] = await Promise.all([
    adminBackgroundRequest<InventoryItem[]>("/api/owner/ops/inventory/items", context.token).catch(() => null),
    adminBackgroundRequest<InventoryTransaction[]>("/api/owner/ops/inventory/transactions", context.token).catch(() => null),
    adminBackgroundRequest<RecipeIngredient[]>("/api/owner/ops/recipes", context.token).catch(() => null),
    adminBackgroundRequest<MenuItem[]>("/api/owner/items", context.token).catch(() => null)
  ]);

  await offlineDb.transaction("rw", [
    offlineDb.inventoryItems,
    offlineDb.inventoryTransactions,
    offlineDb.recipeIngredients,
    offlineDb.menuItems
  ], async () => {
    if (items) await putRemoteRecords(offlineDb.inventoryItems, items, context.tenantId, deviceId, now);
    if (transactions) await putRemoteRecords(offlineDb.inventoryTransactions, transactions, context.tenantId, deviceId, now);
    if (recipes) await putRemoteRecords(offlineDb.recipeIngredients, recipes, context.tenantId, deviceId, now);
    if (menuItems) await putRemoteRecords(offlineDb.menuItems, menuItems, context.tenantId, deviceId, now);
  });
}

async function putRemoteRecords<T extends { id: string }>(
  table: RemoteCacheTable<T>,
  records: T[],
  tenantId: string,
  deviceId: string,
  now: string
) {
  const items = [];
  for (const record of records) {
    const local = await table.get(record.id);
    if (!shouldApplyServerInventoryRecordToLocal(local, tenantId)) continue;
    items.push(localRecord(record, tenantId, deviceId, now));
  }
  if (items.length) await table.bulkPut(items);
  await tombstoneMissingRemoteRecords(table, records, tenantId, deviceId, now);
}

type RemoteCacheRecord<T extends { id: string }> = T & {
  restaurantId?: string;
  syncStatus?: SyncStatus;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

type RemoteCacheTable<T extends { id: string }> = {
  get: (id: string) => Promise<RemoteCacheRecord<T> | undefined>;
  bulkPut: (items: Array<T & ReturnType<typeof localRecord>>) => Promise<unknown>;
  where: (index: "restaurantId") => { equals: (value: string) => { toArray: () => Promise<Array<RemoteCacheRecord<T>>> } };
};

async function tombstoneMissingRemoteRecords<T extends { id: string }>(
  table: RemoteCacheTable<T>,
  records: T[],
  tenantId: string,
  deviceId: string,
  now: string
) {
  const remoteIds = new Set(records.map((record) => record.id));
  const localRecords = await table.where("restaurantId").equals(tenantId).toArray();
  const tombstones = localRecords
    .filter((local) => !remoteIds.has(local.id) && !local.deletedAt && shouldTombstoneMissingServerInventoryRecord(local, tenantId))
    .map((local) => ({
      ...local,
      restaurantId: tenantId,
      deviceId,
      syncStatus: "synced" as const,
      syncErrorCode: undefined,
      syncErrorMessage: undefined,
      deletedAt: now,
      lastSyncedAt: now,
      version: versionFromDates(local.updatedAt, local.createdAt)
    }));
  if (tombstones.length) await table.bulkPut(tombstones);
}

function localRecord<T extends object>(record: T, restaurantId: string, deviceId: string, now: string) {
  const datedRecord = record as { updatedAt?: string; createdAt?: string };
  return {
    ...record,
    restaurantId,
    deviceId,
    syncStatus: "synced" as const,
    syncErrorCode: undefined,
    syncErrorMessage: undefined,
    lastSyncedAt: now,
    version: versionFromDates(datedRecord.updatedAt, datedRecord.createdAt)
  };
}

function versionFromDates(updatedAt?: string, createdAt?: string) {
  const value = Date.parse(updatedAt ?? createdAt ?? "");
  return Number.isFinite(value) ? value : 0;
}
