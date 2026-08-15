"use client";

import type { ReactNode } from "react";
import { Empty, Field, money, Panel, SecondaryButton, DangerButton, SelectField } from "./OpsShared";
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

export function AccountingMetric({ title, value, tone = "slate" }: { title: string; value: string; tone?: "slate" | "green" | "red" }) {
  const styles = {
    slate: "border-slate-200 bg-white text-slate-950",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    red: "border-red-200 bg-red-50 text-red-900"
  };

  return (
    <div className={`rounded-lg border p-4 shadow-sm ${styles[tone]}`}>
      <p className="text-xs font-black text-slate-500">{title}</p>
      <p className="mt-2 text-xl font-black">{value}</p>
    </div>
  );
}

export function CashMovementChart({ data, currency }: { data: CashSeriesPoint[]; currency?: string }) {
  const maxAmount = Math.max(...data.flatMap((point) => [point.cashIn, point.cashOut]), 0);
  if (maxAmount <= 0) {
    return <Empty title="لا توجد حركة نقدية" text="ستظهر حركة الدخول والخروج عند تسجيل عمليات نقدية." />;
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3 text-xs font-black">
        <span className="inline-flex items-center gap-1 text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" /> دخول</span>
        <span className="inline-flex items-center gap-1 text-red-700"><span className="h-2 w-2 rounded-full bg-red-500" /> خروج</span>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {data.map((point) => {
          const inHeight = Math.max(8, Math.round((point.cashIn / maxAmount) * 120));
          const outHeight = Math.max(8, Math.round((point.cashOut / maxAmount) * 120));

          return (
            <div key={point.key} className="grid gap-2 text-center">
              <div className="flex h-32 items-end justify-center gap-1 rounded-md bg-slate-50 p-2">
                <div className="w-3 rounded-t bg-emerald-500" style={{ height: point.cashIn ? inHeight : 4 }} title={money(point.cashIn, currency)} />
                <div className="w-3 rounded-t bg-red-500" style={{ height: point.cashOut ? outHeight : 4 }} title={money(point.cashOut, currency)} />
              </div>
              <p className="text-[11px] font-black text-slate-500">{point.label}</p>
              <p className={`text-[11px] font-black ${point.net >= 0 ? "text-emerald-700" : "text-red-700"}`}>{money(point.net, currency)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PaymentMethodChart({ data, currency }: { data: PaymentBreakdownPoint[]; currency?: string }) {
  const maxAmount = Math.max(...data.map((point) => point.amount), 0);
  if (maxAmount <= 0) {
    return <Empty title="لا توجد مدفوعات" text="ستظهر وسائل الدفع بعد تسجيل المدفوعات." />;
  }

  return (
    <div className="grid gap-3">
      {data.map((point) => (
        <div key={point.method} className="grid gap-1">
          <div className="flex items-center justify-between gap-3 text-xs font-black">
            <span>{paymentMethodLabel(point.method)}</span>
            <span>{money(point.amount, currency)}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(6, (point.amount / maxAmount) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function buildCashSeries(movements: CashMovement[]): CashSeriesPoint[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(new Date(), index - 6);
    const key = localDateKey(date);
    const dayMovements = movements.filter((movement) => localDateKey(movement.createdAt) === key);
    const cashIn = sumAmounts(dayMovements.filter((movement) => movement.type === "IN"));
    const cashOut = sumAmounts(dayMovements.filter((movement) => movement.type === "OUT"));

    return {
      key,
      label: date.toLocaleDateString("ar-SY-u-nu-latn", { weekday: "short", day: "numeric" }),
      cashIn,
      cashOut,
      net: cashIn - cashOut
    };
  });
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
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function sortByCreatedAtDesc(first: { createdAt?: string; postedAt?: string }, second: { createdAt?: string; postedAt?: string }) {
  return dateValue(second.createdAt || second.postedAt) - dateValue(first.createdAt || first.postedAt);
}

function dateValue(value: string | undefined) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function paymentMethodLabel(method: string) {
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

export function SimpleCrudLayout({ formTitle, listTitle, form, children }: { formTitle: string; listTitle: string; form: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Panel title={formTitle}>{form}</Panel>
      <Panel title={listTitle}>{children}</Panel>
    </div>
  );
}

export function Filters({
  query,
  setQuery,
  status,
  setStatus,
  statuses
}: {
  query: string;
  setQuery: (query: string) => void;
  status: string;
  setStatus: (status: string) => void;
  statuses: readonly string[];
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_220px]">
      {setQuery ? <Field label="بحث" value={query} onChange={setQuery} /> : <div />}
      <SelectField label="الحالة" value={status} options={statuses.map(option)} onChange={setStatus} />
    </div>
  );
}

export function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="mt-3 flex gap-2">
      <SecondaryButton onClick={onEdit}>تعديل</SecondaryButton>
      <DangerButton onClick={onDelete}>حذف</DangerButton>
    </div>
  );
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