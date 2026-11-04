"use client";
import { useId, type ReactNode } from "react";
import { AppButton, AppFieldShell, AppInput, AppSelect } from "@/components/shared";
import { normalizeSettlement, normalizePayment, type PaymentPart, type SettlementMode } from "@/lib/payments";
import { formatMoney as money } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";
export type PaymentDraft = { settlementMode: SettlementMode; payments: PaymentPart[] };
export function PaymentEditor({ total, value, onChange, exchangeRate, registers = [], baseCurrency = "SYP", layout = "stacked", afterSummary }: {
  layout?: "stacked" | "rows";
  afterSummary?: ReactNode;
  total: number; value: PaymentDraft; onChange: (value: PaymentDraft) => void;
  exchangeRate?: number; registers?: Array<{ id: string; name: string }>; baseCurrency?: string;
}) {
  const modeGroupId = useId();
  const paid = value.payments.reduce((sum, row) => { try { return sum + normalizePayment(row).amount; } catch { return sum; } }, 0);
  let validationError = "";
  try { normalizeSettlement(total, value.settlementMode, value.payments); } catch (error) { validationError = error instanceof Error ? error.message : "راجع بيانات الدفع."; }
  function update(index: number, patch: Partial<PaymentPart>) { onChange({ ...value, payments: value.payments.map((row, i) => i === index ? { ...row, ...patch } : row) }); }
  const fresh = (): PaymentPart => ({ method: "CASH", currency: "SYP", originalAmount: Math.max(total - paid, 0), exchangeRate: 1, cashRegisterId: "" });
  function changeMode(settlementMode: SettlementMode) {
    onChange({ settlementMode, payments: settlementMode === "DEBT" ? [] : value.payments.length ? value.payments : [fresh()] });
  }
  const horizontal = layout === "rows";
  return <div className={horizontal ? "grid min-w-0 gap-2" : "grid min-w-0 gap-3"} data-payment-layout={layout}>
    {baseCurrency !== "SYP" && <p role="alert">الدفعات الجديدة بالعملتين متاحة للحسابات المسعرة بالليرة السورية فقط.</p>}
    {horizontal ? (
      <div className="grid min-w-0 gap-3 rounded-app-lg border border-app-border bg-app-surface-muted p-3 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-6">
        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-app-helper font-semibold text-app-muted">حالة السداد</legend>
          <div className="flex gap-1 rounded-app-md border border-app-border bg-app-surface p-1">
            {([ ["FULL", "كامل"], ["DEBT", "دين"], ["PARTIAL", "جزئي"] ] as const).map(([mode, label]) => (
              <label key={mode} className={`relative flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-app-sm px-4 text-app-label font-semibold ${value.settlementMode === mode ? "bg-app-primary text-app-primary-foreground" : "text-app-muted hover:bg-app-surface-muted"}`}>
                <input type="radio" className="peer sr-only" name={modeGroupId} value={mode} checked={value.settlementMode === mode} onChange={() => changeMode(mode)} />
                <span className="pointer-events-none absolute inset-0 rounded-app-sm peer-focus-visible:ring-4 peer-focus-visible:ring-app-primary-soft" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <dl className="grid min-w-0 grid-cols-3 gap-2" aria-live="polite" aria-atomic="true">
          {[
            { label: "الإجمالي", amount: total, color: "text-app-ink" },
            { label: "المدفوع", amount: paid, color: "text-app-success" },
            { label: "المتبقي", amount: total - paid, color: total - paid < 0 ? "text-app-danger" : "text-app-primary" }
          ].map(item => <div key={item.label} className="min-w-0"><dt className="text-app-helper text-app-muted">{item.label}</dt><dd className={`mt-1 break-words text-sm font-bold sm:text-base ${item.color}`}>{money(item.amount, baseCurrency)}</dd></div>)}
        </dl>
      </div>
    ) : <AppFieldShell label="حالة السداد"><AppSelect value={value.settlementMode} onChange={e => changeMode(e.target.value as SettlementMode)}><option value="FULL">كامل</option><option value="DEBT">دين</option><option value="PARTIAL">جزئي</option></AppSelect></AppFieldShell>}
    {afterSummary}
    {horizontal && value.payments.length > 0 && <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)_36px] gap-2 px-2 pt-1 text-app-helper font-semibold text-app-muted md:grid">
      <span>وسيلة الدفع</span><span>العملة</span><span>المبلغ</span><span>الصندوق</span><span />
    </div>}
    {value.payments.map((row, index) => <div key={index} role="group" aria-label={`الدفعة ${index + 1}`} className={horizontal ? "grid min-w-0 grid-cols-1 items-end gap-2 rounded-app-md border border-app-border p-2 min-[360px]:grid-cols-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)_36px]" : "grid gap-2 rounded-app-md border border-app-border p-3 sm:grid-cols-2"}>
      <AppFieldShell className={horizontal ? "min-w-0 md:gap-0" : "min-w-0"} label={horizontal ? <span className="md:sr-only">وسيلة الدفع</span> : "وسيلة الدفع"}><AppSelect className="min-w-0" value={row.method} onChange={e => update(index, { method: e.target.value as PaymentPart["method"] })}><option value="CASH">نقداً</option><option value="SHAM_CASH">شام كاش</option></AppSelect></AppFieldShell>
      <AppFieldShell className={horizontal ? "min-w-0 md:gap-0" : "min-w-0"} label={horizontal ? <span className="md:sr-only">العملة</span> : "العملة"}><AppSelect className="min-w-0" value={row.currency} onChange={e => update(index, { currency: e.target.value as PaymentPart["currency"], exchangeRate: e.target.value === "USD" ? exchangeRate ?? 0 : 1, originalAmount: 0 })}><option value="SYP">الليرة السورية</option><option value="USD" disabled={!exchangeRate}>الدولار الأمريكي</option></AppSelect></AppFieldShell>
      <AppFieldShell className={horizontal ? "min-w-0 md:gap-0" : "min-w-0"} label={horizontal ? <span className="md:sr-only">المبلغ</span> : "المبلغ"}><AppInput className="min-w-0" type="number" min="0" step={row.currency === "USD" ? "0.01" : "1"} value={row.originalAmount} onChange={e => update(index, { originalAmount: Number(e.target.value) })} /></AppFieldShell>
      <AppFieldShell className={horizontal ? "min-w-0 md:gap-0" : "min-w-0"} label={horizontal ? <span className="md:sr-only">الصندوق</span> : "الصندوق"}><AppSelect className="min-w-0" value={row.cashRegisterId} onChange={e => update(index, { cashRegisterId: e.target.value })}><option value="">بدون صندوق</option>{registers.map(register => <option key={register.id} value={register.id}>{register.name}</option>)}</AppSelect></AppFieldShell>
      {!horizontal && row.currency === "USD" && <p>سعر الصرف: {row.exchangeRate} ل.س لكل دولار</p>}
      {horizontal ? <button type="button" aria-label={`حذف الدفعة ${index + 1}`} title="حذف الدفعة" className="flex h-10 w-9 items-center justify-center justify-self-end rounded-app-md text-app-muted hover:bg-app-danger-soft hover:text-app-danger focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft min-[360px]:col-span-2 md:col-span-1" onClick={() => onChange({ ...value, payments: value.payments.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4" aria-hidden="true" /></button> : <AppButton type="button" variant="secondary" onClick={() => onChange({ ...value, payments: value.payments.filter((_, i) => i !== index) })}>حذف الدفعة</AppButton>}
      {horizontal && row.currency === "USD" && <p className="text-app-helper text-app-muted min-[360px]:col-span-2 md:col-span-5">سعر الصرف: {row.exchangeRate} ل.س · القيمة: {money(Math.round(row.originalAmount * row.exchangeRate), "SYP")}</p>}
    </div>)}
    {value.settlementMode !== "DEBT" && <AppButton type="button" variant="secondary" size={horizontal ? "sm" : undefined} iconStart={horizontal ? <Plus className="h-4 w-4" aria-hidden="true" /> : undefined} className={horizontal ? "justify-self-start" : undefined} disabled={value.payments.length >= 30} onClick={() => onChange({ ...value, payments: [...value.payments, fresh()] })}>إضافة دفعة</AppButton>}
    {!horizontal && <p>المدفوع: {money(paid, "ل.س")} · المتبقي: {money(total - paid, "ل.س")}</p>}
    {validationError && <p role="alert" className="text-app-danger">{validationError}</p>}
    {!exchangeRate && <p className="text-app-muted">للدفع بالدولار، احفظ سعر الصرف في إعدادات المطعم.</p>}
  </div>;
}
