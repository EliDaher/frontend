import type { Restaurant } from "@/types/menu";
import type { Invoice, OpsOrder, OpsTable } from "@/types/ops";
import type { SyncStatus } from "@/offline/schema";

const DEFAULT_VAT_NUMBER = "105200001740";

export type ReceiptInvoiceSnapshot = Invoice & {
  syncStatus?: SyncStatus;
  syncErrorCode?: string;
  syncErrorMessage?: string;
};

export function buildReceipt(
  order: OpsOrder,
  restaurant: Restaurant | null,
  table?: OpsTable | null,
  invoice?: ReceiptInvoiceSnapshot | null
) {
  const source = invoice ?? order;
  const items = invoice
    ? invoice.items.map((item) => ({
        id: item.itemId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total
      }))
    : order.items.map((item) => ({
        id: item.menuItemId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total
      }));
  const baseAmount = Math.max(numberValue(source.subTotal) - numberValue(source.discount), 0);
  const consumerTax = numberValue(source.tax);
  const localAdminTax = numberValue(source.serviceCharge);
  const payableAmount = numberValue(source.total, baseAmount + consumerTax + localAdminTax);
  const paidAmount = invoice ? numberValue(invoice.paidAmount) : numberValue(order.paidAmount);
  const remainingAmount = invoice ? numberValue(invoice.remainingAmount) : Math.max(payableAmount - paidAmount, 0);
  const restaurantName = restaurant?.receiptRestaurantName?.trim() || restaurant?.name?.trim() || "المطعم";
  const vatNumber = restaurant?.vatNumber?.trim() || DEFAULT_VAT_NUMBER;
  const invoiceNo = compactInvoiceNo(invoice?.id || order.invoiceId || order.id);
  const invoiceDateTime = formatReceiptDateTime(invoice?.updatedAt || invoice?.createdAt || order.updatedAt || order.orderedAt || order.createdAt);
  const currency = normalizeReceiptCurrency(restaurant?.currency);
  const saleLabel = table?.name ? `مبيعات نقدية ط ${table.name}` : "مبيعات نقدية";
  const confirmationStatus = receiptConfirmationStatus(invoice, order);

  const summary = {
    restaurantName,
    vatNumber,
    invoiceNo,
    invoiceDateTime,
    confirmationStatus,
    baseAmount: Math.round(baseAmount),
    consumerTax: Math.round(consumerTax),
    localAdminTax: Math.round(localAdminTax),
    payableAmount: Math.round(payableAmount),
    paidAmount: Math.round(paidAmount),
    remainingAmount: Math.round(remainingAmount),
    currency
  };

  return {
    restaurantName,
    location: restaurant?.receiptLocation?.trim() || "",
    vatNumber,
    invoiceNo,
    invoiceDateTime,
    saleLabel,
    currency,
    items,
    baseAmount,
    consumerTax,
    localAdminTax,
    payableAmount,
    paidAmount,
    remainingAmount,
    confirmationStatus,
    qrPayload: JSON.stringify(summary)
  };
}

function receiptConfirmationStatus(invoice: ReceiptInvoiceSnapshot | null | undefined, order: OpsOrder) {
  if (!invoice) {
    return order.invoiceId ? "غير مؤكدة - بيانات الفاتورة المحلية غير متاحة" : "طلب مفتوح - ليست فاتورة مكتملة";
  }
  if (invoice.syncStatus === "synced") return "فاتورة مؤكدة";
  if (invoice.syncStatus === "syncing") return "فاتورة محلية - قيد المزامنة";
  if (invoice.syncStatus === "failed") return "فاتورة محلية - تحتاج مزامنة";
  if (invoice.syncStatus === "conflict") return "فاتورة محلية - تحتاج مراجعة";
  return "فاتورة محلية - بانتظار المزامنة";
}

function compactInvoiceNo(invoiceId: string) {
  const value = String(invoiceId || "").trim();
  const withoutOrderPrefix = value.replace(/^order[_-]?/i, "");
  return (withoutOrderPrefix || value || "00000").slice(0, 5);
}

function formatReceiptDateTime(value: string | undefined) {
  const parsed = value ? new Date(value) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

function normalizeReceiptCurrency(currency: string | undefined) {
  const value = currency?.trim();
  if (!value || value.toUpperCase() === "SYP") return "SP";
  return value;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}
