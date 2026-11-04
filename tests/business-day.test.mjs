import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { businessDay, businessDayStart, businessMonthRange, createBusinessDayResolver, dayInRange, validBusinessDayStart } from "../src/lib/business-day.ts";
import { ordersForHistoryDay } from "../src/lib/table-history.ts";
import { resolveCashMovements, summarizeCashMovements, summarizeCashRegisters } from "../src/lib/cash-balances.ts";

const settings = { timezone: "Asia/Damascus", businessDayStartTime: "04:00" };
const order = { id: "o_1", tableId: "t", orderedAt: "2026-11-12T00:00:00Z", invoiceId: "i", paymentId: "order_o_1" };
const payments = [
  { id: "order_o_1", type: "SALE", orderId: "o_1", invoiceId: "i" },
  { id: "order_o_1_1", type: "SALE", orderId: "o_1", invoiceId: "i" },
  { id: "later", type: "SALE", orderId: "", invoiceId: "i" },
];
const movement = (id, rest = {}) => ({ id, referenceType: "PAYMENT", referenceId: id, type: "IN", createdAt: "2026-11-12T02:00:00Z", cashRegisterId: "r", method: "CASH", currency: "SYP", originalAmount: 100, amount: 100, ...rest });
const invoices = [{ id: "i", type: "SALE", orderId: order.id }];
const resolver = createBusinessDayResolver([order], payments, invoices, settings);

describe("business day boundaries", () => {
  it("uses restaurant time, exact boundaries, defaults and custom minutes", () => {
    for (const value of ["2026-11-11T21:00:00Z", "2026-11-12T00:59:59Z"]) assert.equal(businessDay(value, settings), "2026-11-11");
    assert.equal(businessDay("2026-11-12T01:00:00Z", settings), "2026-11-12");
    assert.equal(businessDay("2026-11-12T02:29:59Z", { ...settings, businessDayStartTime: "05:30" }), "2026-11-11");
    assert.equal(businessDay("2026-11-12T02:30:00Z", { ...settings, businessDayStartTime: "05:30" }), "2026-11-12");
    assert.equal(businessDay("2026-11-11T21:00:00Z", { businessDayStartTime: "00:00" }), "2026-11-12");
    assert.equal(businessDay("2026-11-12T00:00:00Z", { timezone: "invalid", businessDayStartTime: "25:00" }), "2026-11-11");
    assert.equal(businessDayStart(), "04:00");
    for (const value of ["24:00", "4:00", "04:60", "", "04:00:00"]) assert.equal(validBusinessDayStart(value), false);
    for (const value of ["00:00", "04:00", "05:30", "23:59"]) assert.equal(validBusinessDayStart(value), true);
    assert.equal(businessDay("invalid", settings), "");
    assert.equal(businessDay(undefined, settings), "");
    assert.equal(businessDay("2026-11-12", settings), "2026-11-12");
  });
  it("handles month/year boundaries and current month by the business day", () => {
    assert.equal(businessDay("2026-01-01T00:00:00Z", settings), "2025-12-31");
    assert.equal(businessDay("2024-03-01T00:00:00Z", settings), "2024-02-29");
    assert.deepEqual(businessMonthRange(settings, new Date("2026-11-01T00:00:00Z")), { from: "2026-10-01", to: "2026-10-31" });
  });
  it("groups table history by opening time and changes historical grouping with settings", () => {
    assert.equal(ordersForHistoryDay([order], "2026-11-11", settings.timezone, settings).length, 1);
    assert.equal(ordersForHistoryDay([order], "2026-11-12", settings.timezone, { businessDayStartTime: "00:00" }).length, 1);
    assert.equal(ordersForHistoryDay([{ ...order, orderedAt: undefined, createdAt: order.orderedAt }], "2026-11-11", settings.timezone, settings).length, 1);
  });
});

describe("financial attribution", () => {
  it("attributes split and later invoice payments to the table opening day", () => {
    for (const payment of payments) assert.equal(resolver.movement(movement(payment.id)).day, "2026-11-11");
    assert.equal(resolver.entry({ referenceType: "ORDER", referenceId: order.id, postedAt: "2026-11-12T02:00:00Z" }), "2026-11-11");
    assert.equal(resolver.entry({ referenceType: "INVOICE", referenceId: "i", postedAt: "2026-11-12T02:00:00Z" }), "2026-11-11");
  });
  it("resolves legacy references without needing a payment row", () => {
    const legacy = createBusinessDayResolver([order], [], [], settings);
    for (const row of [movement("order_o_1"), movement("order_o_1_2"), movement("x", { referenceType: "ORDER", referenceId: order.id }), movement("x", { referenceType: "INVOICE", referenceId: "i" })]) {
      assert.equal(legacy.movement(row).day, "2026-11-11");
    }
    assert.equal(legacy.movement(movement("order_o_10_2")).missingOrder, true);
  });
  it("keeps refunds, expenses, manual movements and non-table orders on their execution day", () => {
    for (const row of [movement("order_o_1", { type: "OUT" }), movement("x", { referenceType: "ORDER_CANCEL", referenceId: order.id, type: "OUT" }), movement("x", { referenceType: "EXPENSE" }), movement("x", { referenceType: "MANUAL", referenceId: order.id })]) {
      assert.equal(resolver.movement(row).day, "2026-11-12");
    }
    const takeaway = createBusinessDayResolver([{ ...order, tableId: "" }], payments, invoices, settings);
    assert.equal(takeaway.movement(movement("order_o_1")).day, "2026-11-12");
    assert.equal(resolver.entry({ referenceType: "ORDER_CANCEL", referenceId: order.id, postedAt: "2026-11-12T02:00:00Z" }), "2026-11-12");
  });
  it("falls back visibly for a missing order and leaves stored amounts and times intact", () => {
    const row = movement("missing", { referenceType: "ORDER", referenceId: "deleted" });
    const before = structuredClone(row);
    assert.deepEqual(resolver.movement(row), { day: "2026-11-12", order: undefined, missingOrder: true });
    assert.deepEqual(row, before);
  });
  it("keeps period totals, chart buckets and report rows consistent without changing balances", () => {
    const rows = [movement("order_o_1"), movement("order_o_1_1"), movement("manual", { referenceType: "MANUAL" })];
    const resolved = resolveCashMovements(rows, [], "SYP");
    const period = resolved.filter(row => dayInRange(resolver.movement(row).day, "2026-11-11", "2026-11-11"));
    assert.equal(summarizeCashMovements(period).accountingNet, 200);
    const exports = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/components/owner/ops/OpsPageShared.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, require: () => ({ ApiError: Error }), Date, Intl });
    const chart = exports.buildCashSeries(period, { from: "2026-11-11", to: "2026-11-12" }, row => resolver.movement(row).day);
    assert.equal(chart[0].cashIn, 200);
    assert.equal(chart[1].cashIn, 0);
    assert.equal(period.map(row => ({ ...row, accountingDay: resolver.movement(row).day })).length, 2);
    const registers = [{ id: "r", openingBalance: 0, currentBalance: 300 }];
    assert.equal(summarizeCashRegisters(registers, resolved).accountingNet, 300);
    const online = createBusinessDayResolver(structuredClone([order]), structuredClone(payments), structuredClone(invoices), JSON.parse(JSON.stringify(settings)));
    assert.equal(online.movement(rows[0]).day, resolver.movement(rows[0]).day);
    const changed = createBusinessDayResolver([order], payments, invoices, { ...settings, businessDayStartTime: "00:00" });
    assert.equal(changed.movement(rows[0]).day, "2026-11-12");
    assert.equal(summarizeCashRegisters(registers, resolved).accountingNet, 300);
  });
});
