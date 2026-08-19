import Dexie, { type Table } from "dexie";
import type {
  DeviceState,
  LocalAccount,
  LocalCashMovement,
  LocalCashRegister,
  LocalCategory,
  LocalExpense,
  LocalInventoryItem,
  LocalInventoryTransaction,
  LocalInvoice,
  LocalJournalEntry,
  LocalMenuItem,
  LocalOrder,
  LocalPayment,
  LocalRecipeIngredient,
  LocalRestaurant,
  LocalSupplier,
  LocalTable,
  LocalUser,
  SyncConflict,
  SyncMetadata,
  SyncQueueItem
} from "./schema";

class OfflineDatabase extends Dexie {
  restaurants!: Table<LocalRestaurant, string>;
  categories!: Table<LocalCategory, string>;
  menuItems!: Table<LocalMenuItem, string>;
  users!: Table<LocalUser, string>;
  opsTables!: Table<LocalTable, string>;
  orders!: Table<LocalOrder, string>;
  inventoryItems!: Table<LocalInventoryItem, string>;
  inventoryTransactions!: Table<LocalInventoryTransaction, string>;
  recipeIngredients!: Table<LocalRecipeIngredient, string>;
  suppliers!: Table<LocalSupplier, string>;
  invoices!: Table<LocalInvoice, string>;
  payments!: Table<LocalPayment, string>;
  expenses!: Table<LocalExpense, string>;
  cashRegisters!: Table<LocalCashRegister, string>;
  cashMovements!: Table<LocalCashMovement, string>;
  accounts!: Table<LocalAccount, string>;
  journalEntries!: Table<LocalJournalEntry, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  syncMetadata!: Table<SyncMetadata, string>;
  syncConflicts!: Table<SyncConflict, string>;
  deviceState!: Table<DeviceState, string>;

  constructor() {
    super("restaurant-ops-offline");
    this.version(1).stores({
      restaurants: "&id, slug, syncStatus, updatedAt",
      categories: "&id, restaurantId, syncStatus, updatedAt, deletedAt",
      menuItems: "&id, restaurantId, categoryId, syncStatus, updatedAt, deletedAt",
      users: "&id, restaurantId, email",
      tables: "&id, restaurantId, status, currentOrderId, syncStatus, updatedAt, deletedAt",
      orders: "&id, restaurantId, tableId, status, syncStatus, updatedAt, deletedAt",
      inventoryItems: "&id, restaurantId, syncStatus, updatedAt, deletedAt",
      inventoryTransactions: "&id, restaurantId, inventoryItemId, referenceId, syncStatus, createdAt",
      recipeIngredients: "&id, restaurantId, menuItemId, inventoryItemId, syncStatus, updatedAt, deletedAt",
      suppliers: "&id, restaurantId, syncStatus, updatedAt, deletedAt",
      invoices: "&id, restaurantId, orderId, supplierId, status, syncStatus, updatedAt, deletedAt",
      payments: "&id, restaurantId, invoiceId, orderId, supplierId, syncStatus, createdAt",
      expenses: "&id, restaurantId, syncStatus, paidAt, createdAt, deletedAt",
      cashRegisters: "&id, restaurantId, syncStatus, updatedAt, deletedAt",
      cashMovements: "&id, restaurantId, cashRegisterId, referenceId, syncStatus, createdAt",
      accounts: "&id, restaurantId, code, syncStatus, updatedAt, deletedAt",
      journalEntries: "&id, restaurantId, referenceId, status, syncStatus, createdAt",
      syncQueue: "&operationId, tenantId, entityType, entityId, status, nextAttemptAt, createdAt",
      syncMetadata: "&key, tenantId",
      syncConflicts: "&id, tenantId, operationId, entityType, entityId, resolvedAt",
      deviceState: "&key, deviceId"
    });
    this.opsTables = this.table("tables");
  }
}

export const offlineDb = new OfflineDatabase();

export function tenantMetadataKey(tenantId: string) {
  return `tenant:${tenantId}`;
}
