import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { resolveCashMovements, summarizeCashRegisters } from "../src/lib/cash-balances.ts";
import { after, beforeEach, describe, it, mock } from "node:test";
mock.module("../src/offline/sync-engine.ts", { namedExports: { startSync: async () => undefined } });
let serverPush, serverPull;
mock.module("../src/lib/api.ts", { namedExports: {
  adminBackgroundRequest: async () => { throw new Error("offline"); },
  syncPush: async (_token, device, operations) => serverPush("r", { id: "owner", email: "test@example.test", role: "OWNER", permissions: [] }, device, operations),
  syncPull: async (_token, cursor) => serverPull("r", cursor)
} });
mock.module("../src/offline/auth-session.ts", { namedExports: { inspectToken: () => ({ expired: false }) } });
import { db as serverDb, store as serverStore } from "../../backend/tests/firestore-fixture.mjs";
mock.module("../../backend/dist/config/firebase.js", { namedExports: { db: serverDb, FieldValue: { serverTimestamp: () => "2026-11-01T12:00:00.000Z", increment: value => ({ increment: value }) } } });
const server = await import("../../backend/dist/modules/sync/service.js");
serverPush = server.pushOperations; serverPull = server.pullChanges;
globalThis.BroadcastChannel = undefined;
const { startSync: synchronize } = await import("../src/offline/sync-engine.ts?live");
const { offlineDb } = await import("../src/offline/db.ts");
const { completeLocalOrder, cancelLocalOrder } = await import("../src/offline/repositories/orders.ts");
const { createLocalExpense, createLocalCashMovement, settleLocalInvoice, settleLocalExpense } = await import("../src/offline/repositories/financial-history.ts");
const context = { tenantId: "r", userId: "owner", token: "test" };
const row = (originalAmount, currency = "SYP", method = "CASH", exchangeRate = 10000) => ({ originalAmount, currency, method, exchangeRate, cashRegisterId: "cash" });
beforeEach(async () => {
  await Promise.all(offlineDb.tables.map(table => table.clear()));
  await offlineDb.restaurants.put({ id: "r", currency: "SYP", usdExchangeRate: 10000 });
  await offlineDb.cashRegisters.put({ id: "cash", restaurantId: "r", currentBalance: 0, openingBalance: 0, name: "نقد", isOpen: true });
  await offlineDb.orders.put({ id: "o", restaurantId: "r", currency: "SYP", name: "طلب", tableId: "", status: "PENDING", items: [], total: 1000, subTotal: 1000, discount: 0, tax: 0, serviceCharge: 0, paidAmount: 0, paymentMethod: "CASH", paymentStatus: "UNPAID", notes: "", version: 1 });
});
after(() => offlineDb.close());
describe("offline financial transactions", () => {
  it("stores mixed checkout and dependent settlements atomically without a network", async () => {
    const input = { paymentMethod: "CASH", paidAmount: 0, settlementMode: "PARTIAL", payments: [row(300), row(.02, "USD", "SHAM_CASH")], note: "" };
    await completeLocalOrder(context, "o", input);
    await completeLocalOrder(context, "o", input);
    assert.equal(await offlineDb.syncQueue.count(), 1);
    assert.equal((await offlineDb.invoices.get("order_o")).remainingAmount, 500);
    assert.equal((await offlineDb.cashRegisters.get("cash")).currentBalance, 500);
    await offlineDb.restaurants.update("r", { usdExchangeRate: 20000 });
    await settleLocalInvoice(context, "order_o", { settlementMode: "FULL", payments: [row(.02, "USD", "CASH", 20000), row(100)], note: "" });
    assert.equal((await offlineDb.orders.get("o")).paidAmount, 1000);
    const queue = await offlineDb.syncQueue.toArray();
    const paymentOp = queue.find(op => op.entityType === "payment");
    assert.ok(paymentOp.dependencyIds.includes(queue.find(op => op.entityType === "order").operationId));
    assert.equal((await offlineDb.payments.get("order_o_1")).exchangeRate, 10000);
    await cancelLocalOrder(context, "o", "test");
    assert.equal((await offlineDb.cashRegisters.get("cash")).currentBalance, 0);
    assert.equal((await offlineDb.invoices.get("order_o")).status, "VOID");
  });
  it("rolls back every local artifact when a selected register is missing", async () => {
    await assert.rejects(completeLocalOrder(context, "o", { paymentMethod: "CASH", paidAmount: 0, settlementMode: "FULL", payments: [{ ...row(1000), cashRegisterId: "missing" }], note: "" }));
    assert.equal(await offlineDb.invoices.count(), 0); assert.equal(await offlineDb.payments.count(), 0); assert.equal(await offlineDb.syncQueue.count(), 0);
    assert.equal((await offlineDb.orders.get("o")).status, "PENDING");
  });
  it("stores dollar expenses once and queues payable settlements after their creation", async () => {
    const expense = await createLocalExpense(context, { category: "مصروف", amount: .1, currency: "USD", exchangeRate: 10000, settlementMode: "PARTIAL", payments: [row(500)], paymentMethod: "CASH", notes: "" });
    assert.equal(expense.amount, 1000); assert.equal(expense.remainingAmount, 500);
    await settleLocalExpense(context, expense.id, { settlementMode: "FULL", payments: [row(.05, "USD", "SHAM_CASH")], note: "" });
    assert.equal((await offlineDb.expenses.get(expense.id)).remainingAmount, 0);
    assert.equal((await offlineDb.cashRegisters.get("cash")).currentBalance, -1000);
    const ops = await offlineDb.syncQueue.toArray();
    const paymentOp = ops.find(op => op.entityType === "payment");
    assert.ok(paymentOp.dependencyIds.includes(ops.find(op => op.entityType === "expense").operationId));
  });
  it("normalizes manual dollar movements and rejects overpayments before any writes", async () => {
    const movement = await createLocalCashMovement(context, { cashRegisterId: "cash", type: "IN", method: "SHAM_CASH", amount: .05, currency: "USD", exchangeRate: 10000, note: "" });
    assert.equal(movement.amount, 500); assert.equal(movement.originalAmount, .05);
    assert.equal((await offlineDb.cashRegisters.get("cash")).currentBalance, 500);
    await assert.rejects(completeLocalOrder(context, "o", { paymentMethod: "CASH", paidAmount: 0, settlementMode: "FULL", payments: [row(1001)], note: "" }));
    assert.equal(await offlineDb.invoices.count(), 0);
  });
  it("synchronizes queued checkout, later settlement and cancellation with the server in dependency order", async () => {
    serverStore.clear();
    serverStore.set("restaurants/r", { currency: "SYP", usdExchangeRate: 10000 });
    serverStore.set("restaurants/r/cashRegisters/cash", { restaurantId: "r", name: "نقد", currentBalance: 0, openingBalance: 0, isOpen: true });
    const order = await offlineDb.orders.get("o");
    serverStore.set("restaurants/r/orders/o", { ...order, invoiceId: "", paymentId: "", inventoryDeductedAt: "" });
    await completeLocalOrder(context, "o", { paymentMethod: "CASH", paidAmount: 0, customerName: "  ليلى  ", settlementMode: "PARTIAL", payments: [row(300), row(.02, "USD", "SHAM_CASH")], note: "" });
    await settleLocalInvoice(context, "order_o", { settlementMode: "FULL", payments: [row(500)], note: "" });
    await cancelLocalOrder(context, "o", "test");
    Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
    await synchronize("r", "test");
    const operations = await offlineDb.syncQueue.toArray();
    assert.deepEqual(operations.map(op => op.status), operations.map(() => "synced"), JSON.stringify(operations.map(op => op.error)));
    assert.equal(serverStore.get("restaurants/r/cashRegisters/cash").currentBalance, 0);
    assert.equal((await offlineDb.cashRegisters.get("cash")).currentBalance, 0);
    assert.equal((await offlineDb.orders.get("o")).status, "CANCELLED");
    assert.equal(serverStore.get("restaurants/r/invoices/order_o").customerName, "ليلى");
    assert.equal((await offlineDb.invoices.get("order_o")).customerName, "ليلى");
    assert.equal((await offlineDb.orders.get("o")).customerName, "ليلى");
    assert.equal((await offlineDb.invoices.get("order_o")).status, "VOID");
    assert.equal((await offlineDb.cashMovements.toArray()).every(row => row.syncStatus === "synced"), true);
  });

  for (const [mode, amount, rawName, expectedName] of [
    ["FULL", 1000, "  أحمد  ", "أحمد"],
    ["PARTIAL", 500, "زبون جزئي", "زبون جزئي"],
    ["DEBT", 0, "زبون الدين", "زبون الدين"],
    ["FULL", 1000, "  ", undefined],
    ["DEBT", 0, undefined, undefined]
  ]) {
    it(`stores an optional customer name offline for ${mode} (${JSON.stringify(rawName)})`, async () => {
      await completeLocalOrder(context, "o", { paymentMethod: "CASH", paidAmount: amount, settlementMode: mode, payments: amount ? [row(amount)] : [], note: "", ...(rawName !== undefined ? { customerName: rawName } : {}) });
      offlineDb.close(); await offlineDb.open();
      assert.equal((await offlineDb.orders.get("o")).customerName, expectedName);
      assert.equal((await offlineDb.orders.get("o")).name, "طلب");
      assert.equal((await offlineDb.invoices.get("order_o")).customerName, expectedName);
      const operations = await offlineDb.syncQueue.toArray();
      assert.equal(operations[0].payload.customerName, expectedName);
      if (expectedName === undefined) assert.equal(Object.hasOwn(operations[0].payload, "customerName"), false);
    });
  }

  it("preserves all four native cash buckets before and after synchronization and retries", async () => {
    serverStore.clear();
    serverStore.set("restaurants/r", { currency: "SYP", usdExchangeRate: 143 });
    serverStore.set("restaurants/r/cashRegisters/cash", { restaurantId: "r", name: "صندوق", currentBalance: 0, openingBalance: 0, isOpen: true });
    const order = await offlineDb.orders.get("o");
    serverStore.set("restaurants/r/orders/o", { ...order, invoiceId: "", paymentId: "", inventoryDeductedAt: "" });
    await completeLocalOrder(context, "o", { paymentMethod: "CASH", paidAmount: 0, settlementMode: "FULL", payments: [row(2, "USD", "CASH", 143), row(100), row(2, "USD", "SHAM_CASH", 200), row(214, "SYP", "SHAM_CASH")], note: "" });
    async function snapshot() {
      const registers = await offlineDb.cashRegisters.toArray();
      const movements = await offlineDb.cashMovements.toArray();
      const payments = await offlineDb.payments.toArray();
      return summarizeCashRegisters(registers, resolveCashMovements(movements, payments));
    }
    const before = await snapshot();
    assert.deepEqual(Object.values(before.sections).map(section => section.net), [2, 100, 2, 214]);
    assert.equal(before.accountingNet, 1000);
    Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
    await synchronize("r", "test");
    assert.deepEqual(await snapshot(), before);
    await synchronize("r", "test");
    assert.deepEqual(await snapshot(), before);
    assert.equal(await offlineDb.cashMovements.count(), 4);
    assert.equal(await offlineDb.payments.count(), 4);
  });

});
