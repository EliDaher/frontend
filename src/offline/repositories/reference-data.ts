import { adminBackgroundRequest } from "@/lib/api";
import type { Category, MenuItem } from "@/types/menu";
import type { CashRegister, RecipeIngredient } from "@/types/ops";
import { offlineDb } from "../db";
import { getDeviceId } from "../device";
import { shouldApplyServerInventoryRecordToLocal, shouldTombstoneMissingServerInventoryRecord } from "../inventory-cache-rules";
import type { SyncStatus } from "../schema";
import type { OfflineContext } from "./tables";

const referenceRefreshes = new Map<string, Promise<void>>();

export async function hydrateReferenceData(context: OfflineContext, modules?: { inventory?: boolean; accounting?: boolean }) {
  void refreshReferenceData(context, modules);
}

export function refreshReferenceData(context: OfflineContext, modules?: { inventory?: boolean; accounting?: boolean }) {
  const key = `${context.tenantId}:${modules?.inventory ? "inventory" : ""}:${modules?.accounting ? "accounting" : ""}`;
  const current = referenceRefreshes.get(key);
  if (current) return current;

  const refresh = pullReferenceData(context, modules)
    .catch(() => undefined)
    .finally(() => {
      referenceRefreshes.delete(key);
    });
  referenceRefreshes.set(key, refresh);
  return refresh;
}

async function pullReferenceData(context: OfflineContext, modules?: { inventory?: boolean; accounting?: boolean }) {
  const now = new Date().toISOString();
  const deviceId = await getDeviceId();

  const [menuItems, categories, recipes, cashRegisters] = await Promise.all([
    adminBackgroundRequest<MenuItem[]>("/api/owner/items", context.token).catch(() => null),
    adminBackgroundRequest<Category[]>("/api/owner/categories", context.token).catch(() => null),
    modules?.inventory ? adminBackgroundRequest<RecipeIngredient[]>("/api/owner/ops/recipes", context.token).catch(() => null) : Promise.resolve(null),
    modules?.accounting ? adminBackgroundRequest<CashRegister[]>("/api/owner/ops/cash/registers", context.token).catch(() => null) : Promise.resolve(null)
  ]);

  await offlineDb.transaction("rw", offlineDb.menuItems, offlineDb.categories, offlineDb.recipeIngredients, offlineDb.cashRegisters, async () => {
    if (menuItems) await putRemoteReferenceRecords(offlineDb.menuItems, menuItems, context.tenantId, deviceId, now);
    if (categories) await putRemoteReferenceRecords(offlineDb.categories, categories, context.tenantId, deviceId, now);
    if (recipes) await putRemoteReferenceRecords(offlineDb.recipeIngredients, recipes, context.tenantId, deviceId, now);
    if (cashRegisters) await putRemoteReferenceRecords(offlineDb.cashRegisters, cashRegisters, context.tenantId, deviceId, now);
  });
}

export async function listLocalMenuItems(tenantId: string) {
  return offlineDb.menuItems.where("restaurantId").equals(tenantId).filter((item) => !item.deletedAt).toArray();
}

export async function listLocalCategories(tenantId: string) {
  return offlineDb.categories.where("restaurantId").equals(tenantId).filter((category) => !category.deletedAt).toArray();
}

export async function listLocalRecipeIngredients(tenantId: string) {
  return offlineDb.recipeIngredients.where("restaurantId").equals(tenantId).filter((recipe) => !recipe.deletedAt).toArray();
}

export async function listLocalCashRegisters(tenantId: string) {
  return offlineDb.cashRegisters.where("restaurantId").equals(tenantId).filter((register) => !register.deletedAt).toArray();
}

function versionFromDates(updatedAt?: string, createdAt?: string) {
  const value = Date.parse(updatedAt ?? createdAt ?? "");
  return Number.isFinite(value) ? value : 0;
}

async function putRemoteReferenceRecords<T extends { id: string }>(
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
    lastSyncedAt: now,
    version: versionFromDates(datedRecord.updatedAt, datedRecord.createdAt)
  };
}
