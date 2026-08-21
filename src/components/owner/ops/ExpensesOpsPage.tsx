"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import {
  AppBadge,
  AppButton,
  AppEmptyState,
  AppFieldShell,
  AppInput,
  AppPageHeader,
  AppSelect,
  AppSurface,
  AppTextarea,
  AppToolbar,
  PopupForm,
  cn
} from "@/components/shared";
import { adminRequest } from "@/lib/api";
import { formatInteger } from "@/lib/format";
import type { Expense, PaymentMethod } from "@/types/ops";
import { money, OpsShell, useOpsPage } from "./OpsShared";
import { buildCurrentMonthRange, dateRangeLabel, formatFinancialDate, isWithinDateRange, option, paymentMethodLabel, paymentMethods, run } from "./OpsPageShared";

type ExpenseForm = {
  category: string;
  amount: number;
  paymentMethod: string;
  paidAt: string;
  notes: string;
};

export function ExpensesOpsPage() {
  const state = useOpsPage("expenses");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [dateRange, setDateRange] = useState(buildCurrentMonthRange);
  const [editingId, setEditingId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDeleteExpense, setPendingDeleteExpense] = useState<Expense | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyExpenseForm());

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
      setForm(emptyExpenseForm());
      setFormOpen(false);
      await load();
    });
  }

  async function remove(id: string) {
    await run(state, async () => {
      await adminRequest(`/api/owner/ops/expenses/${id}`, state.token, { method: "DELETE" });
      setPendingDeleteExpense(null);
      await load();
    });
  }

  function reset() {
    setEditingId("");
    setForm(emptyExpenseForm());
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

  const filtered = expenses
    .filter((expense) => isWithinDateRange(expense.paidAt || expense.createdAt, dateRange.from, dateRange.to))
    .sort((first, second) => String(second.paidAt || second.createdAt || "").localeCompare(String(first.paidAt || first.createdAt || "")));
  const total = filtered.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  return (
    <OpsShell title="المصروفات" eyebrow="المحاسبة" module="expenses" state={state} onRefresh={() => void Promise.all([state.loadRestaurant(), load()])}>
      <div className="grid gap-4">
        <AppPageHeader
          title="المصروفات"
          description="تسجيل ومتابعة مصروفات المطعم."
          primaryAction={<AppButton type="button" onClick={openNewForm}>إضافة مصروف</AppButton>}
          secondaryActions={(
            <>
              <AppBadge variant="neutral">{formatInteger(filtered.length)} مصروف</AppBadge>
              <AppBadge variant="danger">{money(total, state.restaurant?.currency)}</AppBadge>
            </>
          )}
        />

        <AppSurface title="قائمة المصروفات">
          <AppToolbar
            search={(
              <div className="grid gap-3 sm:grid-cols-2">
                <AppFieldShell label="من">
                  <AppInput type="date" value={dateRange.from} onChange={(event) => setDateRange((current) => ({ ...current, from: event.target.value }))} />
                </AppFieldShell>
                <AppFieldShell label="إلى">
                  <AppInput type="date" value={dateRange.to} onChange={(event) => setDateRange((current) => ({ ...current, to: event.target.value }))} />
                </AppFieldShell>
              </div>
            )}
            actions={<AppButton type="button" variant="secondary" onClick={() => setDateRange(buildCurrentMonthRange())}>الشهر الحالي</AppButton>}
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-app-md border border-app-border bg-app-surface-muted px-3 py-2 text-app-body">
            <span className="font-medium text-app-muted">الفترة: {dateRangeLabel(dateRange)}</span>
            <span className="font-semibold text-app-ink">الإجمالي: {money(total, state.restaurant?.currency)}</span>
          </div>

          {filtered.length ? (
            <>
              <div className="mt-4 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] border-separate border-spacing-0 text-right text-app-body">
                  <thead>
                    <tr className="text-app-label text-app-muted">
                      <th className="border-b border-app-border px-3 py-2 font-semibold">التاريخ</th>
                      <th className="border-b border-app-border px-3 py-2 font-semibold">الفئة</th>
                      <th className="border-b border-app-border px-3 py-2 font-semibold">طريقة الدفع</th>
                      <th className="border-b border-app-border px-3 py-2 font-semibold">المبلغ</th>
                      <th className="border-b border-app-border px-3 py-2 font-semibold">ملاحظات</th>
                      <th className="border-b border-app-border px-3 py-2 font-semibold">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((expense) => (
                      <tr key={expense.id} className="align-middle">
                        <td className="whitespace-nowrap border-b border-app-border px-3 py-3">{formatFinancialDate(expense.paidAt || expense.createdAt)}</td>
                        <td className="border-b border-app-border px-3 py-3"><AppBadge variant="neutral">{expense.category}</AppBadge></td>
                        <td className="whitespace-nowrap border-b border-app-border px-3 py-3 text-app-muted">{paymentMethodLabel(expense.paymentMethod)}</td>
                        <td className="whitespace-nowrap border-b border-app-border px-3 py-3 font-semibold text-app-danger">{money(expense.amount, state.restaurant?.currency)}</td>
                        <td className="max-w-sm border-b border-app-border px-3 py-3 text-app-muted"><span className="block truncate">{expense.notes || "-"}</span></td>
                        <td className="border-b border-app-border px-3 py-3">
                          <ExpenseRowActions onEdit={() => edit(expense)} onDelete={() => setPendingDeleteExpense(expense)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid gap-2 md:hidden">
                {filtered.map((expense) => (
                  <ExpenseMobileRow key={expense.id} expense={expense} currency={state.restaurant?.currency} onEdit={() => edit(expense)} onDelete={() => setPendingDeleteExpense(expense)} />
                ))}
              </div>
            </>
          ) : (
            <AppEmptyState className="mt-4" title="لا توجد مصروفات" description="أضف مصروفاً أو غيّر الفترة." action={<AppButton type="button" onClick={openNewForm}>إضافة مصروف</AppButton>} />
          )}
        </AppSurface>
      </div>

      <PopupForm open={formOpen} onClose={closeForm} title={editingId ? "تعديل مصروف" : "إضافة مصروف"} maxWidth="md">
        <form onSubmit={save} className="grid gap-3">
          <AppFieldShell label="الفئة">
            <AppInput value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
          </AppFieldShell>
          <AppFieldShell label="المبلغ">
            <AppInput type="number" min="0" value={form.amount} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} />
          </AppFieldShell>
          <AppFieldShell label="طريقة الدفع">
            <AppSelect value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as PaymentMethod })}>
              {paymentMethods.map((method) => <option key={method} value={method}>{option(method).label}</option>)}
            </AppSelect>
          </AppFieldShell>
          <AppFieldShell label="التاريخ">
            <AppInput type="date" value={form.paidAt} onChange={(event) => setForm({ ...form, paidAt: event.target.value })} />
          </AppFieldShell>
          <AppFieldShell label="ملاحظات">
            <AppTextarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </AppFieldShell>
          <div className="flex flex-wrap gap-2">
            <AppButton type="submit">{editingId ? "حفظ" : "إضافة"}</AppButton>
            <AppButton type="button" variant="secondary" onClick={closeForm}>إلغاء</AppButton>
          </div>
        </form>
      </PopupForm>

      <PopupForm open={Boolean(pendingDeleteExpense)} onClose={() => setPendingDeleteExpense(null)} title="حذف المصروف" maxWidth="sm">
        <div className="grid gap-4">
          <p className="text-app-body text-app-muted">سيتم حذف مصروف {pendingDeleteExpense?.category} بقيمة {money(pendingDeleteExpense?.amount ?? 0, state.restaurant?.currency)}. لا يمكن التراجع عن هذا الإجراء.</p>
          <div className="flex flex-wrap gap-2">
            <AppButton type="button" variant="destructive" onClick={() => pendingDeleteExpense ? void remove(pendingDeleteExpense.id) : undefined}>حذف</AppButton>
            <AppButton type="button" variant="secondary" onClick={() => setPendingDeleteExpense(null)}>إلغاء</AppButton>
          </div>
        </div>
      </PopupForm>
    </OpsShell>
  );
}

function ExpenseMobileRow({ expense, currency, onEdit, onDelete }: { expense: Expense; currency?: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <article className="rounded-app-md border border-app-border bg-app-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-app-ink">{expense.category}</p>
          <p className="mt-1 text-app-helper text-app-muted">{formatFinancialDate(expense.paidAt || expense.createdAt)} · {paymentMethodLabel(expense.paymentMethod)}</p>
        </div>
        <p className="shrink-0 font-semibold text-app-danger">{money(expense.amount, currency)}</p>
      </div>
      {expense.notes ? <p className="mt-3 truncate text-app-helper text-app-muted">{expense.notes}</p> : null}
      <ExpenseRowActions onEdit={onEdit} onDelete={onDelete} className="mt-3" />
    </article>
  );
}

function ExpenseRowActions({ onEdit, onDelete, className }: { onEdit: () => void; onDelete: () => void; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <AppButton type="button" variant="secondary" size="sm" onClick={onEdit}>تعديل</AppButton>
      <AppButton type="button" variant="ghost" size="sm" onClick={onDelete} className="text-app-danger hover:bg-app-danger-soft">حذف</AppButton>
    </div>
  );
}

function emptyExpenseForm(): ExpenseForm {
  return { category: "", amount: 0, paymentMethod: "CASH", paidAt: "", notes: "" };
}
