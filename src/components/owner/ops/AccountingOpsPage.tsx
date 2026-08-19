"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
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
  buildCurrentMonthRange,
  buildCashSeries,
  buildPaymentBreakdown,
  dateRangeLabel,
  Filters,
  formatFinancialDate,
  invoiceStatuses,
  invoiceTypes,
  isWithinDateRange,
  journalStatusLabel,
  localDateKey,
  nameById,
  numberValue,
  option,
  orderStatuses,
  orderTypes,
  paymentMethodLabel,
  paymentMethods,
  recipeDraftForMenuItem,
  RowActions,
  recordTime,
  run,
  SimpleCrudLayout,
  sortByCreatedAtDesc,
  sumAmounts,
  tableStatuses,
  AccountingMetric,
  CashMovementChart,
  PaymentMethodChart
} from "./OpsPageShared";

type FinancialRecordRow = {
  id: string;
  date: string;
  type: string;
  title: string;
  method: string;
  amountIn: number;
  amountOut: number;
  note: string;
  source: string;
};

export function AccountingOpsPage() {
  const state = useOpsPage("accounting");
  const [tab, setTab] = useState<"overview" | "records" | "accounts" | "journal" | "cash">("overview");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [payments, setPayments] = useState<OperationalPayment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [dateRange, setDateRange] = useState(buildCurrentMonthRange);
  const [accountForm, setAccountForm] = useState({ code: "", name: "", type: "ASSET", isActive: true });
  const [entryForm, setEntryForm] = useState({ debitAccountId: "", creditAccountId: "", amount: 0, memo: "" });
  const [cashForm, setCashForm] = useState({ name: "", openingBalance: 0 });
  const [movementForm, setMovementForm] = useState({ cashRegisterId: "", type: "IN", amount: 0, note: "" });
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [cashRegisterFormOpen, setCashRegisterFormOpen] = useState(false);

  useEffect(() => {
    if (state.token && state.modules?.accounting) void load();
  }, [state.token, state.modules?.accounting]);

  async function load() {
    const [nextAccounts, nextEntries, nextRegisters, nextMovements, nextPayments, nextExpenses] = await Promise.all([
      adminRequest<Account[]>("/api/owner/ops/accounts", state.token),
      adminRequest<JournalEntry[]>("/api/owner/ops/journal-entries", state.token),
      adminRequest<CashRegister[]>("/api/owner/ops/cash/registers", state.token),
      adminRequest<CashMovement[]>("/api/owner/ops/cash/movements", state.token),
      adminRequest<OperationalPayment[]>("/api/owner/ops/payments", state.token).catch(() => []),
      adminRequest<Expense[]>("/api/owner/ops/expenses", state.token).catch(() => [])
    ]);
    setAccounts(nextAccounts);
    setEntries(nextEntries);
    setRegisters(nextRegisters);
    setMovements(nextMovements);
    setPayments(nextPayments);
    setExpenses(nextExpenses);
    setEntryForm((current) => ({ ...current, debitAccountId: current.debitAccountId || nextAccounts[0]?.id || "", creditAccountId: current.creditAccountId || nextAccounts[1]?.id || "" }));
    setMovementForm((current) => ({ ...current, cashRegisterId: current.cashRegisterId || nextRegisters[0]?.id || "" }));
  }

  async function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(state, async () => {
      await adminRequest("/api/owner/ops/accounts", state.token, { method: "POST", body: JSON.stringify(accountForm) });
      setAccountForm({ code: "", name: "", type: "ASSET", isActive: true });
      setAccountFormOpen(false);
      await load();
    });
  }

  async function addEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!entryForm.debitAccountId || !entryForm.creditAccountId || entryForm.debitAccountId === entryForm.creditAccountId) {
      state.setMessage("اختر حسابين مختلفين للقيد.");
      return;
    }
    await run(state, async () => {
      await adminRequest("/api/owner/ops/journal-entries", state.token, {
        method: "POST",
        body: JSON.stringify({
          status: "POSTED",
          referenceType: "MANUAL",
          referenceId: "manual",
          memo: entryForm.memo,
          lines: [
            { accountId: entryForm.debitAccountId, debit: entryForm.amount, credit: 0, memo: entryForm.memo },
            { accountId: entryForm.creditAccountId, debit: 0, credit: entryForm.amount, memo: entryForm.memo }
          ]
        })
      });
      setEntryForm({ ...entryForm, amount: 0, memo: "" });
      await load();
    });
  }

  async function addCashRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(state, async () => {
      await adminRequest("/api/owner/ops/cash/registers", state.token, { method: "POST", body: JSON.stringify(cashForm) });
      setCashForm({ name: "", openingBalance: 0 });
      setCashRegisterFormOpen(false);
      await load();
    });
  }

  async function addMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(state, async () => {
      await adminRequest("/api/owner/ops/cash/movements", state.token, { method: "POST", body: JSON.stringify({ ...movementForm, referenceType: "MANUAL", referenceId: "manual" }) });
      setMovementForm({ ...movementForm, amount: 0, note: "" });
      await load();
    });
  }

  const totalDebit = entryForm.amount;
  const totalCredit = entryForm.amount;
  const currency = state.restaurant?.currency;
  const rangedPayments = payments.filter((payment) => isWithinDateRange(payment.paidAt || payment.createdAt, dateRange.from, dateRange.to));
  const rangedExpenses = expenses.filter((expense) => isWithinDateRange(expense.paidAt || expense.createdAt, dateRange.from, dateRange.to));
  const rangedMovements = movements.filter((movement) => isWithinDateRange(movement.createdAt, dateRange.from, dateRange.to));
  const rangedEntries = entries.filter((entry) => isWithinDateRange(entry.postedAt || entry.createdAt, dateRange.from, dateRange.to));
  const receiptsTotal = sumAmounts(rangedPayments);
  const expensesTotal = sumAmounts(rangedExpenses);
  const netReceipts = receiptsTotal - expensesTotal;
  const periodCashIn = sumAmounts(rangedMovements.filter((movement) => movement.type === "IN"));
  const periodCashOut = sumAmounts(rangedMovements.filter((movement) => movement.type === "OUT"));
  const totalCashBalance = registers.reduce((sum, register) => sum + numberValue(register.currentBalance), 0);
  const cashSeries = buildCashSeries(rangedMovements, dateRange);
  const paymentBreakdown = buildPaymentBreakdown(rangedPayments);
  const recentMovements = [...rangedMovements].sort(sortByCreatedAtDesc).slice(0, 5);
  const recentEntries = [...rangedEntries].sort(sortByCreatedAtDesc).slice(0, 5);
  const totalPeriodRecords = rangedPayments.length + rangedExpenses.length + rangedMovements.length + rangedEntries.length;
  const financialRecords = useMemo<FinancialRecordRow[]>(() => {
    const paymentRows = rangedPayments.map((payment) => ({
      id: `payment-${payment.id}`,
      date: payment.paidAt || payment.createdAt || "",
      type: "مقبوضات",
      title: payment.orderId ? `طلب ${payment.orderId}` : payment.invoiceId ? `فاتورة ${payment.invoiceId}` : "دفعة",
      method: paymentMethodLabel(payment.method),
      amountIn: numberValue(payment.amount),
      amountOut: 0,
      note: payment.note,
      source: payment.type
    }));
    const expenseRows = rangedExpenses.map((expense) => ({
      id: `expense-${expense.id}`,
      date: expense.paidAt || expense.createdAt || "",
      type: "مصروفات",
      title: expense.category,
      method: paymentMethodLabel(expense.paymentMethod),
      amountIn: 0,
      amountOut: numberValue(expense.amount),
      note: expense.notes,
      source: "EXPENSE"
    }));
    const movementRows = rangedMovements.map((movement) => ({
      id: `movement-${movement.id}`,
      date: movement.createdAt || "",
      type: movement.type === "IN" ? "دخول صندوق" : "خروج صندوق",
      title: movement.referenceType || "حركة صندوق",
      method: nameById(registers, movement.cashRegisterId),
      amountIn: movement.type === "IN" ? numberValue(movement.amount) : 0,
      amountOut: movement.type === "OUT" ? numberValue(movement.amount) : 0,
      note: movement.note,
      source: movement.referenceId
    }));
    const journalRows = rangedEntries.map((entry) => {
      const debit = entry.lines.reduce((sum, line) => sum + numberValue(line.debit), 0);
      const credit = entry.lines.reduce((sum, line) => sum + numberValue(line.credit), 0);
      return {
        id: `journal-${entry.id}`,
        date: entry.postedAt || entry.createdAt || "",
        type: "قيد محاسبي",
        title: entry.memo || entry.referenceType,
        method: journalStatusLabel(entry.status),
        amountIn: debit,
        amountOut: credit,
        note: `${formatInteger(entry.lines.length)} سطور`,
        source: entry.referenceId
      };
    });

    return [...paymentRows, ...expenseRows, ...movementRows, ...journalRows].sort((first, second) => recordTime(second.date) - recordTime(first.date));
  }, [rangedPayments, rangedExpenses, rangedMovements, rangedEntries, registers]);

  return (
    <OpsShell title="المحاسبة" eyebrow="الحسابات والقيود والصندوق" module="accounting" state={state} onRefresh={() => void Promise.all([state.loadRestaurant(), load()])}>
      <Panel
        title={`الفترة المختارة · ${dateRangeLabel(dateRange)}`}
        action={<SecondaryButton onClick={() => setDateRange(buildCurrentMonthRange())}>الشهر الحالي</SecondaryButton>}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="من" type="date" value={dateRange.from} onChange={(from) => setDateRange((current) => ({ ...current, from }))} />
          <Field label="إلى" type="date" value={dateRange.to} onChange={(to) => setDateRange((current) => ({ ...current, to }))} />
        </div>
      </Panel>

      <div className="my-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <AccountingMetric title="المقبوضات" value={money(receiptsTotal, currency)} tone="green" />
        <AccountingMetric title="المصروفات" value={money(expensesTotal, currency)} tone="red" />
        <AccountingMetric title="صافي المقبوضات" value={money(netReceipts, currency)} tone={netReceipts >= 0 ? "green" : "red"} />
        <AccountingMetric title="دخول الصندوق" value={money(periodCashIn, currency)} tone="green" />
        <AccountingMetric title="خروج الصندوق" value={money(periodCashOut, currency)} tone="red" />
        <AccountingMetric title="السجلات" value={formatInteger(totalPeriodRecords)} />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
        <AccountingMetric title="إجمالي الصناديق" value={money(totalCashBalance, currency)} />
        <AccountingMetric title="إجمالي القيود" value={formatInteger(entries.length)} />
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto">
        {(["overview", "records", "accounts", "journal", "cash"] as const).map((item) => (
          <button key={item} onClick={() => setTab(item)} className={`rounded-md px-4 py-2 text-sm font-black ${tab === item ? "bg-amber-500 text-white" : "bg-white text-slate-600"}`}>
            {item === "overview" ? "نظرة عامة" : item === "records" ? "كل السجلات" : item === "accounts" ? "الحسابات" : item === "journal" ? "القيود" : "الصندوق"}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Panel title="حركة النقد في الفترة">
            <CashMovementChart data={cashSeries} currency={currency} />
          </Panel>
          <Panel title="وسائل الدفع في الفترة">
            <PaymentMethodChart data={paymentBreakdown} currency={currency} />
          </Panel>
          <Panel title="آخر الحركات النقدية في الفترة">
            <div className="grid gap-2">
              {recentMovements.length ? recentMovements.map((movement) => (
                <div key={movement.id} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 p-2 text-sm font-bold">
                  <div>
                    <p className="font-black">{movement.type === "IN" ? "دخول نقدي" : "خروج نقدي"}</p>
                    <p className="text-xs text-slate-500">{movement.note || movement.referenceType}</p>
                  </div>
                  <span className={movement.type === "IN" ? "text-emerald-700" : "text-red-700"}>{money(movement.amount, currency)}</span>
                </div>
              )) : <Empty title="لا توجد حركات" text="ستظهر الحركات النقدية الأخيرة هنا." />}
            </div>
          </Panel>
          <Panel title="آخر القيود في الفترة">
            <div className="grid gap-2">
              {recentEntries.length ? recentEntries.map((entry) => (
                <div key={entry.id} className="rounded-md bg-slate-50 p-2 text-sm font-bold">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black">{entry.memo || entry.referenceType}</p>
                    <StatusBadge label={journalStatusLabel(entry.status)} tone={entry.status === "POSTED" ? "green" : entry.status === "REVERSED" ? "red" : "amber"} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{formatInteger(entry.lines.length)} سطور</p>
                </div>
              )) : <Empty title="لا توجد قيود" text="ستظهر القيود المحاسبية الأخيرة هنا." />}
            </div>
          </Panel>
        </div>
      ) : null}

      {tab === "records" ? (
        <Panel title="كل السجلات المالية في الفترة">
          {financialRecords.length ? (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-[900px] w-full text-right text-sm">
                <thead className="bg-slate-50 text-xs font-black text-slate-500">
                  <tr>
                    <th className="px-3 py-2">التاريخ</th>
                    <th className="px-3 py-2">النوع</th>
                    <th className="px-3 py-2">البيان</th>
                    <th className="px-3 py-2">الطريقة / الحالة</th>
                    <th className="px-3 py-2">داخل</th>
                    <th className="px-3 py-2">خارج</th>
                    <th className="px-3 py-2">المرجع</th>
                    <th className="px-3 py-2">ملاحظة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-bold">
                  {financialRecords.map((record) => (
                    <tr key={record.id}>
                      <td className="whitespace-nowrap px-3 py-2">{formatFinancialDate(record.date)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{record.type}</td>
                      <td className="px-3 py-2">{record.title}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-500">{record.method}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-emerald-700">{record.amountIn ? money(record.amountIn, currency) : "-"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-red-700">{record.amountOut ? money(record.amountOut, currency) : "-"}</td>
                      <td className="px-3 py-2 text-slate-500">{record.source || "-"}</td>
                      <td className="px-3 py-2 text-slate-500">{record.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="لا توجد سجلات" text="غيّر الفترة أو سجّل مدفوعات ومصروفات وحركات صندوق." />}
        </Panel>
      ) : null}

      {tab === "accounts" ? (
        <Panel
          title="دليل الحسابات"
          action={(
            <button type="button" onClick={() => setAccountFormOpen(true)} className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-black text-white">
              إضافة حساب
            </button>
          )}
        >
          <div className="grid gap-3">
            {accounts.length ? accounts.map((account) => <p key={account.id} className="rounded-lg border border-slate-200 p-3 font-bold">{account.code} · {account.name} · {account.type}</p>) : <Empty title="لا توجد حسابات" text="أضف أول حساب." />}
          </div>
        </Panel>
      ) : null}
      {tab === "journal" ? (
        <SimpleCrudLayout
          formTitle="قيد يدوي متوازن"
          listTitle="القيود"
          form={(
            <form onSubmit={addEntry} className="grid gap-3">
              <SelectField label="مدين" value={entryForm.debitAccountId} options={accounts.map((account) => ({ value: account.id, label: account.name }))} onChange={(debitAccountId) => setEntryForm({ ...entryForm, debitAccountId })} />
              <SelectField label="دائن" value={entryForm.creditAccountId} options={accounts.map((account) => ({ value: account.id, label: account.name }))} onChange={(creditAccountId) => setEntryForm({ ...entryForm, creditAccountId })} />
              <Field label="المبلغ" type="number" min="0" value={entryForm.amount} onChange={(amount) => setEntryForm({ ...entryForm, amount: Number(amount) })} />
              <Field label="البيان" value={entryForm.memo} onChange={(memo) => setEntryForm({ ...entryForm, memo })} />
              <p className={`rounded-md p-2 text-sm font-black ${totalDebit === totalCredit ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>مدين {totalDebit} / دائن {totalCredit}</p>
              <PrimaryButton disabled={!entryForm.amount}>إضافة قيد</PrimaryButton>
            </form>
          )}
        >
          <div className="grid gap-3">
            {rangedEntries.length ? rangedEntries.map((entry) => <p key={entry.id} className="rounded-lg border border-slate-200 p-3 font-bold">{formatFinancialDate(entry.postedAt || entry.createdAt)} · {entry.memo || entry.referenceType} · {journalStatusLabel(entry.status)} · {entry.lines.length} سطور</p>) : <Empty title="لا توجد قيود" text="أضف قيدًا متوازنًا أو غيّر الفترة." />}
          </div>
        </SimpleCrudLayout>
      ) : null}

      {tab === "cash" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="حركة نقدية">
            <form onSubmit={addMovement} className="grid gap-3">
              <SelectField label="الصندوق" value={movementForm.cashRegisterId} options={registers.map((register) => ({ value: register.id, label: register.name }))} onChange={(cashRegisterId) => setMovementForm({ ...movementForm, cashRegisterId })} />
              <SelectField label="النوع" value={movementForm.type} options={["IN", "OUT"].map(option)} onChange={(type) => setMovementForm({ ...movementForm, type })} />
              <Field label="المبلغ" type="number" min="0" value={movementForm.amount} onChange={(amount) => setMovementForm({ ...movementForm, amount: Number(amount) })} />
              <Field label="ملاحظة" value={movementForm.note} onChange={(note) => setMovementForm({ ...movementForm, note })} />
              <PrimaryButton disabled={!movementForm.cashRegisterId}>تسجيل</PrimaryButton>
            </form>
          </Panel>
          <Panel
            title="الصناديق"
            action={(
              <button type="button" onClick={() => setCashRegisterFormOpen(true)} className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-black text-white">
                فتح صندوق
              </button>
            )}
          >
            <div className="grid gap-2">{registers.map((register) => <p key={register.id} className="rounded-md bg-slate-50 p-2 text-sm font-bold">{register.name} ?? {money(register.currentBalance, state.restaurant?.currency)}</p>)}</div>
          </Panel>
          <Panel title="الحركات في الفترة">
            <div className="grid gap-2">{rangedMovements.length ? rangedMovements.map((movement) => <p key={movement.id} className="rounded-md bg-slate-50 p-2 text-sm font-bold">{formatFinancialDate(movement.createdAt)} · {movement.type === "IN" ? "دخول" : "خروج"} · {money(movement.amount, state.restaurant?.currency)} · {movement.note}</p>) : <Empty title="لا توجد حركات" text="غيّر الفترة أو سجّل حركة نقدية." />}</div>
          </Panel>
        </div>
      ) : null}

      <PopupForm open={accountFormOpen} onClose={() => setAccountFormOpen(false)} title="إضافة حساب" maxWidth="md">
        <form onSubmit={addAccount} className="grid gap-3">
          <Field label="الكود" value={accountForm.code} onChange={(code) => setAccountForm({ ...accountForm, code })} />
          <Field label="الاسم" value={accountForm.name} onChange={(name) => setAccountForm({ ...accountForm, name })} />
          <SelectField label="النوع" value={accountForm.type} options={accountTypes.map(option)} onChange={(type) => setAccountForm({ ...accountForm, type })} />
          <div className="flex gap-2">
            <PrimaryButton>إضافة</PrimaryButton>
            <SecondaryButton onClick={() => setAccountFormOpen(false)}>إلغاء</SecondaryButton>
          </div>
        </form>
      </PopupForm>

      <PopupForm open={cashRegisterFormOpen} onClose={() => setCashRegisterFormOpen(false)} title="فتح صندوق" maxWidth="md">
        <form onSubmit={addCashRegister} className="grid gap-3">
          <Field label="الاسم" value={cashForm.name} onChange={(name) => setCashForm({ ...cashForm, name })} />
          <Field label="رصيد افتتاحي" type="number" min="0" value={cashForm.openingBalance} onChange={(openingBalance) => setCashForm({ ...cashForm, openingBalance: Number(openingBalance) })} />
          <div className="flex gap-2">
            <PrimaryButton>فتح</PrimaryButton>
            <SecondaryButton onClick={() => setCashRegisterFormOpen(false)}>إلغاء</SecondaryButton>
          </div>
        </form>
      </PopupForm>
    </OpsShell>
  );
}
