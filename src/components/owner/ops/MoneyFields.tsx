"use client";
import { AppFieldShell, AppInput, AppSelect } from "@/components/shared";
import type { MoneyInput } from "@/lib/payments";
export function MoneyFields({ value, onChange, exchangeRate }: { value: MoneyInput; onChange: (value: MoneyInput) => void; exchangeRate?: number }) {
  return <><AppFieldShell label="العملة"><AppSelect value={value.currency ?? "SYP"} onChange={e => onChange({ ...value, currency: e.target.value as "SYP" | "USD", exchangeRate: e.target.value === "USD" ? exchangeRate ?? 0 : 1, originalAmount: undefined, amount: 0 })}><option value="SYP">الليرة السورية</option><option value="USD" disabled={!exchangeRate}>الدولار الأمريكي</option></AppSelect></AppFieldShell>
    <AppFieldShell label="المبلغ"><AppInput type="number" min="0" step={value.currency === "USD" ? "0.01" : "1"} value={value.amount} onChange={e => onChange({ ...value, originalAmount: undefined, amount: Number(e.target.value) })} /></AppFieldShell>
    {value.currency === "USD" && <p>دولار واحد = {value.exchangeRate} ل.س · القيمة: {Math.round(value.amount * (value.exchangeRate ?? 0))} ل.س</p>}
  </>;
}
