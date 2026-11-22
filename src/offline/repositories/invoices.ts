import { tryIncrementalRefresh } from "../sync-engine";
import { adminBackgroundRequest } from "@/lib/api";
import type { Invoice, Supplier } from "@/types/ops";
import { offlineDb } from "../db";
import { getDeviceId } from "../device";
import { invoiceReconciliationPatch, shouldApplyServerInvoiceToLocal } from "../invoice-cache-rules";
import type { LocalInvoice } from "../schema";
import type { OfflineContext } from "./tables";
import { normalizeSettlement, type PaymentPart, type SettlementMode } from "@/lib/payments";
import { createLocalEntityId } from "../device";
import { queueOperation } from "../outbox";
import { startSync } from "../sync-engine";

type InvoiceCreateInput = Omit<Invoice, "id" | "items" | "subTotal" | "total" | "remainingAmount" | "payments"> & {
  items: Array<Omit<Invoice["items"][number], "total"> & { total?: number }>;
  payments?: PaymentPart[];
  settlementMode?: SettlementMode;
};
export async function createLocalInvoice(context: OfflineContext, input: InvoiceCreateInput) {
  const id = createLocalEntityId("invoice"), now = new Date().toISOString();
  const items = input.items.map(item => ({ ...item, total: item.total ?? item.quantity * item.unitPrice }));
  if (!items.length || items.some(item => !Number.isFinite(item.total) || item.quantity <= 0 || item.unitPrice < 0)) throw new Error("Invalid invoice items");
  const subTotal = items.reduce((sum, item) => sum + item.total, 0);
  const total = Math.max(0, subTotal - input.discount + input.tax + input.serviceCharge);
  const settlement = input.payments !== undefined ? normalizeSettlement(total, input.settlementMode ?? "DEBT", input.payments) : null;
  const paidAmount = settlement?.paidAmount ?? input.paidAmount;
  if (paidAmount < 0 || paidAmount > total) throw new Error("Invalid invoice payment");
  const remainingAmount = total - paidAmount;
  await offlineDb.transaction("rw", [offlineDb.restaurants, offlineDb.invoices, offlineDb.payments, offlineDb.cashMovements, offlineDb.cashRegisters, offlineDb.suppliers, offlineDb.journalEntries, offlineDb.syncQueue, offlineDb.deviceState], async () => {
    const restaurant = await offlineDb.restaurants.get(context.tenantId);
    if (settlement && restaurant?.currency !== "SYP") throw new Error("الحسابات الجديدة بالعملتين تتطلب التسعير بالليرة السورية.");
    if (settlement?.payments.some(row => row.currency === "USD") && !restaurant?.usdExchangeRate) throw new Error("احفظ سعر الصرف أولاً.");
    const rows = settlement?.payments ?? (paidAmount > 0 ? [{ amount: paidAmount, method: input.paymentMethod, cashRegisterId: "" }] : []);
    const direction = input.type === "SALE" ? "IN" : "OUT";
    await offlineDb.invoices.put({ ...input, payments: settlement?.payments, id, currency: restaurant?.currency, items, subTotal, total, paidAmount, remainingAmount, status: remainingAmount === 0 ? "PAID" : paidAmount > 0 ? "PARTIAL" : "UNPAID", restaurantId: context.tenantId, createdAt: now, updatedAt: now, syncStatus: "pending" });
    for (const [index, row] of rows.entries()) {
      const rowId = `invoice_${id}_${index}`;
      if (row.cashRegisterId) {
        const register = await offlineDb.cashRegisters.get(row.cashRegisterId);
        if (!register || register.restaurantId !== context.tenantId) throw new Error("الصندوق غير موجود.");
        await offlineDb.cashRegisters.put({ ...register, currentBalance: register.currentBalance + (direction === "IN" ? row.amount : -row.amount), syncStatus: "pending" });
      }
      await offlineDb.payments.put({ ...row, id: rowId, restaurantId: context.tenantId, invoiceId: id, orderId: input.orderId, supplierId: input.supplierId, type: input.type, note: input.notes, paidAt: now, createdAt: now, syncStatus: "pending" });
      await offlineDb.cashMovements.put({ ...row, id: rowId, restaurantId: context.tenantId, type: direction, referenceType: "PAYMENT", referenceId: rowId, note: input.notes, createdAt: now, syncStatus: "pending" });
    }
    if (input.supplierId && input.type === "PURCHASE") {
      const supplier = await offlineDb.suppliers.get(input.supplierId);
      if (!supplier || supplier.restaurantId !== context.tenantId) throw new Error("المورد غير موجود.");
      await offlineDb.suppliers.put({ ...supplier, balance: supplier.balance + remainingAmount, syncStatus: "pending" });
    }
    const lines = input.type === "SALE" ? [
      ...(paidAmount ? [{ accountId: "cash", debit: paidAmount, credit: 0, memo: "فاتورة" }] : []),
      ...(remainingAmount ? [{ accountId: "accounts_receivable", debit: remainingAmount, credit: 0, memo: "فاتورة" }] : []),
      { accountId: "sales", debit: 0, credit: total, memo: "فاتورة" }
    ] : [
      { accountId: input.type === "PURCHASE" ? "purchases" : "sales_returns", debit: total, credit: 0, memo: "فاتورة" },
      ...(paidAmount ? [{ accountId: "cash", debit: 0, credit: paidAmount, memo: "سداد" }] : []),
      ...(remainingAmount ? [{ accountId: "accounts_payable", debit: 0, credit: remainingAmount, memo: "متبقي" }] : [])
    ];
    await offlineDb.journalEntries.put({ id: `invoice_${id}`, restaurantId: context.tenantId, status: "POSTED", referenceType: "INVOICE", referenceId: id, lines, memo: input.notes, postedAt: now, createdAt: now, syncStatus: "pending" });
    const dependencies = await offlineDb.syncQueue.where("tenantId").equals(context.tenantId).filter(op => op.status !== "synced" && op.entityType === "order" && op.entityId === input.orderId).toArray();
    await queueOperation({ tenantId: context.tenantId, userId: context.userId, entityType: "invoice", entityId: id, action: "create", payload: input, dependencyIds: dependencies.map(op => op.operationId) });
  });
  void startSync(context.tenantId, context.token).catch(() => {});
  return id;
}

const invoiceRefreshes = new Map<string, Promise<Invoice[]>>();
const supplierRefreshes = new Map<string, Promise<Supplier[]>>();

export async function hydrateInvoices(context: OfflineContext) {
  void refreshInvoices(context);
  return listLocalInvoices(context.tenantId);
}

export async function refreshInvoices(context: OfflineContext) {
  const current = invoiceRefreshes.get(context.tenantId);
  if (current) return current;

  const refresh = pullInvoices(context)
    .catch(() => listLocalInvoices(context.tenantId))
    .finally(() => {
      invoiceRefreshes.delete(context.tenantId);
    });
  invoiceRefreshes.set(context.tenantId, refresh);
  return refresh;
}

export async function hydrateInvoiceSuppliers(context: OfflineContext, enabled: boolean | undefined) {
  if (enabled) void refreshInvoiceSuppliers(context);
  return listLocalSuppliers(context.tenantId);
}

export async function refreshInvoiceSuppliers(context: OfflineContext) {
  const current = supplierRefreshes.get(context.tenantId);
  if (current) return current;

  const refresh = pullInvoiceSuppliers(context)
    .catch(() => listLocalSuppliers(context.tenantId))
    .finally(() => {
      supplierRefreshes.delete(context.tenantId);
    });
  supplierRefreshes.set(context.tenantId, refresh);
  return refresh;
}

async function pullInvoiceSuppliers(context: OfflineContext) {
  try {
    if (await tryIncrementalRefresh(context)) return listLocalSuppliers(context.tenantId);
    const suppliers = await adminBackgroundRequest<Supplier[]>("/api/owner/ops/suppliers", context.token);
    const now = new Date().toISOString();
    const deviceId = await getDeviceId();
    await offlineDb.suppliers.bulkPut(suppliers.map((supplier) => ({
      ...supplier,
      restaurantId: context.tenantId,
      deviceId,
      syncStatus: "synced" as const,
      lastSyncedAt: now,
      version: versionFromDates(supplier.updatedAt, supplier.createdAt)
    })));
  } catch {
    // Supplier names are supporting labels for invoice history; cached invoices remain usable without them.
  }
  return listLocalSuppliers(context.tenantId);
}

export async function listLocalInvoices(tenantId: string) {
  const invoices = await offlineDb.invoices.where("restaurantId").equals(tenantId).filter((invoice) => !invoice.deletedAt).toArray();
  return invoices.sort((first, second) => invoiceTime(second) - invoiceTime(first));
}

export async function listLocalSuppliers(tenantId: string) {
  return offlineDb.suppliers.where("restaurantId").equals(tenantId).filter((supplier) => !supplier.deletedAt).toArray();
}

async function pullInvoices(context: OfflineContext) {
  if (await tryIncrementalRefresh(context)) return listLocalInvoices(context.tenantId);
  const remoteInvoices = await adminBackgroundRequest<Invoice[]>("/api/owner/ops/invoices", context.token);
  const now = new Date().toISOString();
  const deviceId = await getDeviceId();

  await offlineDb.transaction("rw", offlineDb.invoices, async () => {
    for (const invoice of remoteInvoices) {
      const local = await offlineDb.invoices.get(invoice.id);
      if (!shouldApplyServerInvoiceToLocal(local, context.tenantId)) continue;

      const nextInvoice: LocalInvoice = {
        ...invoice,
        restaurantId: context.tenantId,
        deviceId,
        syncStatus: "synced" as const,
        lastSyncedAt: now,
        version: versionFromDates(invoice.updatedAt, invoice.createdAt),
        syncErrorCode: undefined,
        syncErrorMessage: undefined,
        ...invoiceReconciliationPatch(invoice, local)
      };
      await offlineDb.invoices.put(nextInvoice);
    }
  });

  return listLocalInvoices(context.tenantId);
}

function invoiceTime(invoice: { createdAt?: string; updatedAt?: string; dueDate?: string }) {
  const value = invoice.createdAt || invoice.updatedAt || invoice.dueDate || "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function versionFromDates(updatedAt?: string, createdAt?: string) {
  const value = Date.parse(updatedAt ?? createdAt ?? "");
  return Number.isFinite(value) ? value : 0;
}
