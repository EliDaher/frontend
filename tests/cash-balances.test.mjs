import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cashSections, formatCashMoney, resolveCashMovements, summarizeCashMovements, summarizeCashRegisters, summarizeSalesPayments } from "../src/lib/cash-balances.ts";

const movement = (id, method, currency, originalAmount, amount, rest = {}) => ({ id, method, currency, originalAmount, amount, cashRegisterId: "r", type: "IN", referenceType: "MANUAL", referenceId: "manual", note: "", createdAt: "2026-11-03T09:00:00Z", ...rest });
const register = (currentBalance, openingBalance = 0, id = "r") => ({ id, currentBalance, openingBalance, name: id, isOpen: true, openedAt: "", closedAt: "" });
const resolve = (rows, payments = []) => resolveCashMovements(rows, payments, "SYP");
const totals = rows => summarizeCashMovements(resolve(rows));

describe("native cash and Sham Cash balances", () => {
  it("shows 2 dollars as 2 dollars and keeps the stored 286 SYP accounting equivalent", () => {
    const rows = resolve([movement("m", "CASH", "USD", 2, 286, { exchangeRate: 143 })]);
    const summary = summarizeCashRegisters([register(286)], rows);
    assert.equal(summary.sections.CASH_USD.net, 2);
    assert.equal(summary.sections.CASH_SYP.net, 0);
    assert.equal(summary.accountingNet, 286);
    assert.equal(summary.unclassifiedNet, 0);
    assert.equal(formatCashMoney(rows[0].nativeAmount, rows[0].nativeCurrency), "2 دولار");
  });
  it("splits four native buckets across registers and counts opening balances once", () => {
    const rows = resolve([
      movement("a", "CASH", "USD", 2, 286), movement("b", "CASH", "SYP", 100, 100),
      movement("c", "SHAM_CASH", "USD", 3, 450, { cashRegisterId: "second" }), movement("d", "SHAM_CASH", "SYP", 200, 200, { cashRegisterId: "second" })
    ]);
    const summary = summarizeCashRegisters([register(886, 500), register(700, 50, "second"), register(886, 500)], rows);
    assert.deepEqual(cashSections.map(section => summary.sections[section.key].net), [2, 650, 3, 200]);
    assert.equal(summary.accountingNet, 1586); assert.equal(summary.unclassifiedNet, 0);
  });
  it("subtracts withdrawals, expenses and refunds from their own native bucket", () => {
    const summary = totals([
      movement("a", "CASH", "USD", 10, 1430), movement("b", "CASH", "USD", 2, 286, { type: "OUT", referenceType: "ORDER_CANCEL" }),
      movement("c", "SHAM_CASH", "USD", 5, 1000), movement("d", "SHAM_CASH", "USD", 1.25, 250, { type: "OUT", referenceType: "EXPENSE" }),
      movement("e", "CASH", "SYP", 100, 100), movement("f", "CASH", "SYP", 40, 40, { type: "OUT" }),
      movement("g", "SHAM_CASH", "SYP", 50, 50), movement("h", "SHAM_CASH", "SYP", 10, 10, { type: "OUT" })
    ]);
    assert.deepEqual(cashSections.map(section => summary.sections[section.key].net), [8, 60, 3.75, 40]);
    assert.equal(summary.sections.CASH_USD.outgoing, 2); assert.equal(summary.sections.SHAM_CASH_USD.outgoing, 1.25);
    assert.equal(summary.accountingNet, 1994);
  });
  it("never revalues historical totals using a new or average exchange rate", () => {
    const summary = totals([movement("a", "CASH", "USD", 2, 286, { exchangeRate: 143 }), movement("b", "CASH", "USD", 2, 400, { exchangeRate: 200 })]);
    assert.equal(summary.sections.CASH_USD.net, 4); assert.equal(summary.accountingNet, 686);
    assert.notEqual(summary.accountingNet, summary.sections.CASH_USD.net * 200);
  });
  it("enriches missing movement metadata from a linked payment without mutating either source", () => {
    const source = { id: "m", cashRegisterId: "r", type: "IN", amount: 286, referenceType: "PAYMENT", referenceId: "p", note: "" };
    const payment = { id: "p", method: "SHAM_CASH", currency: "USD", originalAmount: 2, amount: 286, exchangeRate: 143, type: "SALE" };
    const before = structuredClone([source, payment]);
    const [row] = resolve([source], [payment]);
    assert.equal(row.section, "SHAM_CASH_USD"); assert.equal(row.nativeAmount, 2); assert.equal(row.snapshotExchangeRate, 143);
    assert.deepEqual([source, payment], before);
    assert.equal(summarizeCashMovements([row]).accountingNet, 286);
  });
  it("supports legacy order movement references and their reversal metadata", () => {
    const payment = { id: "order_o", method: "CASH", currency: "USD", originalAmount: 2, amount: 286, type: "SALE" };
    const rows = resolve([
      { id: "order_o", amount: 286, cashRegisterId: "r", type: "IN", referenceType: "ORDER", referenceId: "o", note: "" },
      { id: "cancel_order_o", amount: 286, cashRegisterId: "r", type: "OUT", referenceType: "ORDER_CANCEL", referenceId: "o", note: "" }
    ], [payment]);
    assert.equal(summarizeCashMovements(rows).sections.CASH_USD.net, 0);


    assert.equal(rows[1].nativeAmount, 2);
  });
  it("keeps legacy wallets and unknown methods unclassified rather than mapping them to Sham Cash", () => {
    const summary = totals([movement("w", "WALLET", "SYP", 120, 120), movement("unknown", undefined, "SYP", 80, 80)]);
    assert.equal(summary.unclassifiedCount, 2); assert.equal(summary.unclassifiedNet, 200);
    assert.equal(summary.sections.SHAM_CASH_SYP.net, 0); assert.equal(summary.accountingNet, 200);
  });
  it("does not guess native dollars when original amounts are unavailable or conflicting", () => {
    const source = movement("u", "CASH", "USD", undefined, 286, { referenceType: "PAYMENT", referenceId: "p" });
    const rows = resolve([source], [{ id: "p", method: "CASH", currency: "SYP", originalAmount: 286 }]);
    assert.equal(rows[0].nativeAmount, undefined);
    assert.equal(summarizeCashMovements(rows).unclassifiedNet, 286);
    assert.equal(summarizeCashMovements(rows).sections.CASH_USD.net, 0);
    const unknownCurrency = resolve([movement("eur", "CASH", "EUR", 2, 286)])[0];
    assert.equal(unknownCurrency.nativeAmount, undefined); assert.equal(unknownCurrency.section, undefined);
    const partial = resolve([{ ...source, amount: 143 }], [{ id: "p", method: "CASH", currency: "USD", originalAmount: 2, amount: 286 }])[0];
    assert.equal(partial.nativeAmount, undefined);
  });
  it("keeps known legacy cash amounts in the base currency without inventing conversions", () => {
    const rows = resolve([{ id: "legacy", method: "CASH", amount: 100, type: "IN", cashRegisterId: "r", referenceType: "MANUAL", referenceId: "manual", note: "" }]);
    assert.equal(rows[0].section, "CASH_SYP"); assert.equal(rows[0].nativeAmount, 100);
  });
  it("does not attach unrelated payments to manual movements", () => {
    const source = { id: "manual", amount: 100, type: "IN", cashRegisterId: "r", referenceType: "MANUAL", referenceId: "p", note: "" };
    assert.equal(resolve([source], [{ id: "p", method: "SHAM_CASH", currency: "USD", originalAmount: 1 }])[0].section, undefined);
  });
  it("includes unassigned movements in period activity but excludes them from current register balances", () => {
    const rows = resolve([movement("a", "CASH", "USD", 2, 286), movement("b", "CASH", "SYP", 100, 100, { cashRegisterId: "" }), movement("c", "CASH", "SYP", 20, 20, { cashRegisterId: "missing" })]);
    assert.equal(summarizeCashMovements(rows).accountingNet, 406);
    const current = summarizeCashRegisters([register(286)], rows);
    assert.equal(current.accountingNet, 286); assert.equal(current.sections.CASH_SYP.net, 0);
  });
  it("reports incomplete historical balances separately while reconciling to the recorded total", () => {
    const summary = summarizeCashRegisters([register(32000, 31000)], resolve([movement("a", "CASH", "USD", 2, 286), movement("b", "CASH", "SYP", 100, 100), movement("c", "SHAM_CASH", "SYP", 134, 134)]));
    assert.equal(summary.sections.CASH_USD.net, 2); assert.equal(summary.sections.CASH_SYP.net, 31100);
    assert.equal(summary.unclassifiedNet, 480); assert.equal(summary.accountingNet, 32000);
    assert.equal(cashSections.reduce((sum, section) => sum + summary.sections[section.key].accountingNet, 0) + summary.unclassifiedNet, summary.accountingNet);
  });
  it("does not change current balances when the displayed date range changes", () => {
    const rows = resolve([movement("old", "CASH", "USD", 2, 286, { createdAt: "2026-10-01" }), movement("new", "CASH", "SYP", 100, 100)]);
    const current = summarizeCashRegisters([register(386)], rows);
    const period = summarizeCashMovements(rows.filter(row => row.createdAt >= "2026-11-01"));
    assert.equal(period.accountingNet, 100); assert.equal(current.accountingNet, 386); assert.equal(current.sections.CASH_USD.net, 2);
  });
  it("deduplicates retried records and avoids floating point tails in native dollar amounts", () => {
    const first = movement("a", "CASH", "USD", .1, 14);
    const summary = totals([first, first, movement("b", "CASH", "USD", .2, 29)]);
    assert.equal(summary.sections.CASH_USD.net, .3); assert.equal(summary.sections.CASH_USD.count, 2); assert.equal(summary.accountingNet, 43);
  });
  it("shows sales receipts and returns in four buckets, excluding supplier payments", () => {
    const summary = summarizeSalesPayments([
      { id: "a", method: "CASH", currency: "USD", originalAmount: 2, amount: 286, type: "SALE" },
      { id: "b", method: "CASH", currency: "USD", originalAmount: .5, amount: 71, type: "REFUND" },
      { id: "c", method: "SHAM_CASH", currency: "SYP", originalAmount: 100, amount: 100, type: "SALE" },
      { id: "d", method: "SHAM_CASH", currency: "USD", originalAmount: 5, amount: 1000, type: "PURCHASE" }
    ]);
    assert.equal(summary.sections.CASH_USD.net, 1.5); assert.equal(summary.sections.SHAM_CASH_SYP.net, 100);
    assert.equal(summary.sections.SHAM_CASH_USD.net, 0); assert.equal(summary.accountingNet, 315);
  });
  it("formats currencies clearly and leaves source data and legacy account units unchanged", () => {
    assert.equal(formatCashMoney(2.25, "USD"), "2.25 دولار"); assert.equal(formatCashMoney(1000.4, "SYP"), "1,000 ل.س");
    const summary = summarizeCashRegisters([register(12, 12)], [], "USD");
    assert.equal(summary.sections.CASH_SYP.net, 0); assert.equal(summary.unclassifiedNet, 12); assert.equal(summary.accountingNet, 12);
  });
});
