import { adminBackgroundRequest } from "@/lib/api";
import type { Account, CashMovement, CashRegister, Expense, JournalEntry, OperationalPayment } from "@/types/ops";
import { offlineDb } from "../db";
import { createLocalEntityId, createOperationId, getDeviceId } from "../device";
import { pendingCashBalanceEffect, shouldApplyServerFinancialRecordToLocal, shouldTombstoneMissingServerFinancialRecord } from "../financial-cache-rules";
import type { LocalCashMovement, LocalExpense, SyncQueueItem, SyncStatus } from "../schema";
import { notifySyncStatusChanged } from "../outbox";
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

export type ExpenseCreateInput = {
  category: string;
  amount: number;
  paymentMethod: Expense["paymentMethod"];
  paidAt?: string;
  notes: string;
};

export async function createLocalExpense(context: OfflineContext, input: ExpenseCreateInput) {
  const category = input.category.trim();
  const amount = numberValue(input.amount);
  if (!category) throw new Error("أدخل فئة المصروف.");
  if (amount <= 0) throw new Error("أدخل مبلغًا صحيحًا للمصروف.");

  const now = new Date().toISOString();
  const deviceId = await getDeviceId();
  const expenseId = createLocalEntityId("expense");
  const paidAt = input.paidAt || now;
  const payload: ExpenseCreateInput & { paidAt: string } = {
    category,
    amount,
    paymentMethod: input.paymentMethod || "CASH",
    paidAt,
    notes: input.notes.trim()
  };
  const expense: LocalExpense = {
    id: expenseId,
    restaurantId: context.tenantId,
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

  await offlineDb.transaction("rw", offlineDb.expenses, offlineDb.syncQueue, async () => {
    await offlineDb.expenses.put(expense);
    await offlineDb.syncQueue.add(operation);
  });
  notifySyncStatusChanged();
  void startSync(context.tenantId, context.token);
  return expense;
}

export type CashMovementCreateInput = {
  cashRegisterId: string;
  type: CashMovement["type"];
  amount: number;
  referenceType?: string;
  referenceId?: string;
  note: string;
};

export async function createLocalCashMovement(context: OfflineContext, input: CashMovementCreateInput) {
  const cashRegisterId = input.cashRegisterId.trim();
  const amount = numberValue(input.amount);
  if (!cashRegisterId) throw new Error("اختر الصندوق.");
  if (input.type !== "IN" && input.type !== "OUT") throw new Error("اختر نوع الحركة.");
  if (amount <= 0) throw new Error("أدخل مبلغًا صحيحًا للحركة.");

  const now = new Date().toISOString();
  const deviceId = await getDeviceId();
  const movementId = createLocalEntityId("cash_movement");
  const payload: CashMovementCreateInput & { referenceType: string; referenceId: string } = {
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

  await offlineDb.transaction("rw", offlineDb.cashMovements, offlineDb.syncQueue, async () => {
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
