"use client";
import { useRef, useState } from "react";
import { AppButton, AppFieldShell, AppInput, PopupForm } from "@/components/shared";
import { useLiveQuery } from "@/offline/hooks/useLiveQuery";
import { listLocalCashRegisters, settleLocalInvoice, settleLocalExpense } from "@/offline/repositories/financial-history";
import { createActionGuard } from "@/offline/action-guard";
import type { Expense, Invoice } from "@/types/ops";
import type { Restaurant } from "@/types/menu";
import { PaymentEditor, type PaymentDraft } from "./PaymentEditor";

export function InvoiceSettlementButton({ invoice, restaurant, expenseId }: { invoice: Invoice; restaurant: Restaurant | null; expenseId?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<PaymentDraft>({ settlementMode: "FULL", payments: [] });
  const guard = useRef(createActionGuard());
  const { value: registers } = useLiveQuery(() => open && restaurant ? listLocalCashRegisters(restaurant.id) : Promise.resolve([]), [], [restaurant?.id, open]);
  if (invoice.status === "VOID" || invoice.remainingAmount <= 0) return null;
  async function save() {
    await guard.current.run(async () => {
      setBusy(true); setError("");
      try {
        const token = window.localStorage.getItem("menu-owner-token") ?? "";
        if (!restaurant || !token) throw new Error("تعذر تحديد المطعم الحالي.");
        if (restaurant.currency !== "SYP") throw new Error("هذه الفاتورة ليست بالليرة السورية.");
        await (expenseId ? settleLocalExpense : settleLocalInvoice)({ tenantId: restaurant.id, token, userId: restaurant.ownerUserId ?? "owner" }, expenseId ?? invoice.id, { ...draft, note });
        setOpen(false);
      } catch (e) { setError(e instanceof Error ? e.message : "تعذر تسجيل التسديد."); }
      finally { setBusy(false); }
    });
  }
  return <><AppButton type="button" size="sm" variant="secondary" onClick={() => {
    setError(""); setNote(""); setDraft({ settlementMode: "FULL", payments: [{ method: "CASH", currency: "SYP", originalAmount: invoice.remainingAmount, exchangeRate: 1, cashRegisterId: "" }] }); setOpen(true);
  }}>{expenseId ? "تسديد المصروف" : "تسديد الفاتورة"}</AppButton>
  <PopupForm open={open} onClose={() => !busy && setOpen(false)} title="تسديد الفاتورة" maxWidth="lg"><div className="grid gap-3">
    <PaymentEditor total={invoice.remainingAmount} value={draft} onChange={setDraft} exchangeRate={restaurant?.usdExchangeRate} registers={registers} baseCurrency={restaurant?.currency} />
    <AppFieldShell label="ملاحظة"><AppInput value={note} onChange={e => setNote(e.target.value)} /></AppFieldShell>
    {error && <p role="alert" className="text-app-danger">{error}</p>}
    <AppButton type="button" loading={busy} onClick={() => void save()}>حفظ التسديد</AppButton>
  </div></PopupForm></>;
}

export function ExpenseSettlementButton({ expense, restaurant }: { expense: Expense; restaurant: Restaurant | null }) {
  const invoice: Invoice = { id: expense.id, type: "PURCHASE", status: (expense.remainingAmount ?? 0) > 0 ? "PARTIAL" : "PAID", orderId: "", supplierId: "", items: [], subTotal: expense.amount, discount: 0, tax: 0, serviceCharge: 0, total: expense.amount, paidAmount: expense.paidAmount ?? expense.amount, remainingAmount: expense.remainingAmount ?? 0, paymentMethod: expense.paymentMethod, dueDate: "", notes: expense.notes };
  return <InvoiceSettlementButton invoice={invoice} restaurant={restaurant} expenseId={expense.id} />;
}
