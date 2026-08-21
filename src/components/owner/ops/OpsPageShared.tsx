"use client";

import type { CashMovement, InventoryItem, JournalEntry, OperationalPayment, RecipeDraftLine, RecipeIngredient } from "@/types/ops";

export const tableStatuses = ["AVAILABLE", "OCCUPIED", "RESERVED", "CLEANING", "DISABLED"] as const;
export const orderStatuses = ["DRAFT", "PENDING", "CONFIRMED", "PREPARING", "READY", "SERVED", "COMPLETED", "CANCELLED"] as const;
export const orderTypes = ["DINE_IN", "TAKEAWAY", "DELIVERY", "QR"] as const;
export const paymentMethods = ["CASH", "CARD", "BANK_TRANSFER", "WALLET", "SPLIT", "DEBT"] as const;
export const invoiceTypes = ["SALE", "PURCHASE", "REFUND"] as const;
export const invoiceStatuses = ["UNPAID", "PARTIAL", "PAID", "VOID"] as const;
export const accountTypes = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;

type CashSeriesPoint = {
  key: string;
  label: string;
  cashIn: number;
  cashOut: number;
  net: number;
};

type PaymentBreakdownPoint = {
  method: string;
  amount: number;
};

export type DateRange = {
  from: string;
  to: string;
};

export function buildCashSeries(movements: CashMovement[], range?: DateRange): CashSeriesPoint[] {
  if (range?.from && range?.to) {
    const fromDate = parseLocalDate(range.from);
    const toDate = parseLocalDate(range.to);
    if (fromDate && toDate && fromDate <= toDate) {
      const days = daysBetween(fromDate, toDate);
      if (days <= 31) {
        return Array.from({ length: days }, (_, index) => buildCashSeriesPoint(movements, addDays(fromDate, index), "day"));
      }
      return buildMonthlyCashSeries(movements, fromDate, toDate);
    }
  }

  return Array.from({ length: 7 }, (_, index) => buildCashSeriesPoint(movements, addDays(new Date(), index - 6), "day"));
}

function buildCashSeriesPoint(movements: CashMovement[], date: Date, mode: "day" | "month"): CashSeriesPoint {
  const key = mode === "month" ? localMonthKey(date) : localDateKey(date);
  const matchingMovements = movements.filter((movement) => {
    const movementKey = mode === "month" ? localMonthKey(movement.createdAt) : localDateKey(movement.createdAt);
    return movementKey === key;
  });
  const cashIn = sumAmounts(matchingMovements.filter((movement) => movement.type === "IN"));
  const cashOut = sumAmounts(matchingMovements.filter((movement) => movement.type === "OUT"));

  return {
    key,
    label: mode === "month"
      ? date.toLocaleDateString("ar-SY-u-nu-latn", { month: "short", year: "numeric" })
      : date.toLocaleDateString("ar-SY-u-nu-latn", { weekday: "short", day: "numeric" }),
    cashIn,
    cashOut,
    net: cashIn - cashOut
  };
}

function buildMonthlyCashSeries(movements: CashMovement[], fromDate: Date, toDate: Date) {
  const points: CashSeriesPoint[] = [];
  const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  const end = new Date(toDate.getFullYear(), toDate.getMonth(), 1);

  while (cursor <= end) {
    points.push(buildCashSeriesPoint(movements, cursor, "month"));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return points;
}

export function buildPaymentBreakdown(payments: OperationalPayment[]): PaymentBreakdownPoint[] {
  const grouped = payments.reduce<Record<string, number>>((result, payment) => {
    result[payment.method] = (result[payment.method] ?? 0) + numberValue(payment.amount);
    return result;
  }, {});

  return Object.entries(grouped)
    .map(([method, amount]) => ({ method, amount }))
    .sort((first, second) => second.amount - first.amount);
}

export function sumAmounts(items: Array<{ amount: number | string }>) {
  return items.reduce((sum, item) => sum + numberValue(item.amount), 0);
}

export function numberValue(value: number | string | undefined | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function localDateKey(value: string | number | Date | undefined | null) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function buildCurrentMonthRange(date = new Date()): DateRange {
  return {
    from: localDateKey(new Date(date.getFullYear(), date.getMonth(), 1)),
    to: localDateKey(date)
  };
}

export function isWithinDateRange(value: string | number | Date | undefined | null, from: string, to: string) {
  const key = localDateKey(value);
  return Boolean(key) && (!from || key >= from) && (!to || key <= to);
}

export function formatFinancialDate(value: string | number | Date | undefined | null) {
  const key = localDateKey(value);
  if (!key) return "-";
  const date = parseLocalDate(key);
  return date ? date.toLocaleDateString("ar-SY-u-nu-latn", { year: "numeric", month: "short", day: "numeric" }) : key;
}

export function dateRangeLabel(range: DateRange) {
  return `${formatFinancialDate(range.from)} - ${formatFinancialDate(range.to)}`;
}

export function recordTime(value: string | undefined) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseLocalDate(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function daysBetween(fromDate: Date, toDate: Date) {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.floor((startOfDay(toDate).getTime() - startOfDay(fromDate).getTime()) / oneDay) + 1;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function localMonthKey(value: string | number | Date | undefined | null) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}/.test(value)) return value.slice(0, 7);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function sortByCreatedAtDesc(first: { createdAt?: string; postedAt?: string }, second: { createdAt?: string; postedAt?: string }) {
  return dateValue(second.createdAt || second.postedAt) - dateValue(first.createdAt || first.postedAt);
}

function dateValue(value: string | undefined) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function paymentMethodLabel(method: string) {
  const labels: Record<string, string> = {
    CASH: "نقدي",
    CARD: "بطاقة",
    BANK_TRANSFER: "تحويل بنكي",
    WALLET: "محفظة",
    SPLIT: "مقسّم",
    DEBT: "دين"
  };
  return labels[method] ?? method;
}

export function journalStatusLabel(status: JournalEntry["status"]) {
  const labels: Record<JournalEntry["status"], string> = {
    DRAFT: "مسودة",
    POSTED: "مرحل",
    REVERSED: "معكوس"
  };
  return labels[status];
}

export function option(value: string) {
  return { value, label: value };
}

export function nameById(items: Array<{ id: string; name: string }>, id: string) {
  return items.find((item) => item.id === id)?.name ?? id;
}

export function recipeDraftForMenuItem(recipes: RecipeIngredient[], inventoryItems: InventoryItem[], menuItemId: string): RecipeDraftLine[] {
  const currentRecipe = recipes.filter((entry) => entry.menuItemId === menuItemId);
  if (currentRecipe.length) {
    return currentRecipe.map((entry) => ({
      inventoryItemId: entry.inventoryItemId,
      quantity: entry.quantity,
      unit: entry.unit || inventoryItems.find((item) => item.id === entry.inventoryItemId)?.unit || ""
    }));
  }

  return inventoryItems[0] ? [{ inventoryItemId: inventoryItems[0].id, quantity: 1, unit: inventoryItems[0].unit }] : [];
}

export async function run(state: { setMessage: (message: string) => void }, action: () => Promise<void>) {
  state.setMessage("");
  try {
    await action();
  } catch (error) {
    state.setMessage(error instanceof Error ? error.message : "حدث خطأ غير متوقع.");
  }
}
