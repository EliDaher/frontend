import { tryIncrementalRefresh } from "../sync-engine";
import { normalizeSettlement, normalizeMoney, type PaymentPart, type SettlementMode, type MoneyInput } from "@/lib/payments";
import { adminBackgroundRequest } from "@/lib/api";
import type { Account, CashMovement, CashRegister, Expense, JournalEntry, OperationalPayment } from "@/types/ops";
import { offlineDb } from "../db";
import { createLocalEntityId, createOperationId, getDeviceId } from "../device";
import { pendingCashBalanceEffect, shouldApplyServerFinancialRecordToLocal, shouldTombstoneMissingServerFinancialRecord } from "../financial-cache-rules";
import type { LocalCashMovement, LocalExpense, SyncQueueItem, SyncStatus } from "../schema";
import { queueOperation, notifySyncStatusChanged } from "../outbox";
import { startSync } from "../sync-engine";
import type { OfflineContext } from "./tables";

const financialRefreshes = new Map<string, Promise<void>>();

export function hydrateFinancialHistory(context: OfflineContext) {
  void refreshFinancialHistory(context);
}

export function refreshFinancialHistory(context: OfflineContext) {
  const current = financialRefreshes.get(context.tenantId);
  if (current) return current;

  const refresh = pullFinancialHistory(context)
    .catch(() => undefined)
    .finally(() => {
      financialRefreshes.delete(context.tenantId);
    });
  financialRefreshes.set(context.tenantId, refresh);
  return refresh;
}

export async function listLocalAccounts(tenantId: string) {
  return offlineDb.accounts.where("restaurantId").equals(tenantId).filter((account) => !account.deletedAt).toArray();
}

export async function listLocalJournalEntries(tenantId: string) {
  return offlineDb.journalEntries.where("restaurantId").equals(tenantId).filter((entry) => !entry.deletedAt).toArray();
}

export async function listLocalCashRegisters(tenantId: string) {
  return offlineDb.cashRegisters.where("restaurantId").equals(tenantId).filter((register) => !register.deletedAt).toArray();
}

export async function listLocalCashMovements(tenantId: string) {
  return offlineDb.cashMovements.where("restaurantId").equals(tenantId).filter((movement) => !movement.deletedAt).toArray();
}

export async function listLocalPayments(tenantId: string) {
  return offlineDb.payments.where("restaurantId").equals(tenantId).filter((payment) => !payment.deletedAt).toArray();
}

export async function listLocalExpenses(tenantId: string) {
  return offlineDb.expenses.where("restaurantId").equals(tenantId).filter((expense) => !expense.deletedAt).toArray();
}

export type ExpenseCreateInput = MoneyInput & {
  payments?: PaymentPart[];
  settlementMode?: SettlementMode;
  cashRegisterId?: string;
  category: string;
  amount: number;
  paymentMethod: Expense["paymentMethod"];
  paidAt?: string;
  notes: string;
};

export async function createLocalExpense(context: OfflineContext, input: ExpenseCreateInput) {
  await assertLocalPaymentContext(context, input);
  input = normalizeMoney(input);
  const category = input.category.trim();
  const amount = numberValue(input.amount);
  if (!category) throw new Error("أدخل فئة المصروف.");
  if (amount <= 0) throw new Error("أدخل مبلغًا صحيحًا للمصروف.");

  const settlement = input.payments !== undefined ? normalizeSettlement(amount, input.settlementMode ?? "FULL", input.payments) : null;
  const now = new Date().toISOString();
  const deviceId = await getDeviceId();
  const expenseId = createLocalEntityId("expense");
  const paidAt = input.paidAt || now;
  const payload: ExpenseCreateInput & { paidAt: string } = {
    ...input,
    category,
    amount,
    paymentMethod: input.paymentMethod || "CASH",
    paidAt,
    notes: input.notes.trim()
  };
  const expense: LocalExpense = {
    id: expenseId,
    restaurantId: context.tenantId,
    ...payload,
    payments: settlement?.payments,
    ...(settlement ? { paidAmount: settlement.paidAmount, remainingAmount: settlement.remainingAmount } : {}),
    category: payload.category,
    amount: payload.amount,
    paymentMethod: payload.paymentMethod,
    paidAt: payload.paidAt,
    notes: payload.notes,
    createdAt: now,
    updatedAt: now,
    createdById: context.userId,
    deviceId,
    syncStatus: "pending",
    version: 0
  };
  const operation: SyncQueueItem = {
    operationId: createOperationId(),
    entityType: "expense",
    entityId: expenseId,
    action: "create",
    payload: payload as unknown as Record<string, unknown>,
    tenantId: context.tenantId,
    deviceId,
    userId: context.userId,
    createdAt: now,
    status: "pending",
    retryCount: 0,
    dependencyIds: []
  };

  await offlineDb.transaction("rw", [offlineDb.expenses, offlineDb.cashMovements, offlineDb.cashRegisters, offlineDb.journalEntries, offlineDb.syncQueue], async () => {
    const rows = settlement?.payments ?? [{ amount, method: input.paymentMethod, cashRegisterId: input.cashRegisterId ?? "", ...(input.currency ? { currency: input.currency, originalAmount: input.originalAmount, exchangeRate: input.exchangeRate } : {}) }];
    for (const [index, row] of rows.entries()) {
      await offlineDb.cashMovements.put({ ...row, id: `expense_${expenseId}_${index}`, restaurantId: context.tenantId, type: "OUT", referenceType: "EXPENSE", referenceId: expenseId, note: input.notes, createdAt: now, syncStatus: "pending" });
      if (row.cashRegisterId) {
        const register = await offlineDb.cashRegisters.get(row.cashRegisterId);
        if (!register || register.restaurantId !== context.tenantId) throw new Error("الصندوق غير موجود.");
        await offlineDb.cashRegisters.put({ ...register, currentBalance: register.currentBalance - row.amount, syncStatus: "pending" });
      }
    }
    const paid = settlement?.paidAmount ?? amount;
    const remaining = amount - paid;
    await offlineDb.journalEntries.put({ id: `expense_${expenseId}`, restaurantId: context.tenantId, status: "POSTED", referenceType: "EXPENSE", referenceId: expenseId, lines: [{ accountId: "expenses", debit: amount, credit: 0, memo: input.notes }, ...(paid ? [{ accountId: "cash", debit: 0, credit: paid, memo: input.notes }] : []), ...(remaining ? [{ accountId: "accounts_payable", debit: 0, credit: remaining, memo: input.notes }] : [])], memo: input.notes, postedAt: now, createdAt: now, syncStatus: "pending" });
    await offlineDb.expenses.put(expense);
    await offlineDb.syncQueue.add(operation);
  });
  notifySyncStatusChanged();
  void startSync(context.tenantId, context.token);
  return expense;
}

export type CashMovementCreateInput = MoneyInput & {
  method?: "CASH" | "SHAM_CASH";
  cashRegisterId: string;
  type: CashMovement["type"];
  amount: number;
  referenceType?: string;
  referenceId?: string;
  note: string;
};

export async function createLocalCashMovement(context: OfflineContext, input: CashMovementCreateInput) {
  await assertLocalPaymentContext(context, input);
  input = normalizeMoney(input);
  const cashRegisterId = input.cashRegisterId.trim();
  const amount = numberValue(input.amount);
  if (!cashRegisterId) throw new Error("اختر الصندوق.");
  if (input.type !== "IN" && input.type !== "OUT") throw new Error("اختر نوع الحركة.");
  if (amount <= 0) throw new Error("أدخل مبلغًا صحيحًا للحركة.");

  const now = new Date().toISOString();
  const deviceId = await getDeviceId();
  const movementId = createLocalEntityId("cash_movement");
  const payload: CashMovementCreateInput & { referenceType: string; referenceId: string } = {
    ...input,
    cashRegisterId,
    type: input.type,
    amount,
    referenceType: input.referenceType?.trim() || "MANUAL",
    referenceId: input.referenceId?.trim() || "manual",
    note: input.note.trim()
  };
  const movement: LocalCashMovement = {
    id: movementId,
    restaurantId: context.tenantId,
    ...payload,
    cashRegisterId: payload.cashRegisterId,
    type: payload.type,
    amount: payload.amount,
    referenceType: payload.referenceType,
    referenceId: payload.referenceId,
    note: payload.note,
    createdById: context.userId,
    createdAt: now,
    deviceId,
    syncStatus: "pending",
    version: 0
  };
  const operation: SyncQueueItem = {
    operationId: createOperationId(),
    entityType: "cashMovement",
    entityId: movementId,
    action: "create",
    payload: payload as unknown as Record<string, unknown>,
    tenantId: context.tenantId,
    deviceId,
    userId: context.userId,
    createdAt: now,
    status: "pending",
    retryCount: 0,
    dependencyIds: []
  };

  await offlineDb.transaction("rw", offlineDb.cashMovements, offlineDb.cashRegisters, offlineDb.syncQueue, async () => {
    const register = await offlineDb.cashRegisters.get(cashRegisterId);
    if (!register || register.restaurantId !== context.tenantId) throw new Error("الصندوق غير موجود.");
    await offlineDb.cashRegisters.put({ ...register, currentBalance: register.currentBalance + (input.type === "IN" ? amount : -amount), syncStatus: "pending" });
    await offlineDb.cashMovements.put(movement);
    await offlineDb.syncQueue.add(operation);
  });
  notifySyncStatusChanged();
  void startSync(context.tenantId, context.token);
  return movement;
}

export async function getPendingCashBalanceEffect(tenantId: string) {
  const movements = await offlineDb.cashMovements
    .where("restaurantId")
    .equals(tenantId)
    .filter((movement) => !movement.deletedAt && movement.syncStatus !== "synced")
    .toArray();
  return pendingCashBalanceEffect(movements);
}

async function pullFinancialHistory(context: OfflineContext) {
  if (await tryIncrementalRefresh(context)) return;
  const now = new Date().toISOString();
  const deviceId = await getDeviceId();
  const [accounts, entries, registers, movements, payments, expenses] = await Promise.all([
    adminBackgroundRequest<Account[]>("/api/owner/ops/accounts", context.token).catch(() => null),
    adminBackgroundRequest<JournalEntry[]>("/api/owner/ops/journal-entries", context.token).catch(() => null),
    adminBackgroundRequest<CashRegister[]>("/api/owner/ops/cash/registers", context.token).catch(() => null),
    adminBackgroundRequest<CashMovement[]>("/api/owner/ops/cash/movements", context.token).catch(() => null),
    adminBackgroundRequest<OperationalPayment[]>("/api/owner/ops/payments", context.token).catch(() => null),
    adminBackgroundRequest<Expense[]>("/api/owner/ops/expenses", context.token).catch(() => null)
  ]);

  await offlineDb.transaction("rw", [
    offlineDb.accounts,
    offlineDb.journalEntries,
    offlineDb.cashRegisters,
    offlineDb.cashMovements,
    offlineDb.payments,
    offlineDb.expenses
  ], async () => {
    if (accounts) await putRemoteHistoryRecords(offlineDb.accounts, accounts, context.tenantId, deviceId, now);
    if (entries) await putRemoteHistoryRecords(offlineDb.journalEntries, entries, context.tenantId, deviceId, now);
    if (registers) await putRemoteHistoryRecords(offlineDb.cashRegisters, registers, context.tenantId, deviceId, now);
    if (movements) await putRemoteHistoryRecords(offlineDb.cashMovements, movements, context.tenantId, deviceId, now);
    if (payments) await putRemoteHistoryRecords(offlineDb.payments, payments, context.tenantId, deviceId, now);
    if (expenses) await putRemoteHistoryRecords(offlineDb.expenses, expenses, context.tenantId, deviceId, now);
  });
}

async function putRemoteHistoryRecords<T extends { id: string }>(
  table: RemoteHistoryTable<T>,
  records: T[],
  tenantId: string,
  deviceId: string,
  now: string
) {
  const items = [];
  for (const record of records) {
    const local = await table.get(record.id);
    if (!shouldApplyServerFinancialRecordToLocal(local, tenantId)) continue;
    items.push(localRecord(record, tenantId, deviceId, now));
  }
  if (items.length) await table.bulkPut(items);
  await tombstoneMissingRemoteHistoryRecords(table, records, tenantId, deviceId, now);
}

type RemoteHistoryRecord<T extends { id: string }> = T & {
  restaurantId?: string;
  syncStatus?: SyncStatus;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

type RemoteHistoryTable<T extends { id: string }> = {
  get: (id: string) => Promise<RemoteHistoryRecord<T> | undefined>;
  bulkPut: (items: Array<T & ReturnType<typeof localRecord>>) => Promise<unknown>;
  where: (index: "restaurantId") => { equals: (value: string) => { toArray: () => Promise<Array<RemoteHistoryRecord<T>>> } };
};

async function tombstoneMissingRemoteHistoryRecords<T extends { id: string }>(
  table: RemoteHistoryTable<T>,
  records: T[],
  tenantId: string,
  deviceId: string,
  now: string
) {
  const remoteIds = new Set(records.map((record) => record.id));
  const localRecords = await table.where("restaurantId").equals(tenantId).toArray();
  const tombstones = localRecords
    .filter((local) => !remoteIds.has(local.id) && !local.deletedAt && shouldTombstoneMissingServerFinancialRecord(local, tenantId))
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

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function settleLocalInvoice(context: OfflineContext, invoiceId: string, input: { settlementMode: SettlementMode; payments: PaymentPart[]; note: string }) {
  await assertLocalPaymentContext(context, input);
  const id = createLocalEntityId("settlement");
  const now = new Date().toISOString();
  await offlineDb.transaction("rw", [offlineDb.invoices, offlineDb.payments, offlineDb.cashMovements, offlineDb.cashRegisters, offlineDb.orders, offlineDb.suppliers, offlineDb.journalEntries, offlineDb.syncQueue, offlineDb.deviceState], async () => {
    const invoice = await offlineDb.invoices.get(invoiceId);
    if (!invoice || invoice.restaurantId !== context.tenantId) throw new Error("الفاتورة غير موجودة.");
    if (invoice.currency && invoice.currency !== "SYP") throw new Error("هذه الفاتورة ليست بالليرة السورية.");
    if (invoice.status === "VOID") throw new Error("لا يمكن تسديد فاتورة ملغاة.");
    const settlement = normalizeSettlement(invoice.remainingAmount, input.settlementMode, input.payments);
    const nextInvoice = { ...invoice, settlementMode: settlement.remainingAmount === 0 ? "FULL" as const : "PARTIAL" as const, payments: [...(invoice.payments ?? []), ...settlement.payments], paidAmount: invoice.paidAmount + settlement.paidAmount, remainingAmount: settlement.remainingAmount, status: settlement.remainingAmount === 0 ? "PAID" as const : "PARTIAL" as const, updatedAt: now, syncStatus: "pending" as const };
    await offlineDb.invoices.put(nextInvoice);
    const direction = invoice.type === "SALE" ? "IN" : "OUT";
    for (const [index, row] of settlement.payments.entries()) {
      const rowId = index === 0 ? id : `${id}_${index}`;
      await offlineDb.payments.put({ ...row, id: rowId, restaurantId: context.tenantId, invoiceId, orderId: invoice.orderId, supplierId: invoice.supplierId, type: invoice.type, note: input.note, paidAt: now, createdAt: now, syncStatus: "pending" });
      await offlineDb.cashMovements.put({ ...row, id: rowId, restaurantId: context.tenantId, type: direction, referenceType: "PAYMENT", referenceId: rowId, note: input.note, createdAt: now, syncStatus: "pending" });
      if (row.cashRegisterId) {
        const register = await offlineDb.cashRegisters.get(row.cashRegisterId);
        if (!register || register.restaurantId !== context.tenantId) throw new Error("الصندوق غير موجود.");
        await offlineDb.cashRegisters.put({ ...register, currentBalance: register.currentBalance + (direction === "IN" ? row.amount : -row.amount), syncStatus: "pending" });
      }
    }
    if (invoice.orderId && invoice.type === "SALE") {
      const order = await offlineDb.orders.get(invoice.orderId);
      if (order) await offlineDb.orders.put({ ...order, paidAmount: nextInvoice.paidAmount, paymentStatus: nextInvoice.status, settlementMode: nextInvoice.settlementMode, payments: nextInvoice.payments, syncStatus: "pending", updatedAt: now });
    }
    if (invoice.supplierId && invoice.type === "PURCHASE") {
      const supplier = await offlineDb.suppliers.get(invoice.supplierId);
      if (!supplier || supplier.restaurantId !== context.tenantId) throw new Error("المورد غير موجود.");
      await offlineDb.suppliers.put({ ...supplier, balance: supplier.balance - settlement.paidAmount, syncStatus: "pending" });
    }
    const amount = settlement.paidAmount;
    const lines = direction === "IN" ? [{ accountId: "cash", debit: amount, credit: 0, memo: "تسديد فاتورة" }, { accountId: "accounts_receivable", debit: 0, credit: amount, memo: "تسديد دين" }] : [{ accountId: invoice.type === "PURCHASE" ? "accounts_payable" : "sales_returns", debit: amount, credit: 0, memo: "تسديد فاتورة" }, { accountId: "cash", debit: 0, credit: amount, memo: "تسديد فاتورة" }];
    await offlineDb.journalEntries.put({ id, restaurantId: context.tenantId, status: "POSTED", referenceType: "PAYMENT", referenceId: id, lines, memo: input.note, postedAt: now, createdAt: now, syncStatus: "pending" });
    const dependencies = await offlineDb.syncQueue.where("tenantId").equals(context.tenantId).filter(op => op.status !== "synced" && ((op.entityType === "order" && op.entityId === invoice.orderId) || (op.entityType === "payment" && op.payload.invoiceId === invoiceId))).toArray();
    await queueOperation({ entityType: "payment", entityId: id, action: "create", payload: { ...input, invoiceId }, tenantId: context.tenantId, userId: context.userId, dependencyIds: dependencies.map(op => op.operationId) });
  });
  void startSync(context.tenantId, context.token);
}

export async function settleLocalExpense(context: OfflineContext, expenseId: string, input: { settlementMode: SettlementMode; payments: PaymentPart[]; note: string }) {
  await assertLocalPaymentContext(context, input);
  const id = createLocalEntityId("expense_settlement");
  const now = new Date().toISOString();
  await offlineDb.transaction("rw", [offlineDb.expenses, offlineDb.cashMovements, offlineDb.cashRegisters, offlineDb.journalEntries, offlineDb.syncQueue, offlineDb.deviceState], async () => {
    const expense = await offlineDb.expenses.get(expenseId);
    if (!expense || expense.restaurantId !== context.tenantId) throw new Error("المصروف غير موجود.");
    const settlement = normalizeSettlement(expense.remainingAmount ?? 0, input.settlementMode, input.payments);
    await offlineDb.expenses.put({ ...expense, settlementMode: settlement.remainingAmount === 0 ? "FULL" as const : "PARTIAL" as const, payments: [...(expense.payments ?? []), ...settlement.payments], paidAmount: (expense.paidAmount ?? 0) + settlement.paidAmount, remainingAmount: settlement.remainingAmount, syncStatus: "pending", updatedAt: now });
    for (const [index, row] of settlement.payments.entries()) {
      await offlineDb.cashMovements.put({ ...row, id: `expense_${id}_${index}`, restaurantId: context.tenantId, type: "OUT", referenceType: "EXPENSE", referenceId: expenseId, note: input.note, createdAt: now, syncStatus: "pending" });
      if (row.cashRegisterId) {
        const register = await offlineDb.cashRegisters.get(row.cashRegisterId);
        if (!register || register.restaurantId !== context.tenantId) throw new Error("الصندوق غير موجود.");
        await offlineDb.cashRegisters.put({ ...register, currentBalance: register.currentBalance - row.amount, syncStatus: "pending" });
      }
    }
    await offlineDb.journalEntries.put({ id: `expense_${id}`, restaurantId: context.tenantId, status: "POSTED", referenceType: "EXPENSE", referenceId: expenseId, lines: [{ accountId: "accounts_payable", debit: settlement.paidAmount, credit: 0, memo: input.note }, { accountId: "cash", debit: 0, credit: settlement.paidAmount, memo: input.note }], memo: input.note, postedAt: now, createdAt: now, syncStatus: "pending" });
    const dependencies = await offlineDb.syncQueue.where("tenantId").equals(context.tenantId).filter(op => op.status !== "synced" && ((op.entityType === "expense" && op.entityId === expenseId) || op.payload.expenseId === expenseId)).toArray();
    await queueOperation({ entityType: "payment", entityId: id, action: "create", payload: { ...input, expenseId }, tenantId: context.tenantId, userId: context.userId, dependencyIds: dependencies.map(op => op.operationId) });
  });
  void startSync(context.tenantId, context.token);
}

async function assertLocalPaymentContext(context: OfflineContext, input: { payments?: PaymentPart[] } & Partial<MoneyInput>, sourceCurrency?: string) {
  if (!input.payments && !input.currency) return;
  const restaurant = await offlineDb.restaurants.get(context.tenantId);
  if ((sourceCurrency ?? restaurant?.currency) !== "SYP") throw new Error("التعاملات الجديدة بالعملتين تتطلب حساباً بالليرة السورية.");
  if ((input.currency === "USD" || input.payments?.some(row => row.currency === "USD")) && !restaurant?.usdExchangeRate) throw new Error("احفظ سعر الصرف أولاً.");
}
