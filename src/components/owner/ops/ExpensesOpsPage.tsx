"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { PopupForm } from "@/components/shared";
import { adminRequest } from "@/lib/api";
import { formatInteger } from "@/lib/format";
import type { Category, MenuItem } from "@/types/menu";
import type {
  Account,
  CashMovement,
  CashRegister,
  Expense,
  InventoryItem,
  InventoryTransaction,
  Invoice,
  JournalEntry,
  OperationalPayment,
  OrderStatus,
  OpsOrder,
  OpsTable,
  PaymentMethod,
  RecipeDraftLine,
  RecipeIngredient,
  Supplier
} from "@/types/ops";
import {
  DangerButton,
  Empty,
  Field,
  money,
  OrderStatusActions,
  orderStatusLabels,
  OpsShell,
  Panel,
  paymentAmountForMethod,
  PrimaryButton,
  SecondaryButton,
  SelectField,
  StatusBadge,
  TextArea,
  useOpsPage
} from "./OpsShared";
import {
  accountTypes,
  buildCashSeries,
  buildPaymentBreakdown,
  Filters,
  invoiceStatuses,
  invoiceTypes,
  journalStatusLabel,
  localDateKey,
  nameById,
  numberValue,
  option,
  orderStatuses,
  orderTypes,
  paymentMethods,
  recipeDraftForMenuItem,
  RowActions,
  run,
  SimpleCrudLayout,
  sortByCreatedAtDesc,
  sumAmounts,
  tableStatuses,
  AccountingMetric,
  CashMovementChart,
  PaymentMethodChart
} from "./OpsPageShared";

export function ExpensesOpsPage() {
  const state = useOpsPage("expenses");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editingId, setEditingId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ category: "", amount: 0, paymentMethod: "CASH", paidAt: "", notes: "" });

  useEffect(() => {
    if (state.token && state.modules?.expenses) void load();
  }, [state.token, state.modules?.expenses]);

  async function load() {
    setExpenses(await adminRequest<Expense[]>("/api/owner/ops/expenses", state.token));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(state, async () => {
      await adminRequest(editingId ? `/api/owner/ops/expenses/${editingId}` : "/api/owner/ops/expenses", state.token, { method: editingId ? "PATCH" : "POST", body: JSON.stringify(form) });
      setEditingId("");
      setForm({ category: "", amount: 0, paymentMethod: "CASH", paidAt: "", notes: "" });
      setFormOpen(false);
      await load();
    });
  }

  async function remove(id: string) {
    if (!window.confirm("حذف المصروف؟")) return;
    await run(state, async () => {
      await adminRequest(`/api/owner/ops/expenses/${id}`, state.token, { method: "DELETE" });
      await load();
    });
  }

  function reset() {
    setEditingId("");
    setForm({ category: "", amount: 0, paymentMethod: "CASH", paidAt: "", notes: "" });
  }

  function openNewForm() {
    reset();
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    reset();
  }

  function edit(expense: Expense) {
    setEditingId(expense.id);
    setForm({ category: expense.category, amount: expense.amount, paymentMethod: expense.paymentMethod, paidAt: (expense.paidAt || "").slice(0, 10), notes: expense.notes });
    setFormOpen(true);
  }
  const filtered = expenses.filter((expense) => {
    const day = (expense.paidAt || expense.createdAt || "").slice(0, 10);
    return (!from || day >= from) && (!to || day <= to);
  });
  const total = filtered.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  return (
    <OpsShell title="المصروفات" eyebrow="المحاسبة" module="expenses" state={state} onRefresh={() => void Promise.all([state.loadRestaurant(), load()])}>
      <Panel
        title={"قائمة المصروفات · " + money(total, state.restaurant?.currency)}
        action={(
          <button type="button" onClick={openNewForm} className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-black text-white">
            إضافة مصروف
          </button>
        )}
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Field label="من" type="date" value={from} onChange={setFrom} />
          <Field label="إلى" type="date" value={to} onChange={setTo} />
        </div>
        <div className="grid gap-3">
          {filtered.length ? filtered.map((expense) => (
            <article key={expense.id} className="rounded-lg border border-slate-200 p-3">
              <h3 className="font-black">{expense.category}</h3>
              <p className="mt-1 text-sm font-bold text-slate-500">{money(expense.amount, state.restaurant?.currency)} ?? {expense.paymentMethod} ?? {(expense.paidAt || expense.createdAt || "").slice(0, 10)}</p>
              <p className="mt-1 text-sm font-bold text-slate-500">{expense.notes}</p>
              <RowActions onEdit={() => edit(expense)} onDelete={() => void remove(expense.id)} />
            </article>
          )) : <Empty title="لا توجد مصروفات" text="أضف مصروفاً أو غيّر الفترة." />}
        </div>
      </Panel>

      <PopupForm open={formOpen} onClose={closeForm} title={editingId ? "تعديل مصروف" : "إضافة مصروف"} maxWidth="md">
        <form onSubmit={save} className="grid gap-3">
          <Field label="الفئة" value={form.category} onChange={(category) => setForm({ ...form, category })} />
          <Field label="المبلغ" type="number" min="0" value={form.amount} onChange={(amount) => setForm({ ...form, amount: Number(amount) })} />
          <SelectField label="طريقة الدفع" value={form.paymentMethod} options={paymentMethods.map(option)} onChange={(paymentMethod) => setForm({ ...form, paymentMethod })} />
          <Field label="التاريخ" type="date" value={form.paidAt} onChange={(paidAt) => setForm({ ...form, paidAt })} />
          <TextArea label="ملاحظات" value={form.notes} onChange={(notes) => setForm({ ...form, notes })} />
          <div className="flex gap-2">
            <PrimaryButton>{editingId ? "حفظ" : "إضافة"}</PrimaryButton>
            <SecondaryButton onClick={closeForm}>إلغاء</SecondaryButton>
          </div>
        </form>
      </PopupForm>
    </OpsShell>

  );
}
