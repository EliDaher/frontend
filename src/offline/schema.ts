import type { Category, MenuItem, Restaurant, AuthUser } from "@/types/menu";
import type {
  Account,
  CashMovement,
  CashRegister,
  Expense,
  InventoryItem,
  InventoryTransaction,
  Invoice,
  JournalEntry,
  OperationalPayment,
  OpsOrder,
  OpsTable,
  RecipeIngredient,
  Supplier
} from "@/types/ops";

export type SyncStatus = "synced" | "pending" | "syncing" | "failed" | "conflict";

export type SyncEntityType =
  | "table"
  | "order"
  | "inventoryItem"
  | "inventoryTransaction"
  | "recipeIngredient"
  | "supplier"
  | "invoice"
  | "payment"
  | "expense"
  | "cashRegister"
  | "cashMovement"
  | "account"
  | "journalEntry"
  | "category"
  | "menuItem";

export type SyncAction =
  | "create"
  | "update"
  | "delete"
  | "completeOrder"
  | "cancelOrder"
  | "adjustInventory"
  | "saveRecipe";

export type LocalSyncFields = {
  restaurantId: string;
  branchId?: string;
  deviceId?: string;
  createdById?: string;
  deletedAt?: string;
  version?: number;
  syncStatus?: SyncStatus;
  lastSyncedAt?: string;
};

export type LocalRestaurant = Restaurant & Partial<LocalSyncFields>;
export type LocalUser = AuthUser & { id: string; restaurantId?: string; lastSeenAt?: string };
export type LocalCategory = Category & LocalSyncFields;
export type LocalMenuItem = MenuItem & LocalSyncFields;
export type LocalTable = OpsTable & LocalSyncFields;
export type LocalOrder = OpsOrder & LocalSyncFields;
export type LocalInventoryItem = InventoryItem & LocalSyncFields;
export type LocalInventoryTransaction = InventoryTransaction & LocalSyncFields;
export type LocalRecipeIngredient = RecipeIngredient & LocalSyncFields;
export type LocalSupplier = Supplier & LocalSyncFields;
export type LocalInvoice = Invoice & LocalSyncFields;
export type LocalPayment = OperationalPayment & LocalSyncFields;
export type LocalExpense = Expense & LocalSyncFields;
export type LocalCashRegister = CashRegister & LocalSyncFields;
export type LocalCashMovement = CashMovement & LocalSyncFields;
export type LocalAccount = Account & LocalSyncFields;
export type LocalJournalEntry = JournalEntry & LocalSyncFields;

export type SyncQueueError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type SyncQueueItem = {
  operationId: string;
  entityType: SyncEntityType;
  entityId: string;
  action: SyncAction;
  payload: Record<string, unknown>;
  baseVersion?: number;
  tenantId: string;
  branchId?: string;
  deviceId: string;
  userId: string;
  createdAt: string;
  status: SyncStatus;
  retryCount: number;
  nextAttemptAt?: string;
  error?: SyncQueueError;
  dependencyIds: string[];
  lastAttemptAt?: string;
  serverResponse?: Record<string, unknown>;
};

export type SyncMetadata = {
  key: string;
  tenantId: string;
  lastPullCursor: number;
  lastSyncedAt?: string;
  syncInProgress?: boolean;
  syncLeaseUntil?: string;
  syncLeaseOwnerId?: string;
};

export type SyncConflict = {
  id: string;
  operationId: string;
  entityType: SyncEntityType;
  entityId: string;
  tenantId: string;
  message: string;
  localPayload?: Record<string, unknown>;
  serverPayload?: Record<string, unknown>;
  createdAt: string;
  resolvedAt?: string;
};

export type DeviceState = {
  key: "current";
  deviceId: string;
  createdAt: string;
  lastSeenAt: string;
};

export type PushOperation = Pick<
  SyncQueueItem,
  "operationId" | "entityType" | "entityId" | "action" | "payload" | "baseVersion" | "dependencyIds"
> & {
  clientCreatedAt: string;
};

export type PushResult = {
  operationId: string;
  status: "applied" | "duplicate" | "rejected" | "conflict";
  entityType: SyncEntityType;
  entityId: string;
  serverVersion?: number;
  serverCursor?: number;
  response?: Record<string, unknown>;
  error?: SyncQueueError;
};

export type PullChange = {
  cursor: number;
  entityType: SyncEntityType;
  entityId: string;
  action: "upsert" | "delete";
  version: number;
  changedAt: string;
  data?: Record<string, unknown>;
};
