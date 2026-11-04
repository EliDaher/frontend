import type { CashMovement, CashRegister, OperationalPayment, PaymentMethod } from "@/types/ops";
import type { PaymentCurrency } from "./payments";

export const cashSections = [
  { key: "CASH_USD", method: "CASH", currency: "USD", label: "نقدي — دولار" },
  { key: "CASH_SYP", method: "CASH", currency: "SYP", label: "نقدي — ليرة سورية" },
  { key: "SHAM_CASH_USD", method: "SHAM_CASH", currency: "USD", label: "شام كاش — دولار" },
  { key: "SHAM_CASH_SYP", method: "SHAM_CASH", currency: "SYP", label: "شام كاش — ليرة سورية" }
] as const;
export type CashSectionKey = typeof cashSections[number]["key"];
export type ResolvedCashMovement = CashMovement & {
  resolvedMethod?: PaymentMethod;
  nativeCurrency?: PaymentCurrency;
  nativeAmount?: number;
  section?: CashSectionKey;
  snapshotExchangeRate?: number;
};
export type CashSectionTotal = { incoming: number; outgoing: number; net: number; accountingNet: number; count: number };
export type CashSummary = {
  sections: Record<CashSectionKey, CashSectionTotal>;
  accountingIn: number;
  accountingOut: number;
  accountingNet: number;
  unclassifiedNet: number;
  unclassifiedCount: number;
  reconciliation: number;
};
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const amount = (value: unknown) => finite(value) ? value : 0;
const add = (first: number, second: number) => Math.round((first + second) * 100) / 100;
const supportedCurrency = (value: unknown): value is PaymentCurrency => value === "SYP" || value === "USD";

/** Enrich display data only. Never derive dollar units from a converted balance. */
export function resolveCashMovement<T extends CashMovement>(movement: T, payments: ReadonlyMap<string, OperationalPayment>, baseCurrency = "SYP"): T & ResolvedCashMovement {
  const linked = movement.referenceType === "PAYMENT" || movement.referenceType === "ORDER" || movement.referenceType === "ORDER_CANCEL";
  const payment = !linked ? undefined : movement.referenceType === "PAYMENT"
    ? payments.get(movement.referenceId) ?? payments.get(movement.id)
    : payments.get(movement.id) ?? (movement.referenceType === "ORDER_CANCEL" ? payments.get(`order_${movement.referenceId}`) : undefined);
  const resolvedMethod = movement.method ?? payment?.method;
  const storedCurrency = movement.currency ?? payment?.currency;
  // Legacy amounts without currency metadata are in the account's base currency.
  const nativeCurrency = storedCurrency === undefined
    ? (supportedCurrency(baseCurrency) ? baseCurrency : undefined)
    : (supportedCurrency(storedCurrency) ? storedCurrency : undefined);
  let nativeAmount: number | undefined;
  if (nativeCurrency !== undefined && finite(movement.originalAmount)) nativeAmount = movement.originalAmount;
  else if (nativeCurrency !== undefined && payment && payment.currency === nativeCurrency && finite(payment.originalAmount) && payment.amount === movement.amount) nativeAmount = payment.originalAmount;
  else if (nativeCurrency === baseCurrency) nativeAmount = amount(movement.amount);
  const section = nativeAmount !== undefined ? cashSections.find(item => item.method === resolvedMethod && item.currency === nativeCurrency)?.key : undefined;
  return { ...movement, resolvedMethod, nativeCurrency, nativeAmount, section, snapshotExchangeRate: movement.exchangeRate ?? payment?.exchangeRate };
}

export function resolveCashMovements<T extends CashMovement>(movements: T[], payments: OperationalPayment[], baseCurrency = "SYP") {
  const paymentById = new Map(payments.map(payment => [payment.id, payment]));
  return [...new Map(movements.map(movement => [movement.id, movement])).values()]
    .map(movement => resolveCashMovement(movement, paymentById, baseCurrency));
}

export function summarizeCashMovements(movements: ResolvedCashMovement[]): CashSummary {
  const sections = Object.fromEntries(cashSections.map(section => [section.key, { incoming: 0, outgoing: 0, net: 0, accountingNet: 0, count: 0 }])) as CashSummary["sections"];
  const summary: CashSummary = { sections, accountingIn: 0, accountingOut: 0, accountingNet: 0, unclassifiedNet: 0, unclassifiedCount: 0, reconciliation: 0 };
  for (const movement of new Map(movements.map(row => [row.id, row])).values()) {
    const sign = movement.type === "IN" ? 1 : -1;
    const baseAmount = amount(movement.amount);
    if (movement.type === "IN") summary.accountingIn = add(summary.accountingIn, baseAmount);
    else summary.accountingOut = add(summary.accountingOut, baseAmount);
    summary.accountingNet = add(summary.accountingNet, sign * baseAmount);
    if (!movement.section || movement.nativeAmount === undefined) {
      summary.unclassifiedNet = add(summary.unclassifiedNet, sign * baseAmount);
      summary.unclassifiedCount++;
      continue;
    }
    const section = sections[movement.section];
    if (movement.type === "IN") section.incoming = add(section.incoming, movement.nativeAmount);
    else section.outgoing = add(section.outgoing, movement.nativeAmount);
    section.net = add(section.net, sign * movement.nativeAmount);
    section.accountingNet = add(section.accountingNet, sign * baseAmount);
    section.count++;
  }
  return summary;
}

/** Current balances are independent of the date filter and exclude unassigned movements. */
export function summarizeCashRegisters(registers: CashRegister[], movements: ResolvedCashMovement[], baseCurrency = "SYP"): CashSummary {
  const uniqueRegisters = [...new Map(registers.map(register => [register.id, register])).values()];
  const ids = new Set(uniqueRegisters.map(register => register.id));
  const summary = summarizeCashMovements(movements.filter(movement => ids.has(movement.cashRegisterId)));
  for (const register of uniqueRegisters) {
    const opening = amount(register.openingBalance);
    const section = baseCurrency === "SYP" ? summary.sections.CASH_SYP : undefined;
    if (section) {
      section.net = add(section.net, opening);
      section.incoming = add(section.incoming, opening);
      section.accountingNet = add(section.accountingNet, opening);
    } else if (opening !== 0) {
      summary.unclassifiedNet = add(summary.unclassifiedNet, opening);
      summary.unclassifiedCount++;
    }
    summary.accountingNet = add(summary.accountingNet, opening);
  }
  const recordedBalance = uniqueRegisters.reduce((total, register) => add(total, amount(register.currentBalance)), 0);
  // Missing legacy history must remain visible without inventing a native currency or method.
  summary.reconciliation = add(recordedBalance, -summary.accountingNet);
  summary.unclassifiedNet = add(summary.unclassifiedNet, summary.reconciliation);
  summary.accountingNet = recordedBalance;
  return summary;
}

export function summarizeSalesPayments(payments: OperationalPayment[], baseCurrency = "SYP") {
  const movements: CashMovement[] = payments.filter(payment => payment.type === "SALE" || payment.type === "REFUND").map(payment => ({
    id: payment.id, cashRegisterId: "", type: payment.type === "REFUND" ? "OUT" : "IN", amount: payment.amount,
    method: payment.method, currency: payment.currency, originalAmount: payment.originalAmount, exchangeRate: payment.exchangeRate,
    referenceType: "PAYMENT", referenceId: payment.id, note: payment.note
  }));
  return summarizeCashMovements(resolveCashMovements(movements, payments, baseCurrency));
}

export function formatCashMoney(value: number, currency: string) {
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: currency === "SYP" ? 0 : 2 }).format(value);
  return `${formatted} ${currency === "SYP" ? "ل.س" : currency === "USD" ? "دولار" : currency}`;
}
