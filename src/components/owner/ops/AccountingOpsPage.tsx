"use client";
import { businessDay, businessDayStart, businessMonthRange, businessZone, createBusinessDayResolver, dayInRange } from "@/lib/business-day";
import { hydrateInvoices, listLocalInvoices, refreshInvoices } from "@/offline/repositories/invoices";
import styles from "./CashAccounting.module.css";
import { CashReportPrintButton, type FinancialRecordRow } from "./CashReportPrintButton";
import { CashBalanceBreakdown } from "./CashBalanceBreakdown";
import { formatCashMoney, resolveCashMovements, summarizeCashMovements, summarizeCashRegisters, type ResolvedCashMovement } from "@/lib/cash-balances";
import { MoneyFields } from "./MoneyFields";
import type { MoneyInput } from "@/lib/payments";

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
import type { Account, Invoice, CashMovement, CashRegister, Expense, JournalEntry, OperationalPayment, OpsOrder, OpsTable } from "@/types/ops";
import { money, OpsShell, useOpsPage } from "./OpsShared";
import {
  accountTypes,
  buildCashSeries,
  dateRangeLabel,
  formatFinancialDate,
  journalStatusLabel,
  nameById,
  numberValue,
  option,
  paymentMethodLabel,
  recordTime,
  run
} from "./OpsPageShared";

type AccountingTab = "overview" | "records" | "accounts" | "journal" | "cash";

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

type MovementForm = MoneyInput & {
  method?: "CASH" | "SHAM_CASH";
  cashRegisterId: string;
  type: CashMovement["type"];
  amount: number;
  note: string;
};

export function AccountingOpsPage() {
  const state = useOpsPage("accounting");
  const [tab, setTab] = useState<AccountingTab>("overview");
  const [dateRange, setDateRange] = useState(() => businessMonthRange());
  const [rangePreset, setRangePreset] = useState<"month" | "today" | "custom">("month");
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(timer); }, []);
  const settings = useMemo(() => ({ timezone: state.restaurant?.timezone, businessDayStartTime: state.restaurant?.businessDayStartTime }), [state.restaurant?.timezone, state.restaurant?.businessDayStartTime]);
  const today = businessDay(clock, settings);
  useEffect(() => {
    if (rangePreset !== "custom") setDateRange({ from: rangePreset === "today" ? today : `${today.slice(0, 7)}-01`, to: today });
  }, [today, rangePreset]);
  const [accountForm, setAccountForm] = useState<AccountForm>({ code: "", name: "", type: "ASSET", isActive: true });
  const [entryForm, setEntryForm] = useState<EntryForm>({ debitAccountId: "", creditAccountId: "", amount: 0, memo: "" });
  const [cashForm, setCashForm] = useState<CashForm>({ name: "", openingBalance: 0 });
  const [movementForm, setMovementForm] = useState<MovementForm>({ currency: "SYP", exchangeRate: 1, method: "CASH", cashRegisterId: "", type: "IN", amount: 0, note: "" });
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
  const { value: invoices } = useLiveQuery(() => tenantId ? listLocalInvoices(tenantId) : Promise.resolve([]), [] as Invoice[], [tenantId]);
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
    void hydrateInvoices(offlineContext);
    void hydrateTables(offlineContext);
  }

  async function refreshHistory() {
    if (!offlineContext) return;
    await Promise.all([refreshFinancialHistory(offlineContext), refreshOrders(offlineContext), refreshTables(offlineContext), refreshInvoices(offlineContext)]);
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
  const resolvedMovements = useMemo(() => resolveCashMovements(movements, payments, currency ?? "SYP"), [movements, payments, currency]);
  const currentBalances = useMemo(() => summarizeCashRegisters(registers, resolvedMovements, currency ?? "SYP"), [registers, resolvedMovements, currency]);
  const hasUnconfirmedMovements = movements.some(movement => movement.syncStatus && movement.syncStatus !== "synced");
  const unassignedCount = resolvedMovements.filter(movement => !registers.some(register => register.id === movement.cashRegisterId)).length;
  const dayResolver = useMemo(() => createBusinessDayResolver(orders, payments, invoices, settings), [orders, payments, invoices, settings]);
  const rangedMovements = useMemo(() => resolvedMovements.filter((movement) => dayInRange(dayResolver.movement(movement).day, dateRange.from, dateRange.to)), [dateRange.from, dateRange.to, resolvedMovements, dayResolver]);
  const rangedEntries = useMemo(() => entries.filter((entry) => dayInRange(dayResolver.entry(entry), dateRange.from, dateRange.to)), [dateRange.from, dateRange.to, entries, dayResolver]);
  const periodBalances = useMemo(() => summarizeCashMovements(rangedMovements), [rangedMovements]);
  const cashSeries = useMemo(() => buildCashSeries(rangedMovements, dateRange, movement => dayResolver.movement(movement).day), [dateRange, rangedMovements, dayResolver]);
  const totalPeriodRecords = rangedMovements.length;
  const financialRecords = useMemo<FinancialRecordRow[]>(() => {
    return rangedMovements.map((movement) => {
      const payment = payments.find((item) => item.id === movement.referenceId);
      const { order, missingOrder, day: accountingDay } = dayResolver.movement(movement);
      const table = tables.find((item) => item.id === order?.tableId);
      const orderLabel = order ? (table ? `طاولة ${table.name}` : order.type === "DELIVERY" ? "طلب توصيل" : order.type === "TAKEAWAY" ? "طلب سفري" : "طلب بدون طاولة") : "";
      const expense = expenses.find((item) => item.id === movement.referenceId);
      const reason = movement.referenceType === "ORDER_CANCEL" ? "إرجاع مبلغ طلب ملغى" :
        payment ? (payment.type === "SALE" ? "دفع طلب" : payment.type === "REFUND" ? "إرجاع مبلغ" : "دفع مشتريات") :
        expense?.category || (movement.type === "IN" ? "إضافة مال إلى الصندوق" : "سحب مال من الصندوق");
      return {
        id: movement.id,
        date: movement.createdAt || "",
        accountingDay,
        type: movement.type === "IN" ? "دخول" : "خروج",
        title: orderLabel ? `${reason} · ${orderLabel}` : reason,
        cashRegisterName: registers.find(register => register.id === movement.cashRegisterId)?.name || "بدون صندوق",
        customerName: order?.customerName?.trim(),
        method: movement.resolvedMethod ? paymentMethodLabel(movement.resolvedMethod) : `غير محدد${movement.cashRegisterId ? ` · ${nameById(registers, movement.cashRegisterId)}` : ""}`,
        currency: movement.nativeAmount !== undefined ? movement.nativeCurrency ?? currency ?? "SYP" : currency ?? "SYP",
        originalAmount: movement.nativeAmount,
        accountingAmount: movement.amount,
        amountIn: movement.type === "IN" ? numberValue(movement.amount) : 0,
        amountOut: movement.type === "OUT" ? numberValue(movement.amount) : 0,
        note: [movement.nativeCurrency === "USD" && movement.snapshotExchangeRate ? `سعر الصرف المحفوظ: ${movement.snapshotExchangeRate}` : "", order?.items.map((item) => `${formatInteger(item.quantity)} × ${item.name}`).join("، "), movement.note, missingOrder ? "تعذر تحديد الطلب المرتبط؛ احتُسب اليوم حسب وقت الحركة" : ""].filter(Boolean).join(" · "),
        source: [`اليوم المحاسبي: ${accountingDay}`, order ? `وقت الطلب: ${financialDateTime(order.orderedAt || order.createdAt || "", settings.timezone)}` : ""].filter(Boolean).join(" · ")
      };
    }).sort((first, second) => recordTime(second.date) - recordTime(first.date));
  }, [rangedMovements, payments, expenses, orders, tables, registers, currency, dayResolver]);

  return (
    <OpsShell title="حركة المال والصندوق" eyebrow={`يبدأ اليوم المحاسبي الساعة ${businessDayStart(settings)} · إيرادات الطاولات بحسب يوم فتح الطلب`} module="accounting" state={state} onRefresh={() => void Promise.all([state.loadRestaurant(), refreshHistory()])}>
      <div className={cn(styles.page, "grid gap-4")}>
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
                <AppInput aria-label="بداية الفترة" className="min-w-0 sm:w-40" type="date" max={dateRange.to} value={dateRange.from} onChange={(event) => { const from = event.target.value; setRangePreset("custom"); if (from) setDateRange((current) => ({ from, to: from > current.to ? from : current.to })); }} />
              </label>
              <label className="flex min-w-0 items-center gap-2 text-app-helper text-app-muted">
                <span>إلى</span>
                <AppInput aria-label="نهاية الفترة" className="min-w-0 sm:w-40" type="date" min={dateRange.from} value={dateRange.to} onChange={(event) => { const to = event.target.value; setRangePreset("custom"); if (to) setDateRange((current) => ({ from: to < current.from ? to : current.from, to })); }} />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AppButton type="button" variant="secondary" onClick={() => { setRangePreset("today"); setDateRange({ from: today, to: today }); }}>اليوم</AppButton>
              <AppButton type="button" variant="secondary" onClick={() => { setRangePreset("month"); setDateRange(businessMonthRange(settings)); }}>الشهر الحالي</AppButton>
              <CashReportPrintButton businessDayStartTime={businessDayStart(settings)} timezone={settings.timezone} restaurantName={state.restaurant?.name || ""} from={dateRange.from} to={dateRange.to} records={financialRecords} summary={periodBalances} currency={currency ?? "SYP"} unconfirmedCount={movements.filter(movement => movement.syncStatus && movement.syncStatus !== "synced" && dayInRange(dayResolver.movement(movement).day, dateRange.from, dateRange.to)).length} />
            </div>
          </div>
        </header>

        <CashBalanceBreakdown title="أرصدة الصناديق الحالية" description="جميع الصناديق · كل الفترات · لا تتأثر بالتاريخ المختار" summary={currentBalances} accountingCurrency={currency ?? "SYP"} />
        {unassignedCount > 0 && <p className="text-app-helper text-app-muted">{formatInteger(unassignedCount)} حركة غير مرتبطة بصندوق معروف؛ تظهر في سجل الحركات وحركة الفترة ولا تدخل في أرصدة الصناديق أعلاه.</p>}
        {hasUnconfirmedMovements && <p role="status" className="rounded-app-md border border-app-warning-soft bg-app-warning-soft p-3 text-app-helper font-semibold text-app-warning">الأرصدة المحلية تشمل حركات غير متزامنة. تصبح مؤكدة بعد اكتمال المزامنة.</p>}

        <nav className="flex gap-2 overflow-x-auto rounded-app-lg border border-app-border bg-app-surface p-2" aria-label="أقسام المحاسبة">
          {accountingTabs.filter((item) => !["accounts", "journal"].includes(item.value)).map((item) => (
            <button
              key={item.value}
              type="button"
              aria-current={tab === item.value ? "page" : undefined}
              onClick={() => setTab(item.value)}
              className={cn(
                "h-9 shrink-0 rounded-md border px-3 text-app-label font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2",
                tab === item.value
                  ? "border-zinc-800 bg-zinc-800 text-white"
                  : "border-transparent bg-transparent text-app-muted hover:bg-app-surface-muted hover:text-app-ink"
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {(tab === "overview" || tab === "records") && <CashBalanceBreakdown title="حركة الفترة المختارة" description={dateRangeLabel(dateRange)} summary={periodBalances} kind="period" accountingCurrency={currency ?? "SYP"} />}

        {tab === "overview" ? (
          <OverviewTab
            cashSeries={cashSeries}
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
            movements={resolvedMovements}
            rangedMovements={rangedMovements}
            records={financialRecords}
            exchangeRate={state.restaurant?.usdExchangeRate}
            movementForm={movementForm}
            setMovementForm={setMovementForm}
            currency={currency}
            pendingCashEffect={pendingCashEffect}
            movementBusy={movementBusy}
            onSubmit={addMovement}
            onAddRegister={() => setCashRegisterFormOpen(true)}
          />
        ) : null}

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
      </div>
    </OpsShell>
  );
}

function OverviewTab({ cashSeries, records, currency }: {
  cashSeries: ReturnType<typeof buildCashSeries>;
  records: FinancialRecordRow[];
  currency?: string;
}) {
  return (
    <div className="grid gap-4">
      <AppSurface title="الدخول والخروج — بالقيمة المحاسبية"><p className="mb-3 text-app-helper text-app-muted">المبالغ {currency === "SYP" ? "بالليرة السورية" : currency} وفق أسعار الصرف المحفوظة لكل عملية.</p><CashMovementBars data={cashSeries} currency={currency} /></AppSurface>
      <RecordsTab records={records} currency={currency} title="آخر ٥ حركات خلال الفترة" />
    </div>
  );
}

function CashRecordAmount({ record, accountingCurrency = "SYP" }: { record: FinancialRecordRow; accountingCurrency?: string }) {
  return <div className="min-w-0">
    <p className="break-words font-bold tabular-nums">{formatCashMoney(record.originalAmount ?? record.accountingAmount, record.currency)}</p>
    {record.currency !== accountingCurrency && record.originalAmount !== undefined && <p className="mt-1 text-xs font-normal text-app-muted">المقابل المحاسبي: {formatCashMoney(record.accountingAmount, accountingCurrency)}</p>}
    {record.originalAmount === undefined && <p className="mt-1 text-xs font-normal text-app-muted">قيمة محاسبية؛ المبلغ الأصلي غير متوفر</p>}
  </div>;
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
                <td className="whitespace-nowrap border-b border-app-border px-3 py-3 font-semibold text-zinc-800">{record.amountIn ? <CashRecordAmount record={record} accountingCurrency={currency} /> : "-"}</td>
                <td className="whitespace-nowrap border-b border-app-border px-3 py-3 font-semibold text-zinc-800">{record.amountOut ? <CashRecordAmount record={record} accountingCurrency={currency} /> : "-"}</td>
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
              <div className="min-w-0 rounded-app-md bg-app-surface-muted p-3 text-zinc-800"><p className="mb-1 text-app-helper text-app-muted">داخل</p>{record.amountIn ? <CashRecordAmount record={record} accountingCurrency={currency} /> : "-"}</div>
              <div className="min-w-0 rounded-app-md bg-app-surface-muted p-3 text-zinc-800"><p className="mb-1 text-app-helper text-app-muted">خارج</p>{record.amountOut ? <CashRecordAmount record={record} accountingCurrency={currency} /> : "-"}</div>
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
  movements,
  rangedMovements,
  exchangeRate,
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
  movements: Array<LocalCashMovement & ResolvedCashMovement>;
  rangedMovements: Array<LocalCashMovement & ResolvedCashMovement>;
  exchangeRate?: number;
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
          <AppFieldShell label="وسيلة الدفع"><AppSelect value={movementForm.method ?? "CASH"} onChange={e => setMovementForm({ ...movementForm, method: e.target.value as "CASH" | "SHAM_CASH" })}><option value="CASH">نقداً</option><option value="SHAM_CASH">شام كاش</option></AppSelect></AppFieldShell>
          <MoneyFields value={movementForm} onChange={value => setMovementForm({ ...movementForm, ...value })} exchangeRate={exchangeRate} />
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
                <div className="mt-3">
                  <CashBalanceBreakdown title="الرصيد الحالي · كل الفترات" summary={summarizeCashRegisters([register], movements, currency ?? "SYP")} accountingCurrency={currency ?? "SYP"} compact />
                  <p className="mt-2 text-app-helper text-app-muted">الرصيد الافتتاحي: {formatCashMoney(register.openingBalance, currency ?? "SYP")} · مُحتسب مرة واحدة ضمن الرصيد.</p>
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
        <div className="mb-4"><CashBalanceBreakdown title="حركة الفترة حسب الصندوق المحدد" summary={summarizeCashMovements(visibleMovements)} kind="period" accountingCurrency={currency ?? "SYP"} /></div>
        <RecordsTab records={visibleRecords} currency={currency} />
        {visibleMovements.filter((movement) => movement.syncStatus && movement.syncStatus !== "synced").map((movement) => <div key={movement.id} className="mt-2 flex flex-wrap items-center gap-2 text-app-helper"><span>{financialDateTime(movement.createdAt || "")} · {formatCashMoney(movement.nativeAmount ?? movement.amount, movement.nativeAmount !== undefined ? movement.nativeCurrency ?? currency ?? "SYP" : currency ?? "SYP")}</span><CashMovementSyncBadge movement={movement} /></div>)}
      </AppSurface>
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
        <span className="inline-flex items-center gap-1 text-zinc-800"><span className="h-2 w-2 rounded-sm bg-zinc-800" /> دخول</span>
        <span className="inline-flex items-center gap-1 text-zinc-600"><span className="h-2 w-2 rounded-sm bg-zinc-400" /> خروج</span>
      </div>
      <div className="grid max-h-80 gap-3 overflow-y-auto pe-2">
        {[...data].sort((first, second) => second.key.localeCompare(first.key)).map((point) => (
          <div key={point.key} className="grid gap-2 rounded-app-md bg-app-surface-muted p-3 sm:grid-cols-[100px_minmax(0,1fr)] sm:items-center">
            <p className="text-app-helper font-medium text-app-muted">{point.label}</p>
            <div className="grid gap-2">
              {[{ label: "دخول", amount: point.cashIn, color: "bg-zinc-800", text: "text-zinc-800" }, { label: "خروج", amount: point.cashOut, color: "bg-zinc-400", text: "text-zinc-600" }].map((bar) => (
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
  const variant = status === "POSTED" ? "success" : status === "REVERSED" ? "neutral" : "warning";
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

function financialDateTime(value: string, zone?: string) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "وقت غير متاح";
  return new Intl.DateTimeFormat("ar-SY", { dateStyle: "medium", timeStyle: "short", timeZone: businessZone(zone) }).format(new Date(value));
}
