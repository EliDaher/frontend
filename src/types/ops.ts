export type TableStatus = "AVAILABLE" | "OCCUPIED" | "RESERVED" | "CLEANING" | "DISABLED";
export type OrderStatus = "DRAFT" | "PENDING" | "CONFIRMED" | "PREPARING" | "READY" | "SERVED" | "COMPLETED" | "CANCELLED";
export type OrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY" | "QR";
export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "WALLET" | "SPLIT" | "DEBT";
export type InvoiceType = "SALE" | "PURCHASE" | "REFUND";
export type InvoiceStatus = "UNPAID" | "PARTIAL" | "PAID" | "VOID";
export type InventoryTransactionType = "IN" | "OUT" | "ADJUST" | "REVERSE";

export type OpsTable = {
  id: string;
  name: string;
  area: string;
  capacity: number;
  status: TableStatus;
  currentOrderId: string;
  qrCode: string;
  createdAt?: string;
  updatedAt?: string;
};

export type OpsOrderLine = {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes: string;
  modifiers: string[];
  total: number;
};

export type OpsOrder = {
  id: string;
  name: string;
  tableId: string;
  type: OrderType;
  source: "QR" | "WAITER" | "POS";
  status: OrderStatus;
  items: OpsOrderLine[];
  subTotal: number;
  discount: number;
  tax: number;
  serviceCharge: number;
  total: number;
  paidAmount: number;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  paymentMethod: PaymentMethod;
  notes: string;
  orderedAt?: string;
  invoiceId: string;
  paymentId: string;
  createdAt?: string;
  updatedAt?: string;
};

export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  currentQuantity: number;
  minimumQuantity: number;
  averageCost: number;
  sellPrice: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type InventoryTransaction = {
  id: string;
  inventoryItemId: string;
  type: InventoryTransactionType;
  quantity: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string;
  reason: string;
  createdAt?: string;
};

export type RecipeIngredient = {
  id: string;
  menuItemId: string;
  inventoryItemId: string;
  quantity: number;
  unit: string;
};

export type RecipeDraftLine = {
  inventoryItemId: string;
  quantity: number;
  unit: string;
};

export type Supplier = {
  id: string;
  name: string;
  phone: string;
  balance: number;
  notes: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type InvoiceItem = {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type Invoice = {
  id: string;
  type: InvoiceType;
  status: InvoiceStatus;
  orderId: string;
  supplierId: string;
  items: InvoiceItem[];
  subTotal: number;
  discount: number;
  tax: number;
  serviceCharge: number;
  total: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: PaymentMethod;
  dueDate: string;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Expense = {
  id: string;
  category: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paidAt: string;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
};

export type OperationalPayment = {
  id: string;
  invoiceId: string;
  orderId: string;
  supplierId: string;
  type: InvoiceType;
  amount: number;
  method: PaymentMethod;
  note: string;
  paidAt: string;
  createdAt?: string;
};

export type CashRegister = {
  id: string;
  name: string;
  openingBalance: number;
  currentBalance: number;
  isOpen: boolean;
  openedAt: string;
  closedAt: string;
};

export type CashMovement = {
  id: string;
  cashRegisterId: string;
  type: "IN" | "OUT";
  amount: number;
  referenceType: string;
  referenceId: string;
  note: string;
  createdAt?: string;
};

export type Account = {
  id: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  isActive: boolean;
};

export type JournalEntryLine = {
  accountId: string;
  debit: number;
  credit: number;
  memo: string;
};

export type JournalEntry = {
  id: string;
  status: "DRAFT" | "POSTED" | "REVERSED";
  referenceType: string;
  referenceId: string;
  lines: JournalEntryLine[];
  memo: string;
  postedAt: string;
  createdAt?: string;
};
