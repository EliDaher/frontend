import { adminRequest } from "@/lib/api";
import type { Category, MenuItem } from "@/types/menu";
import type { CashRegister, RecipeIngredient } from "@/types/ops";
import { offlineDb } from "../db";
import { getDeviceId } from "../device";
import type { OfflineContext } from "./tables";

export async function hydrateReferenceData(context: OfflineContext, modules?: { inventory?: boolean; accounting?: boolean }) {
  const now = new Date().toISOString();
  const deviceId = await getDeviceId();

  const [menuItems, categories, recipes, cashRegisters] = await Promise.all([
    adminRequest<MenuItem[]>("/api/owner/items", context.token).catch(() => null),
    adminRequest<Category[]>("/api/owner/categories", context.token).catch(() => null),
    modules?.inventory ? adminRequest<RecipeIngredient[]>("/api/owner/ops/recipes", context.token).catch(() => null) : Promise.resolve(null),
    modules?.accounting ? adminRequest<CashRegister[]>("/api/owner/ops/cash/registers", context.token).catch(() => null) : Promise.resolve(null)
  ]);

  await offlineDb.transaction("rw", offlineDb.menuItems, offlineDb.categories, offlineDb.recipeIngredients, offlineDb.cashRegisters, async () => {
    if (menuItems) {
      await offlineDb.menuItems.bulkPut(menuItems.map((item) => ({
        ...item,
        restaurantId: context.tenantId,
        deviceId,
        syncStatus: "synced" as const,
        lastSyncedAt: now,
        version: versionFromDates(item.updatedAt, item.createdAt)
      })));
    }

    if (categories) {
      await offlineDb.categories.bulkPut(categories.map((category) => ({
        ...category,
        restaurantId: context.tenantId,
        deviceId,
        syncStatus: "synced" as const,
        lastSyncedAt: now,
        version: 0
      })));
    }

    if (recipes) {
      await offlineDb.recipeIngredients.bulkPut(recipes.map((recipe) => ({
        ...recipe,
        restaurantId: context.tenantId,
        deviceId,
        syncStatus: "synced" as const,
        lastSyncedAt: now,
        version: versionFromUnknownDates(recipe)
      })));
    }

    if (cashRegisters) {
      await offlineDb.cashRegisters.bulkPut(cashRegisters.map((register) => ({
        ...register,
        restaurantId: context.tenantId,
        deviceId,
        syncStatus: "synced" as const,
        lastSyncedAt: now,
        version: versionFromUnknownDates(register)
      })));
    }
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

function versionFromUnknownDates(value: unknown) {
  const record = value as { updatedAt?: string; createdAt?: string };
  return versionFromDates(record.updatedAt, record.createdAt);
}
