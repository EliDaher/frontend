import type { CashMovement, Invoice, JournalEntry, OperationalPayment, OpsOrder } from "@/types/ops";

export type BusinessDaySettings = { timezone?: string; businessDayStartTime?: string };
export const DEFAULT_BUSINESS_DAY_START = "04:00";
export function validBusinessDayStart(value: string) { return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }
export function businessDayStart(settings?: BusinessDaySettings) {
  const value = settings?.businessDayStartTime;
  return value && validBusinessDayStart(value) ? value : DEFAULT_BUSINESS_DAY_START;
}
export function businessZone(zone?: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: zone || "Asia/Damascus" }); return zone || "Asia/Damascus"; }
  catch { return "Asia/Damascus"; }
}
export function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function businessDay(value: string | number | Date | undefined | null, settings?: BusinessDaySettings) {
  if (value === undefined || value === null || value === "") return "";
  // Date-only values are civil labels, not timestamps at midnight.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA-u-nu-latn", {
    timeZone: businessZone(settings?.timezone), year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (key: string) => parts.find(item => item.type === key)?.value || "";
  const day = `${part("year")}-${part("month")}-${part("day")}`;
  return `${part("hour")}:${part("minute")}` < businessDayStart(settings) ? shiftDay(day, -1) : day;
}
export function businessMonthRange(settings?: BusinessDaySettings, now = new Date()) {
  const today = businessDay(now, settings);
  return { from: `${today.slice(0, 7)}-01`, to: today };
}
export function dayInRange(day: string, from: string, to: string) {
  return Boolean(day) && (!from || day >= from) && (!to || day <= to);
}

/** Resolve explicit financial links only; manual references must never match an order by accident. */
export function createBusinessDayResolver(orders: OpsOrder[], payments: OperationalPayment[], invoices: Invoice[], settings?: BusinessDaySettings) {
  const orderById = new Map(orders.map(order => [order.id, order]));
  const paymentById = new Map(payments.map(payment => [payment.id, payment]));
  const invoiceById = new Map(invoices.map(invoice => [invoice.id, invoice]));
  const invoiceOrders = new Map(orders.filter(order => order.invoiceId).map(order => [order.invoiceId, order]));
  const paymentOrders = new Map(orders.filter(order => order.paymentId).map(order => [order.paymentId, order]));
  const invoiceOrder = (id: string) => orderById.get(invoiceById.get(id)?.orderId || "") || invoiceOrders.get(id);
  const paymentOrder = (payment?: OperationalPayment) => payment && (orderById.get(payment.orderId) || invoiceOrder(payment.invoiceId) || paymentOrders.get(payment.id));
  const legacyOrder = (id: string) => {
    const exact = paymentOrders.get(id);
    if (exact) return exact;
    // Split rows use order_<orderId>_<index>; match the full known order ID.
    if (!id.startsWith("order_")) return undefined;
    const orderId = id.slice("order_".length);
    return orderById.get(orderId) || orderById.get(orderId.replace(/_\d+$/, ""));
  };
  function movement(movement: CashMovement) {
    const payment = movement.referenceType === "PAYMENT" ? paymentById.get(movement.referenceId) || paymentById.get(movement.id) : paymentById.get(movement.id);
    const refund = movement.type === "OUT" || movement.referenceType === "ORDER_CANCEL" || payment?.type === "REFUND";
    const linked = ["ORDER", "ORDER_CANCEL", "PAYMENT", "INVOICE"].includes(movement.referenceType);
    const order = !linked ? undefined : paymentOrder(payment)
      || (["ORDER", "ORDER_CANCEL"].includes(movement.referenceType) ? orderById.get(movement.referenceId) : undefined)
      || (movement.referenceType === "INVOICE" ? invoiceOrder(movement.referenceId) : undefined)
      || legacyOrder(movement.id) || paymentOrders.get(movement.referenceId);
    const useOrder = !refund && Boolean(order?.tableId);
    const day = businessDay(useOrder ? order?.orderedAt || order?.createdAt : movement.createdAt, settings);
    const missingOrder = !refund && !order && (movement.referenceType === "ORDER" || Boolean(payment?.orderId) || movement.id.startsWith("order_") || Boolean(payment?.invoiceId && invoiceById.get(payment.invoiceId)?.orderId));
    return { day, order, missingOrder };
  }
  function entry(entry: JournalEntry) {
    const invoice = entry.referenceType === "INVOICE" ? invoiceById.get(entry.referenceId) : undefined;
    const payment = entry.referenceType === "PAYMENT" ? paymentById.get(entry.referenceId) : undefined;
    const order = entry.referenceType === "ORDER" ? orderById.get(entry.referenceId)
      : entry.referenceType === "INVOICE" ? invoiceOrder(entry.referenceId)
      : entry.referenceType === "PAYMENT" ? paymentOrder(payment) : undefined;
    const useOrder = order?.tableId && invoice?.type !== "REFUND" && payment?.type !== "REFUND";
    return businessDay(useOrder ? order.orderedAt || order.createdAt : entry.postedAt || entry.createdAt, settings);
  }
  return { movement, entry };
}
