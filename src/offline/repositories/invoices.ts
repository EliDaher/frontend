import { adminBackgroundRequest } from "@/lib/api";
import type { Invoice, Supplier } from "@/types/ops";
import { offlineDb } from "../db";
import { getDeviceId } from "../device";
import { invoiceReconciliationPatch, shouldApplyServerInvoiceToLocal } from "../invoice-cache-rules";
import type { LocalInvoice } from "../schema";
import type { OfflineContext } from "./tables";

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
