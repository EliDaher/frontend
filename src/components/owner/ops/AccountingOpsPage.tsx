"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AppBadge,
  AppButton,
  AppEmptyState,
  AppFieldShell,
  AppInput,
  AppPageHeader,
  AppSelect,
  AppSurface,
  AppToolbar,
  PopupForm,
  cn
} from "@/components/shared";
import { adminRequest } from "@/lib/api";
import { formatInteger } from "@/lib/format";
import type { Account, CashMovement, CashRegister, Expense, JournalEntry, OperationalPayment } from "@/types/ops";
import { money, OpsShell, useOpsPage } from "./OpsShared";
import {
  accountTypes,
  buildCashSeries,
  buildCurrentMonthRange,
  buildPaymentBreakdown,
  dateRangeLabel,
  formatFinancialDate,
  isWithinDateRange,
  journalStatusLabel,
  nameById,
  numberValue,
  option,
  paymentMethodLabel,
  recordTime,
  run,
  sortByCreatedAtDesc,
  sumAmounts
} from "./OpsPageShared";

type AccountingTab = "overview" | "records" | "accounts" | "journal" | "cash";

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

type AccountForm = {
  code: string;
  name: string;
  type: Account["type"];
  isActive: boolean;
};

type EntryForm = {
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  memo: string;
};

type CashForm = {
  name: string;
  openingBalance: number;
};

type MovementForm = {
  cashRegisterId: string;
  type: CashMovement["type"];
  amount: number;
  note: string;
};

export function AccountingOpsPage() {
  const state = useOpsPage("accounting");
  const [tab, setTab] = useState<AccountingTab>("overview");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [payments, setPayments] = useState<OperationalPayment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [dateRange, setDateRange] = useState(buildCurrentMonthRange);
  const [accountForm, setAccountForm] = useState<AccountForm>({ code: "", name: "", type: "ASSET", isActive: true });
  const [entryForm, setEntryForm] = useState<EntryForm>({ debitAccountId: "", creditAccountId: "", amount: 0, memo: "" });
  const [cashForm, setCashForm] = useState<CashForm>({ name: "", openingBalance: 0 });
  const [movementForm, setMovementForm] = useState<MovementForm>({ cashRegisterId: "", type: "IN", amount: 0, note: "" });
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
      <div className="grid gap-4">
        <AppPageHeader
          title="المحاسبة"
          description="متابعة الحسابات والحركات والأرصدة."
          secondaryActions={(
            <>
              <AppBadge variant="neutral">{dateRangeLabel(dateRange)}</AppBadge>
              <AppBadge variant="primary">{formatInteger(totalPeriodRecords)} سجل</AppBadge>
              <AppBadge variant="neutral">{formatInteger(entries.length)} قيد</AppBadge>
            </>
          )}
        />

        <AppSurface>
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
        </AppSurface>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
          <AccountingSummary title="المقبوضات" value={money(receiptsTotal, currency)} tone="success" />
          <AccountingSummary title="المصروفات" value={money(expensesTotal, currency)} tone="danger" />
          <AccountingSummary title="صافي المقبوضات" value={money(netReceipts, currency)} tone={netReceipts >= 0 ? "success" : "danger"} />
          <AccountingSummary title="دخول الصندوق" value={money(periodCashIn, currency)} tone="success" />
          <AccountingSummary title="خروج الصندوق" value={money(periodCashOut, currency)} tone="danger" />
          <AccountingSummary title="السجلات" value={formatInteger(totalPeriodRecords)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <AccountingSummary title="إجمالي الصناديق" value={money(totalCashBalance, currency)} />
          <AccountingSummary title="إجمالي القيود" value={formatInteger(entries.length)} />
        </div>

        <nav className="flex gap-2 overflow-x-auto rounded-app-lg border border-app-border bg-app-surface p-2" aria-label="أقسام المحاسبة">
          {accountingTabs.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={cn(
                "h-9 shrink-0 rounded-app-md border px-3 text-app-label font-semibold transition-colors",
                tab === item.value
                  ? "border-app-primary bg-app-primary text-app-primary-foreground"
                  : "border-transparent bg-transparent text-app-muted hover:bg-app-surface-muted hover:text-app-ink"
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {tab === "overview" ? (
          <OverviewTab
            cashSeries={cashSeries}
            paymentBreakdown={paymentBreakdown}
            recentMovements={recentMovements}
            recentEntries={recentEntries}
            currency={currency}
          />
        ) : null}

        {tab === "records" ? <RecordsTab records={financialRecords} currency={currency} /> : null}

        {tab === "accounts" ? (
          <AccountsTab accounts={accounts} onAddAccount={() => setAccountFormOpen(true)} />
        ) : null}

        {tab === "journal" ? (
          <JournalTab
            accounts={accounts}
            rangedEntries={rangedEntries}
            entryForm={entryForm}
            setEntryForm={setEntryForm}
            totalDebit={totalDebit}
            totalCredit={totalCredit}
            onSubmit={addEntry}
          />
        ) : null}

        {tab === "cash" ? (
          <CashTab
            registers={registers}
            rangedMovements={rangedMovements}
            movementForm={movementForm}
            setMovementForm={setMovementForm}
            currency={currency}
            onSubmit={addMovement}
            onAddRegister={() => setCashRegisterFormOpen(true)}
          />
        ) : null}
      </div>

      <PopupForm open={accountFormOpen} onClose={() => setAccountFormOpen(false)} title="إضافة حساب" maxWidth="md">
        <form onSubmit={addAccount} className="grid gap-3">
          <AppFieldShell label="الكود">
            <AppInput value={accountForm.code} onChange={(event) => setAccountForm({ ...accountForm, code: event.target.value })} />
          </AppFieldShell>
          <AppFieldShell label="الاسم">
            <AppInput value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} />
          </AppFieldShell>
          <AppFieldShell label="النوع">
            <AppSelect value={accountForm.type} onChange={(event) => setAccountForm({ ...accountForm, type: event.target.value as Account["type"] })}>
              {accountTypes.map((type) => <option key={type} value={type}>{option(type).label}</option>)}
            </AppSelect>
          </AppFieldShell>
          <div className="flex flex-wrap gap-2">
            <AppButton type="submit">إضافة</AppButton>
            <AppButton type="button" variant="secondary" onClick={() => setAccountFormOpen(false)}>إلغاء</AppButton>
          </div>
        </form>
      </PopupForm>

      <PopupForm open={cashRegisterFormOpen} onClose={() => setCashRegisterFormOpen(false)} title="فتح صندوق" maxWidth="md">
        <form onSubmit={addCashRegister} className="grid gap-3">
          <AppFieldShell label="الاسم">
            <AppInput value={cashForm.name} onChange={(event) => setCashForm({ ...cashForm, name: event.target.value })} />
          </AppFieldShell>
          <AppFieldShell label="رصيد افتتاحي">
            <AppInput type="number" min="0" value={cashForm.openingBalance} onChange={(event) => setCashForm({ ...cashForm, openingBalance: Number(event.target.value) })} />
          </AppFieldShell>
          <div className="flex flex-wrap gap-2">
            <AppButton type="submit">فتح</AppButton>
            <AppButton type="button" variant="secondary" onClick={() => setCashRegisterFormOpen(false)}>إلغاء</AppButton>
          </div>
        </form>
      </PopupForm>
    </OpsShell>
  );
}

function OverviewTab({
  cashSeries,
  paymentBreakdown,
  recentMovements,
  recentEntries,
  currency
}: {
  cashSeries: ReturnType<typeof buildCashSeries>;
  paymentBreakdown: ReturnType<typeof buildPaymentBreakdown>;
  recentMovements: CashMovement[];
  recentEntries: JournalEntry[];
  currency?: string;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <AppSurface title="حركة النقد في الفترة">
        <CashMovementBars data={cashSeries} currency={currency} />
      </AppSurface>
      <AppSurface title="وسائل الدفع في الفترة">
        <PaymentMethodBars data={paymentBreakdown} currency={currency} />
      </AppSurface>
      <AppSurface title="آخر الحركات النقدية في الفترة">
        <div className="grid gap-2">
          {recentMovements.length ? recentMovements.map((movement) => (
            <div key={movement.id} className="flex items-center justify-between gap-3 rounded-app-md border border-app-border bg-app-surface-muted p-3 text-app-body">
              <div className="min-w-0">
                <p className="font-semibold text-app-ink">{movement.type === "IN" ? "دخول نقدي" : "خروج نقدي"}</p>
                <p className="mt-1 truncate text-app-helper text-app-muted">{movement.note || movement.referenceType}</p>
              </div>
              <span className={cn("shrink-0 font-semibold", movement.type === "IN" ? "text-app-success" : "text-app-danger")}>{money(movement.amount, currency)}</span>
            </div>
          )) : <AppEmptyState title="لا توجد حركات" description="ستظهر الحركات النقدية الأخيرة هنا." />}
        </div>
      </AppSurface>
      <AppSurface title="آخر القيود في الفترة">
        <div className="grid gap-2">
          {recentEntries.length ? recentEntries.map((entry) => (
            <div key={entry.id} className="rounded-app-md border border-app-border bg-app-surface-muted p-3 text-app-body">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate font-semibold text-app-ink">{entry.memo || entry.referenceType}</p>
                <JournalStatusBadge status={entry.status} />
              </div>
              <p className="mt-1 text-app-helper text-app-muted">{formatInteger(entry.lines.length)} سطور</p>
            </div>
          )) : <AppEmptyState title="لا توجد قيود" description="ستظهر القيود المحاسبية الأخيرة هنا." />}
        </div>
      </AppSurface>
    </div>
  );
}

function RecordsTab({ records, currency }: { records: FinancialRecordRow[]; currency?: string }) {
  if (!records.length) {
    return <AppEmptyState title="لا توجد سجلات" description="غيّر الفترة أو سجّل مدفوعات ومصروفات وحركات صندوق." />;
  }

  return (
    <AppSurface title="كل السجلات المالية في الفترة">
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[900px] border-separate border-spacing-0 text-right text-app-body">
          <thead>
            <tr className="text-app-label text-app-muted">
              <th className="border-b border-app-border px-3 py-2 font-semibold">التاريخ</th>
              <th className="border-b border-app-border px-3 py-2 font-semibold">النوع</th>
              <th className="border-b border-app-border px-3 py-2 font-semibold">البيان</th>
              <th className="border-b border-app-border px-3 py-2 font-semibold">الطريقة / الحالة</th>
              <th className="border-b border-app-border px-3 py-2 font-semibold">داخل</th>
              <th className="border-b border-app-border px-3 py-2 font-semibold">خارج</th>
              <th className="border-b border-app-border px-3 py-2 font-semibold">المرجع</th>
              <th className="border-b border-app-border px-3 py-2 font-semibold">ملاحظة</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="align-middle">
                <td className="whitespace-nowrap border-b border-app-border px-3 py-3">{formatFinancialDate(record.date)}</td>
                <td className="whitespace-nowrap border-b border-app-border px-3 py-3"><AppBadge variant="neutral">{record.type}</AppBadge></td>
                <td className="border-b border-app-border px-3 py-3 font-semibold text-app-ink">{record.title}</td>
                <td className="whitespace-nowrap border-b border-app-border px-3 py-3 text-app-muted">{record.method}</td>
                <td className="whitespace-nowrap border-b border-app-border px-3 py-3 font-semibold text-app-success">{record.amountIn ? money(record.amountIn, currency) : "-"}</td>
                <td className="whitespace-nowrap border-b border-app-border px-3 py-3 font-semibold text-app-danger">{record.amountOut ? money(record.amountOut, currency) : "-"}</td>
                <td className="border-b border-app-border px-3 py-3 text-app-muted">{record.source || "-"}</td>
                <td className="max-w-xs border-b border-app-border px-3 py-3 text-app-muted"><span className="block truncate">{record.note || "-"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 lg:hidden">
        {records.map((record) => (
          <article key={record.id} className="rounded-app-md border border-app-border bg-app-surface p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <AppBadge variant="neutral">{record.type}</AppBadge>
                  <span className="text-app-helper text-app-muted">{formatFinancialDate(record.date)}</span>
                </div>
                <p className="mt-2 truncate font-semibold text-app-ink">{record.title}</p>
                <p className="mt-1 truncate text-app-helper text-app-muted">{record.method} · {record.source || "-"}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <FinancialFact label="داخل" value={record.amountIn ? money(record.amountIn, currency) : "-"} tone="success" />
              <FinancialFact label="خارج" value={record.amountOut ? money(record.amountOut, currency) : "-"} tone="danger" />
            </div>
            {record.note ? <p className="mt-3 truncate text-app-helper text-app-muted">{record.note}</p> : null}
          </article>
        ))}
      </div>
    </AppSurface>
  );
}

function AccountsTab({ accounts, onAddAccount }: { accounts: Account[]; onAddAccount: () => void }) {
  return (
    <AppSurface title="دليل الحسابات" action={<AppButton type="button" onClick={onAddAccount}>إضافة حساب</AppButton>}>
      {accounts.length ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-right text-app-body">
              <thead>
                <tr className="text-app-label text-app-muted">
                  <th className="border-b border-app-border px-3 py-2 font-semibold">الكود</th>
                  <th className="border-b border-app-border px-3 py-2 font-semibold">الحساب</th>
                  <th className="border-b border-app-border px-3 py-2 font-semibold">النوع</th>
                  <th className="border-b border-app-border px-3 py-2 font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td className="border-b border-app-border px-3 py-3 font-semibold text-app-ink">{account.code}</td>
                    <td className="border-b border-app-border px-3 py-3 text-app-ink">{account.name}</td>
                    <td className="border-b border-app-border px-3 py-3 text-app-muted">{account.type}</td>
                    <td className="border-b border-app-border px-3 py-3"><AccountStatusBadge active={account.isActive} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2 md:hidden">
            {accounts.map((account) => (
              <article key={account.id} className="rounded-app-md border border-app-border bg-app-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-app-ink">{account.code} · {account.name}</p>
                    <p className="mt-1 text-app-helper text-app-muted">{account.type}</p>
                  </div>
                  <AccountStatusBadge active={account.isActive} />
                </div>
              </article>
            ))}
          </div>
        </>
      ) : <AppEmptyState title="لا توجد حسابات" description="أضف أول حساب." action={<AppButton type="button" onClick={onAddAccount}>إضافة حساب</AppButton>} />}
    </AppSurface>
  );
}

function JournalTab({
  accounts,
  rangedEntries,
  entryForm,
  setEntryForm,
  totalDebit,
  totalCredit,
  onSubmit
}: {
  accounts: Account[];
  rangedEntries: JournalEntry[];
  entryForm: EntryForm;
  setEntryForm: (form: EntryForm) => void;
  totalDebit: number;
  totalCredit: number;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <AppSurface title="قيد يدوي متوازن">
        <form onSubmit={onSubmit} className="grid gap-3">
          <AppFieldShell label="مدين">
            <AppSelect value={entryForm.debitAccountId} onChange={(event) => setEntryForm({ ...entryForm, debitAccountId: event.target.value })}>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </AppSelect>
          </AppFieldShell>
          <AppFieldShell label="دائن">
            <AppSelect value={entryForm.creditAccountId} onChange={(event) => setEntryForm({ ...entryForm, creditAccountId: event.target.value })}>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </AppSelect>
          </AppFieldShell>
          <AppFieldShell label="المبلغ">
            <AppInput type="number" min="0" value={entryForm.amount} onChange={(event) => setEntryForm({ ...entryForm, amount: Number(event.target.value) })} />
          </AppFieldShell>
          <AppFieldShell label="البيان">
            <AppInput value={entryForm.memo} onChange={(event) => setEntryForm({ ...entryForm, memo: event.target.value })} />
          </AppFieldShell>
          <div className={cn("rounded-app-md border px-3 py-2 text-app-body font-semibold", totalDebit === totalCredit ? "border-app-success-soft bg-app-success-soft text-app-success" : "border-app-danger-soft bg-app-danger-soft text-app-danger")}>
            مدين {totalDebit} / دائن {totalCredit}
          </div>
          <AppButton type="submit" disabled={!entryForm.amount}>إضافة قيد</AppButton>
        </form>
      </AppSurface>
      <AppSurface title="القيود">
        {rangedEntries.length ? (
          <div className="grid gap-2">
            {rangedEntries.map((entry) => (
              <div key={entry.id} className="rounded-app-md border border-app-border bg-app-surface-muted p-3 text-app-body">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-app-ink">{entry.memo || entry.referenceType}</p>
                  <JournalStatusBadge status={entry.status} />
                </div>
                <p className="mt-1 text-app-helper text-app-muted">{formatFinancialDate(entry.postedAt || entry.createdAt)} · {entry.lines.length} سطور</p>
              </div>
            ))}
          </div>
        ) : <AppEmptyState title="لا توجد قيود" description="أضف قيدًا متوازنًا أو غيّر الفترة." />}
      </AppSurface>
    </div>
  );
}

function CashTab({
  registers,
  rangedMovements,
  movementForm,
  setMovementForm,
  currency,
  onSubmit,
  onAddRegister
}: {
  registers: CashRegister[];
  rangedMovements: CashMovement[];
  movementForm: MovementForm;
  setMovementForm: (form: MovementForm) => void;
  currency?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onAddRegister: () => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <AppSurface title="حركة نقدية">
        <form onSubmit={onSubmit} className="grid gap-3">
          <AppFieldShell label="الصندوق">
            <AppSelect value={movementForm.cashRegisterId} onChange={(event) => setMovementForm({ ...movementForm, cashRegisterId: event.target.value })}>
              {registers.map((register) => <option key={register.id} value={register.id}>{register.name}</option>)}
            </AppSelect>
          </AppFieldShell>
          <AppFieldShell label="النوع">
            <AppSelect value={movementForm.type} onChange={(event) => setMovementForm({ ...movementForm, type: event.target.value as CashMovement["type"] })}>
              {["IN", "OUT"].map((type) => <option key={type} value={type}>{option(type).label}</option>)}
            </AppSelect>
          </AppFieldShell>
          <AppFieldShell label="المبلغ">
            <AppInput type="number" min="0" value={movementForm.amount} onChange={(event) => setMovementForm({ ...movementForm, amount: Number(event.target.value) })} />
          </AppFieldShell>
          <AppFieldShell label="ملاحظة">
            <AppInput value={movementForm.note} onChange={(event) => setMovementForm({ ...movementForm, note: event.target.value })} />
          </AppFieldShell>
          <AppButton type="submit" disabled={!movementForm.cashRegisterId}>تسجيل</AppButton>
        </form>
      </AppSurface>

      <AppSurface title="الصناديق" action={<AppButton type="button" onClick={onAddRegister}>فتح صندوق</AppButton>}>
        {registers.length ? (
          <div className="grid gap-2">
            {registers.map((register) => (
              <div key={register.id} className="rounded-app-md border border-app-border bg-app-surface-muted p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-app-ink">{register.name}</p>
                  <AccountStatusBadge active={register.isOpen} />
                </div>
                <p className="mt-1 text-app-body font-semibold text-app-ink">{money(register.currentBalance, currency)}</p>
              </div>
            ))}
          </div>
        ) : <AppEmptyState title="لا توجد صناديق" description="افتح صندوقًا قبل تسجيل حركة نقدية." action={<AppButton type="button" onClick={onAddRegister}>فتح صندوق</AppButton>} />}
      </AppSurface>

      <AppSurface title="الحركات في الفترة" className="xl:col-span-2">
        {rangedMovements.length ? (
          <div className="grid gap-2">
            {rangedMovements.map((movement) => (
              <div key={movement.id} className="grid gap-2 rounded-app-md border border-app-border bg-app-surface-muted p-3 text-app-body md:grid-cols-[160px_120px_1fr_160px] md:items-center">
                <span className="text-app-muted">{formatFinancialDate(movement.createdAt)}</span>
                <AppBadge variant={movement.type === "IN" ? "success" : "danger"}>{movement.type === "IN" ? "دخول" : "خروج"}</AppBadge>
                <span className="min-w-0 truncate text-app-muted">{movement.note || movement.referenceType}</span>
                <span className={cn("font-semibold", movement.type === "IN" ? "text-app-success" : "text-app-danger")}>{money(movement.amount, currency)}</span>
              </div>
            ))}
          </div>
        ) : <AppEmptyState title="لا توجد حركات" description="غيّر الفترة أو سجّل حركة نقدية." />}
      </AppSurface>
    </div>
  );
}

function AccountingSummary({ title, value, tone = "neutral" }: { title: string; value: string; tone?: "neutral" | "success" | "danger" }) {
  return (
    <div className="rounded-app-md border border-app-border bg-app-surface p-3">
      <p className="text-app-helper font-medium text-app-muted">{title}</p>
      <p className={cn("mt-1 truncate font-semibold", tone === "success" ? "text-app-success" : tone === "danger" ? "text-app-danger" : "text-app-ink")}>{value}</p>
    </div>
  );
}

function FinancialFact({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "success" | "danger" }) {
  return (
    <div className="rounded-app-sm border border-app-border bg-app-surface-muted px-3 py-2">
      <p className="text-app-helper text-app-muted">{label}</p>
      <p className={cn("mt-1 truncate font-semibold", tone === "success" ? "text-app-success" : tone === "danger" ? "text-app-danger" : "text-app-ink")}>{value}</p>
    </div>
  );
}

function CashMovementBars({ data, currency }: { data: ReturnType<typeof buildCashSeries>; currency?: string }) {
  const maxAmount = Math.max(...data.flatMap((point) => [point.cashIn, point.cashOut]), 0);
  if (maxAmount <= 0) {
    return <AppEmptyState title="لا توجد حركة نقدية" description="ستظهر حركة الدخول والخروج عند تسجيل عمليات نقدية." />;
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3 text-app-label font-semibold">
        <span className="inline-flex items-center gap-1 text-app-success"><span className="h-2 w-2 rounded-full bg-app-success" /> دخول</span>
        <span className="inline-flex items-center gap-1 text-app-danger"><span className="h-2 w-2 rounded-full bg-app-danger" /> خروج</span>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))" }}>
        {data.map((point) => {
          const inHeight = Math.max(8, Math.round((point.cashIn / maxAmount) * 120));
          const outHeight = Math.max(8, Math.round((point.cashOut / maxAmount) * 120));
          return (
            <div key={point.key} className="grid gap-2 text-center">
              <div className="flex h-32 items-end justify-center gap-1 rounded-app-md border border-app-border bg-app-surface-muted p-2">
                <div className="w-3 rounded-t bg-app-success" style={{ height: point.cashIn ? inHeight : 4 }} title={money(point.cashIn, currency)} />
                <div className="w-3 rounded-t bg-app-danger" style={{ height: point.cashOut ? outHeight : 4 }} title={money(point.cashOut, currency)} />
              </div>
              <p className="text-app-helper font-medium text-app-muted">{point.label}</p>
              <p className={cn("text-app-helper font-semibold", point.net >= 0 ? "text-app-success" : "text-app-danger")}>{money(point.net, currency)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PaymentMethodBars({ data, currency }: { data: ReturnType<typeof buildPaymentBreakdown>; currency?: string }) {
  const maxAmount = Math.max(...data.map((point) => point.amount), 0);
  if (maxAmount <= 0) {
    return <AppEmptyState title="لا توجد مدفوعات" description="ستظهر وسائل الدفع بعد تسجيل المدفوعات." />;
  }

  return (
    <div className="grid gap-3">
      {data.map((point) => (
        <div key={point.method} className="grid gap-1">
          <div className="flex items-center justify-between gap-3 text-app-label font-semibold">
            <span>{paymentMethodLabel(point.method)}</span>
            <span>{money(point.amount, currency)}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-app-sm bg-app-surface-muted">
            <div className="h-full rounded-app-sm bg-app-primary" style={{ width: `${Math.max(6, (point.amount / maxAmount) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function JournalStatusBadge({ status }: { status: JournalEntry["status"] }) {
  const variant = status === "POSTED" ? "success" : status === "REVERSED" ? "danger" : "warning";
  return <AppBadge variant={variant}>{journalStatusLabel(status)}</AppBadge>;
}

function AccountStatusBadge({ active }: { active: boolean }) {
  return active ? <AppBadge variant="success">نشط</AppBadge> : <AppBadge variant="neutral">غير فعال</AppBadge>;
}

const accountingTabs: Array<{ value: AccountingTab; label: string }> = [
  { value: "overview", label: "نظرة عامة" },
  { value: "records", label: "كل السجلات" },
  { value: "accounts", label: "الحسابات" },
  { value: "journal", label: "القيود" },
  { value: "cash", label: "الصندوق" }
];
