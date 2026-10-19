import type { OpsOrder } from "@/types/ops";
export function historyZone(zone?: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: zone || "Asia/Damascus" }); return zone || "Asia/Damascus"; } catch { return "Asia/Damascus"; }
}
export function historyDay(value: string | Date, zone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return ["year", "month", "day"].map((key) => parts.find((part) => part.type === key)?.value).join("-");
}
export function validHistoryDay(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value; }
export function shiftHistoryDay(value: string, amount: number) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0,10); }
export function historyOrderTime(order: OpsOrder) { return order.orderedAt || order.createdAt || ""; }
export function ordersForHistoryDay(orders: OpsOrder[], day: string, zone: string) {
  return orders.filter((order) => Boolean(order.tableId) && historyDay(historyOrderTime(order), zone) === day).sort((a,b) => Date.parse(historyOrderTime(b)) - Date.parse(historyOrderTime(a)));
}
