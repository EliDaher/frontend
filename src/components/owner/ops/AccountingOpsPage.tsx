"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppBadge,
  AppButton,
  AppEmptyState,
  AppFieldShell,
  AppInput,
  AppSelect,
  AppSurface,
  PopupForm,
  cn
} from "@/components/shared";
import { adminRequest } from "@/lib/api";
import { formatInteger } from "@/lib/format";
import { createActionGuard } from "@/offline/action-guard";
import { useLiveQuery } from "@/offline/hooks/useLiveQuery";
import {
  createLocalCashMovement,
  hydrateFinancialHistory,
  getPendingCashBalanceEffect,
  listLocalAccounts,
  listLocalCashMovements,
  listLocalCashRegisters,
  listLocalExpenses,
  listLocalJournalEntries,
  listLocalPayments,
  refreshFinancialHistory
} from "@/offline/repositories/financial-history";
import { hydrateOrders, listLocalOrders, refreshOrders } from "@/offline/repositories/orders";
import { hydrateTables, listLocalTables, refreshTables } from "@/offline/repositories/tables";
import type { OfflineContext } from "@/offline/repositories/tables";
import type { LocalCashMovement } from "@/offline/schema";
import type { Account, CashMovement, CashRegister, Expense, JournalEntry, OperationalPayment, OpsOrder, OpsTable } from "@/types/ops";
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
  const [dateRange, setDateRange] = useState(buildCurrentMonthRange);
  const [accountForm, setAccountForm] = useState<AccountForm>({ code: "", name: "", type: "ASSET", isActive: true });
  const [entryForm, setEntryForm] = useState<EntryForm>({ debitAccountId: "", creditAccountId: "", amount: 0, memo: "" });
  const [cashForm, setCashForm] = useState<CashForm>({ name: "", openingBalance: 0 });
  const [movementForm, setMovementForm] = useState<MovementForm>({ cashRegisterId: "", type: "IN", amount: 0, note: "" });
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [cashRegisterFormOpen, setCashRegisterFormOpen] = useState(false);
  const [movementBusy, setMovementBusy] = useState(false);
  const movementGuard = useRef(createActionGuard());
  const tenantId = state.restaurant?.id ?? "";
  const offlineContext = useMemo<OfflineContext | null>(() => {
    if (!state.token || !tenantId) return null;
    return { token: state.token, tenantId, userId: state.restaurant?.ownerUserId ?? "owner" };
  }, [state.restaurant?.ownerUserId, state.token, tenantId]);
  const { value: accounts } = useLiveQuery(() => tenantId ? listLocalAccounts(tenantId) : Promise.resolve([]), [] as Account[], [tenantId]);
  const { value: entries } = useLiveQuery(() => tenantId ? listLocalJournalEntries(tenantId) : Promise.resolve([]), [] as JournalEntry[], [tenantId]);
  const { value: registers } = useLiveQuery(() => tenantId ? listLocalCashRegisters(tenantId) : Promise.resolve([]), [] as CashRegister[], [tenantId]);
  const { value: movements } = useLiveQuery(() => tenantId ? listLocalCashMovements(tenantId) : Promise.resolve([]), [] as LocalCashMovement[], [tenantId]);
  const { value: payments } = useLiveQuery(() => tenantId ? listLocalPayments(tenantId) : Promise.resolve([]), [] as OperationalPayment[], [tenantId]);
  const { value: expenses } = useLiveQuery(() => tenantId ? listLocalExpenses(tenantId) : Promise.resolve([]), [] as Expense[], [tenantId]);
  const { value: orders } = useLiveQuery(() => tenantId ? listLocalOrders(tenantId) : Promise.resolve([]), [] as OpsOrder[], [tenantId]);
  const { value: tables } = useLiveQuery(() => tenantId ? listLocalTables(tenantId) : Promise.resolve([]), [] as OpsTable[], [tenantId]);
  const { value: pendingCashEffect } = useLiveQuery(() => tenantId ? getPendingCashBalanceEffect(tenantId) : Promise.resolve(0), 0, [tenantId]);

  useEffect(() => {
    if (offlineContext && state.modules?.accounting) void load();
  }, [offlineContext, state.modules?.accounting]);

  useEffect(() => {
    setEntryForm((current) => ({ ...current, debitAccountId: current.debitAccountId || accounts[0]?.id || "", creditAccountId: current.creditAccountId || accounts[1]?.id || "" }));
  }, [accounts]);

  useEffect(() => {
    setMovementForm((current) => ({ ...current, cashRegisterId: current.cashRegisterId || registers[0]?.id || "" }));
  }, [registers]);

  async function load() {
    if (!offlineContext) return;
    hydrateFinancialHistory(offlineContext);
    void hydrateOrders(offlineContext);
    void hydrateTables(offlineContext);
  }

  async function refreshHistory() {
    if (!offlineContext) return;
    await Promise.all([refreshFinancialHistory(offlineContext), refreshOrders(offlineContext), refreshTables(offlineContext)]);
  }

  async function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(state, async () => {
      await adminRequest("/api/owner/ops/accounts", state.token, { method: "POST", body: JSON.stringify(accountForm) });
      setAccountForm({ code: "", name: "", type: "ASSET", isActive: true });
      setAccountFormOpen(false);
      await refreshHistory();
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
      await refreshHistory();
    });
  }

  async function addCashRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(state, async () => {
      await adminRequest("/api/owner/ops/cash/registers", state.token, { method: "POST", body: JSON.stringify(cashForm) });
      setCashForm({ name: "", openingBalance: 0 });
      setCashRegisterFormOpen(false);
      await refreshHistory();
    });
  }

  async function addMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!movementForm.cashRegisterId) {
      state.setMessage("اختر الصندوق.");
      return;
    }
    if (movementForm.amount <= 0) {
      state.setMessage("أدخل مبلغًا صحيحًا.");
      return;
    }
    await movementGuard.current.run(async () => {
      setMovementBusy(true);
      try {
        await run(state, async () => {
          if (!offlineContext) throw new Error("تعذر تجهيز التخزين المحلي للحركة.");
          await createLocalCashMovement(offlineContext, { ...movementForm, referenceType: "MANUAL", referenceId: "manual" });
          setMovementForm({ ...movementForm, amount: 0, note: "" });
        }, "تم تسجيل حركة الصندوق على الجهاز — بانتظار المزامنة");
      } finally {
        setMovementBusy(false);
      }
    });
  }

  const totalDebit = entryForm.amount;
  const totalCredit = entryForm.amount;
  const currency = state.restaurant?.currency;
  const rangedPayments = useMemo(() => payments.filter((payment) => isWithinDateRange(payment.paidAt || payment.createdAt, dateRange.from, dateRange.to)), [dateRange.from, dateRange.to, payments]);
  const rangedMovements = useMemo(() => movements.filter((movement) => isWithinDateRange(movement.createdAt, dateRange.from, dateRange.to)), [dateRange.from, dateRange.to, movements]);
  const rangedEntries = useMemo(() => entries.filter((entry) => isWithinDateRange(entry.postedAt || entry.createdAt, dateRange.from, dateRange.to)), [dateRange.from, dateRange.to, entries]);
  const periodCashIn = useMemo(() => sumAmounts(rangedMovements.filter((movement) => movement.type === "IN")), [rangedMovements]);
  const periodCashOut = useMemo(() => sumAmounts(rangedMovements.filter((movement) => movement.type === "OUT")), [rangedMovements]);
  const estimatedCashBalance = useMemo(() => registers.reduce((sum, register) => sum + numberValue(register.currentBalance), 0), [registers]);
  const cashSeries = useMemo(() => buildCashSeries(rangedMovements, dateRange), [dateRange, rangedMovements]);
  const paymentBreakdown = useMemo(() => buildPaymentBreakdown(rangedPayments), [rangedPayments]);
  const totalPeriodRecords = rangedMovements.length;
  const financialRecords = useMemo<FinancialRecordRow[]>(() => {
    return rangedMovements.map((movement) => {
      const payment = payments.find((item) => item.id === movement.referenceId);
      const order = orders.find((item) => item.id === payment?.orderId || item.paymentId === movement.referenceId ||
        item.id === movement.referenceId || `order_${item.id}` === movement.id || `cancel_order_${item.id}` === movement.id);
      const table = tables.find((item) => item.id === order?.tableId);
      const orderLabel = order ? (table ? `طاولة ${table.name}` : order.type === "DELIVERY" ? "طلب توصيل" : order.type === "TAKEAWAY" ? "طلب سفري" : "طلب بدون طاولة") : "";
      const expense = expenses.find((item) => item.id === movement.referenceId);
      const reason = movement.referenceType === "ORDER_CANCEL" ? "إرجاع مبلغ طلب ملغى" :
        payment ? (payment.type === "SALE" ? "دفع طلب" : payment.type === "REFUND" ? "إرجاع مبلغ" : "دفع مشتريات") :
        expense?.category || (movement.type === "IN" ? "إضافة مال إلى الصندوق" : "سحب مال من الصندوق");
      return {
        id: movement.id,
        date: movement.createdAt || "",
        type: movement.type === "IN" ? "دخول" : "خروج",
        title: orderLabel ? `${reason} · ${orderLabel}` : reason,
        method: payment ? paymentMethodLabel(payment.method) : nameById(registers, movement.cashRegisterId),
        amountIn: movement.type === "IN" ? numberValue(movement.amount) : 0,
        amountOut: movement.type === "OUT" ? numberValue(movement.amount) : 0,
        note: [order?.items.map((item) => `${formatInteger(item.quantity)} × ${item.name}`).join("، "), movement.note].filter(Boolean).join(" · "),
        source: order ? `وقت الطلب: ${financialDateTime(order.orderedAt || order.createdAt || "")}` : ""
      };
    }).sort((first, second) => recordTime(second.date) - recordTime(first.date));
  }, [rangedMovements, payments, expenses, orders, tables, registers]);

  return (
    <OpsShell title="حركة المال والصندوق" eyebrow="الدخول والخروج والرصيد" module="accounting" state={state} onRefresh={() => void Promise.all([state.loadRestaurant(), refreshHistory()])}>
      <div className="grid gap-4">
        <header className="flex flex-col gap-4 rounded-app-lg border border-app-border bg-app-surface p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-app-page-title font-semibold text-app-ink">حركة المال والصندوق</h1>
              <AppBadge variant="primary">{formatInteger(totalPeriodRecords)} حركة</AppBadge>
            </div>
            <p className="mt-1 text-app-helper text-app-muted">الدخول والخروج وتفاصيل طلبات الطاولات في مكان واحد.</p>
          </div>
          <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex min-w-0 items-center gap-2 text-app-helper text-app-muted">
                <span>من</span>
                <AppInput aria-label="بداية الفترة" className="min-w-0 sm:w-40" type="date" max={dateRange.to} value={dateRange.from} onChange={(event) => { const from = event.target.value; if (from) setDateRange((current) => ({ from, to: from > current.to ? from : current.to })); }} />
              </label>
              <label className="flex min-w-0 items-center gap-2 text-app-helper text-app-muted">
                <span>إلى</span>
                <AppInput aria-label="نهاية الفترة" className="min-w-0 sm:w-40" type="date" min={dateRange.from} value={dateRange.to} onChange={(event) => { const to = event.target.value; if (to) setDateRange((current) => ({ from: to < current.from ? to : current.from, to })); }} />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <AppButton type="button" variant="secondary" onClick={() => { const today = buildCurrentMonthRange().to; setDateRange({ from: today, to: today }); }}>اليوم</AppButton>
              <AppButton type="button" variant="secondary" onClick={() => setDateRange(buildCurrentMonthRange())}>الشهر الحالي</AppButton>
            </div>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AccountingSummary title="الداخل خلال الفترة" value={money(periodCashIn, currency)} tone="success" />
          <AccountingSummary title="الخارج خلال الفترة" value={money(periodCashOut, currency)} tone="danger" />
          <AccountingSummary title="صافي الفترة" value={money(periodCashIn - periodCashOut, currency)} tone={periodCashIn >= periodCashOut ? "success" : "danger"} />
          <AccountingSummary title={pendingCashEffect ? "رصيد الصندوق الحالي (بانتظار المزامنة)" : "رصيد الصندوق الحالي"} value={money(estimatedCashBalance, currency)} />
        </div>

        {pendingCashEffect ? (
          <p className="rounded-app-md border border-app-warning-soft bg-app-warning-soft p-3 text-app-body font-semibold text-app-warning">
            أرصدة الصناديق المحلية تتضمن حركات مالية بانتظار المزامنة. الرصيد التقديري مفيد للتشغيل المحلي، لكنه ليس رصيدًا مؤكدًا حتى تكتمل المزامنة.
          </p>
        ) : null}

        <nav className="flex gap-2 overflow-x-auto rounded-app-lg border border-app-border bg-app-surface p-2" aria-label="أقسام المحاسبة">
          {accountingTabs.filter((item) => !["accounts", "journal"].includes(item.value)).map((item) => (
            <button
              key={item.value}
              type="button"
              aria-current={tab === item.value ? "page" : undefined}
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
            records={financialRecords.slice(0, 5)}
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
            records={financialRecords}
            movementForm={movementForm}
            setMovementForm={setMovementForm}
            currency={currency}
            pendingCashEffect={pendingCashEffect}
            movementBusy={movementBusy}
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

function OverviewTab({ cashSeries, paymentBreakdown, records, currency }: {
  cashSeries: ReturnType<typeof buildCashSeries>;
  paymentBreakdown: ReturnType<typeof buildPaymentBreakdown>;
  records: FinancialRecordRow[];
  currency?: string;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <AppSurface title="الدخول والخروج خلال الفترة"><CashMovementBars data={cashSeries} currency={currency} /></AppSurface>
        <AppSurface title="طرق الدفع">
          {paymentBreakdown.length ? (
            <div className="grid gap-2">
              {paymentBreakdown.map((point) => (
                <div key={point.method} className="flex items-center justify-between gap-3 rounded-app-md bg-app-surface-muted px-3 py-2 text-app-body">
                  <span className="text-app-muted">{paymentMethodLabel(point.method)}</span>
                  <span className="whitespace-nowrap font-semibold text-app-ink">{money(point.amount, currency)}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-app-helper text-app-muted">لا توجد دفعات خلال الفترة.</p>}
        </AppSurface>
      </div>
      <RecordsTab records={records} currency={currency} title="آخر ٥ حركات خلال الفترة" />
    </div>
  );
}

function RecordsTab({ records, currency, title = "الدخول والخروج خلال الفترة" }: { records: FinancialRecordRow[]; currency?: string; title?: string }) {
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("all");
  const filteredRecords = records.filter((record) => (direction === "all" || (direction === "in" ? record.amountIn > 0 : record.amountOut > 0)) && `${record.title} ${record.note} ${record.source} ${record.method}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  if (!records.length) {
    return <AppEmptyState title="لا توجد سجلات" description="غيّر الفترة أو سجّل مدفوعات ومصروفات وحركات صندوق." />;
  }

  return (
    <AppSurface title={title}>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <AppInput aria-label="البحث في الحركات" placeholder="ابحث بالطاولة أو الصنف أو سبب الحركة…" value={search} onChange={(event) => setSearch(event.target.value)} />
        <AppSelect aria-label="نوع الحركة" className="sm:w-40" value={direction} onChange={(event) => setDirection(event.target.value)}>
          <option value="all">دخول وخروج</option><option value="in">الدخول فقط</option><option value="out">الخروج فقط</option>
        </AppSelect>
      </div>
      {!filteredRecords.length ? <AppEmptyState title="لا توجد حركات مطابقة" description="جرّب تغيير البحث أو نوع الحركة." /> : null}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[900px] border-separate border-spacing-0 text-right text-app-body">
          <thead>
            <tr className="text-app-label text-app-muted">
              <th className="border-b border-app-border px-3 py-2 font-semibold">التاريخ</th>
              <th className="border-b border-app-border px-3 py-2 font-semibold">النوع</th>
              <th className="border-b border-app-border px-3 py-2 font-semibold">البيان</th>
              <th className="border-b border-app-border px-3 py-2 font-semibold">طريقة الدفع / الصندوق</th>
              <th className="border-b border-app-border px-3 py-2 font-semibold">داخل</th>
              <th className="border-b border-app-border px-3 py-2 font-semibold">خارج</th>
              <th className="border-b border-app-border px-3 py-2 font-semibold">وقت الطلب</th>
              <th className="border-b border-app-border px-3 py-2 font-semibold">الأصناف والملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map((record) => (
              <tr key={record.id} className="align-middle">
                <td className="whitespace-nowrap border-b border-app-border px-3 py-3">{financialDateTime(record.date)}</td>
                <td className="whitespace-nowrap border-b border-app-border px-3 py-3"><AppBadge variant="neutral">{record.type}</AppBadge></td>
                <td className="border-b border-app-border px-3 py-3 font-semibold text-app-ink">{record.title}</td>
                <td className="whitespace-nowrap border-b border-app-border px-3 py-3 text-app-muted">{record.method}</td>
                <td className="whitespace-nowrap border-b border-app-border px-3 py-3 font-semibold text-app-success">{record.amountIn ? money(record.amountIn, currency) : "-"}</td>
                <td className="whitespace-nowrap border-b border-app-border px-3 py-3 font-semibold text-app-danger">{record.amountOut ? money(record.amountOut, currency) : "-"}</td>
                <td className="border-b border-app-border px-3 py-3 text-app-muted">{record.source || "-"}</td>
                <td className="max-w-xs border-b border-app-border px-3 py-3 text-app-muted"><span className="block whitespace-normal">{record.note || "-"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 lg:hidden">
        {filteredRecords.map((record) => (
          <article key={record.id} className="rounded-app-md border border-app-border bg-app-surface p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <AppBadge variant="neutral">{record.type}</AppBadge>
                  <span className="text-app-helper text-app-muted">{financialDateTime(record.date)}</span>
                </div>
                <p className="mt-2 truncate font-semibold text-app-ink">{record.title}</p>
                <p className="mt-1 text-app-helper text-app-muted">{[record.method, record.source].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <FinancialFact label="داخل" value={record.amountIn ? money(record.amountIn, currency) : "-"} tone="success" />
              <FinancialFact label="خارج" value={record.amountOut ? money(record.amountOut, currency) : "-"} tone="danger" />
            </div>
            {record.note ? <p className="mt-3 text-app-helper text-app-muted">{record.note}</p> : null}
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
  records,
  registers,
  rangedMovements,
  movementForm,
  setMovementForm,
  currency,
  pendingCashEffect,
  movementBusy,
  onSubmit,
  onAddRegister
}: {
  records: FinancialRecordRow[];
  registers: CashRegister[];
  rangedMovements: LocalCashMovement[];
  movementForm: MovementForm;
  setMovementForm: (form: MovementForm) => void;
  currency?: string;
  pendingCashEffect: number;
  movementBusy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onAddRegister: () => void;
}) {
  const [selectedRegister, setSelectedRegister] = useState("");
  const visibleMovements = rangedMovements.filter((movement) => !selectedRegister || (selectedRegister === "unassigned" ? !movement.cashRegisterId || !registers.some((register) => register.id === movement.cashRegisterId) : movement.cashRegisterId === selectedRegister));
  const visibleIds = new Set(visibleMovements.map((movement) => movement.id));
  const visibleRecords = records.filter((record) => visibleIds.has(record.id));
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <AppSurface title="تسجيل دخول أو خروج مال">
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
          <AppFieldShell label="سبب الحركة">
            <AppInput placeholder="مثال: شراء خضار، سحب شخصي، إضافة فكة" value={movementForm.note} onChange={(event) => setMovementForm({ ...movementForm, note: event.target.value })} />
          </AppFieldShell>
          <AppButton type="submit" loading={movementBusy} disabled={!movementForm.cashRegisterId || movementBusy}>تسجيل</AppButton>
        </form>
      </AppSurface>

      <AppSurface title="الصناديق" action={<AppButton type="button" onClick={onAddRegister}>فتح صندوق</AppButton>}>
        {pendingCashEffect ? (
          <p className="mb-3 rounded-app-md border border-app-warning-soft bg-app-warning-soft px-3 py-2 text-app-helper font-semibold text-app-warning">
            تظهر الأرصدة أدناه كرصد محلي تقديري لأنها تشمل حركات بانتظار المزامنة.
          </p>
        ) : null}
        {registers.length ? (
          <div className="grid gap-2">
            {registers.map((register) => (
              <div key={register.id} className="rounded-app-md border border-app-border bg-app-surface-muted p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-app-ink">{register.name}</p>
                  <AppBadge variant={register.isOpen ? "success" : "neutral"}>{register.isOpen ? "مفتوح" : "مغلق"}</AppBadge>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <FinancialFact label="رصيد الصندوق الحالي · كل الفترات" value={money(register.currentBalance, currency)} />
                  <FinancialFact label="الرصيد عند فتح الصندوق" value={money(register.openingBalance, currency)} />
                  <FinancialFact label="دخل خلال الفترة المحددة" value={money(sumAmounts(rangedMovements.filter((movement) => movement.cashRegisterId === register.id && movement.type === "IN")), currency)} tone="success" />
                  <FinancialFact label="خرج خلال الفترة المحددة" value={money(sumAmounts(rangedMovements.filter((movement) => movement.cashRegisterId === register.id && movement.type === "OUT")), currency)} tone="danger" />
                </div>
                <p className="mt-2 text-app-helper text-app-muted">فُتح في {financialDateTime(register.openedAt)}{register.closedAt ? ` · أُغلق في ${financialDateTime(register.closedAt)}` : ""}</p>
                <AppButton type="button" variant="secondary" onClick={() => setSelectedRegister(register.id)}>عرض حركات هذا الصندوق</AppButton>
              </div>
            ))}
          </div>
        ) : <AppEmptyState title="لا توجد صناديق" description="افتح صندوقًا قبل تسجيل حركة نقدية." action={<AppButton type="button" onClick={onAddRegister}>فتح صندوق</AppButton>} />}
      </AppSurface>

      <AppSurface title="تفاصيل حركة الصندوق" className="xl:col-span-2">
        <AppFieldShell label="عرض حركات">
          <AppSelect value={selectedRegister} onChange={(event) => setSelectedRegister(event.target.value)}>
            <option value="">كل الصناديق</option>
            {registers.map((register) => <option key={register.id} value={register.id}>{register.name}</option>)}
            <option value="unassigned">حركات غير مرتبطة بصندوق معروف</option>
          </AppSelect>
        </AppFieldShell>
        <p className="my-3 text-app-helper text-app-muted">{formatInteger(visibleRecords.length)} حركة خلال الفترة المحددة. الحركات غير المرتبطة بصندوق تظهر في السجل وقد لا تدخل في رصيد أي صندوق.</p>
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          <FinancialFact label="الداخل خلال الفترة" value={money(sumAmounts(visibleMovements.filter((movement) => movement.type === "IN")), currency)} tone="success" />
          <FinancialFact label="الخارج خلال الفترة" value={money(sumAmounts(visibleMovements.filter((movement) => movement.type === "OUT")), currency)} tone="danger" />
          <FinancialFact label="صافي حركة الفترة" value={money(visibleRecords.reduce((sum, record) => sum + record.amountIn - record.amountOut, 0), currency)} />
        </div>
        <RecordsTab records={visibleRecords} currency={currency} />
        {visibleMovements.filter((movement) => movement.syncStatus && movement.syncStatus !== "synced").map((movement) => <div key={movement.id} className="mt-2 flex flex-wrap items-center gap-2 text-app-helper"><span>{financialDateTime(movement.createdAt || "")} · {money(movement.amount, currency)}</span><CashMovementSyncBadge movement={movement} /></div>)}
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

function CashMovementSyncBadge({ movement }: { movement: LocalCashMovement }) {
  if (!movement.syncStatus || movement.syncStatus === "synced") return null;
  if (movement.syncStatus === "pending") return <AppBadge variant="warning">بانتظار المزامنة</AppBadge>;
  if (movement.syncStatus === "syncing") return <AppBadge variant="primary">تتم المزامنة</AppBadge>;
  if (movement.syncStatus === "conflict") return <AppBadge variant="danger">تعارض</AppBadge>;
  return <AppBadge variant="danger">{movement.syncErrorMessage || "فشلت المزامنة"}</AppBadge>;
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
      <div className="grid max-h-80 gap-3 overflow-y-auto pe-2">
        {[...data].sort((first, second) => second.key.localeCompare(first.key)).map((point) => (
          <div key={point.key} className="grid gap-2 rounded-app-md bg-app-surface-muted p-3 sm:grid-cols-[100px_minmax(0,1fr)] sm:items-center">
            <p className="text-app-helper font-medium text-app-muted">{point.label}</p>
            <div className="grid gap-2">
              {[{ label: "دخول", amount: point.cashIn, color: "bg-app-success", text: "text-app-success" }, { label: "خروج", amount: point.cashOut, color: "bg-app-danger", text: "text-app-danger" }].map((bar) => (
                <div key={bar.label} className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-3">
                  <div className="h-2 overflow-hidden rounded-full bg-app-border" aria-hidden="true"><div className={cn("h-full rounded-full", bar.color)} style={{ width: `${bar.amount > 0 ? Math.max(1, (bar.amount / maxAmount) * 100) : 0}%` }} /></div>
                  <span className={cn("text-app-helper font-semibold", bar.text)}><span className="sr-only">{bar.label}: </span>{money(bar.amount, currency)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
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
  { value: "records", label: "الدخول والخروج" },
  { value: "accounts", label: "الحسابات" },
  { value: "journal", label: "القيود" },
  { value: "cash", label: "الصندوق" }
];

function financialDateTime(value: string) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "وقت غير متاح";
  return new Intl.DateTimeFormat("ar-SY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
