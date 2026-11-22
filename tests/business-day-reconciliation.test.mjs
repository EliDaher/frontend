import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test, beforeEach, after, mock } from "node:test";
let fail = false, duringDownload;
mock.module("../src/lib/api.ts", { namedExports: {
  adminRequest: async () => {
    await duringDownload?.();
    if (fail) throw new Error("offline");
    return { records: [{ id: "old", name: "server", version: 1 }], baselineCursor: 5, hasMore: false };
  },
  syncPull: async () => ({ cursor: 6, changes: [], hasMore: false })
} });
const { offlineDb: db, tenantMetadataKey } = await import("../src/offline/db.ts");
const { reconcileBusinessDay } = await import("../src/offline/business-day-reconciliation.ts");
const now = new Date("2026-11-22T09:00:00Z");
const op = (id, date, extra = {}) => ({ operationId: id, tenantId: "r", entityType: "order", entityId: id, createdAt: date, status: "pending", payload: {}, dependencyIds: [], ...extra });
const run = () => reconcileBusinessDay("r", "token", [["order", db.orders]], now);
beforeEach(async () => {
  await Promise.all(db.tables.map(t => t.clear()));
  fail = false; duringDownload = undefined;
  await db.restaurants.put({ id: "r", timezone: "Asia/Damascus", businessDayStartTime: "04:00" });
  await db.syncMetadata.put({ key: tenantMetadataKey("r"), tenantId: "r", lastPullCursor: 1, reconciledBusinessDay: "2026-11-21" });
  await db.orders.bulkPut([{ id: "old", restaurantId: "r", name: "local", syncStatus: "syncing", version: 99 }, { id: "missing", restaurantId: "r", syncStatus: "pending" }, { id: "other", restaurantId: "other" }]);
  await db.syncQueue.bulkPut([op("old", "2026-11-21T09:00:00Z"), op("missing", "2026-11-21T09:00:00Z")]);
});
after(() => db.close());
test("adopts server even over higher local versions and removes old local-only rows and conflicts", async () => {
  await db.syncConflicts.put({ id: "c", tenantId: "r", operationId: "old", entityId: "old", createdAt: "2026-11-21T09:00:00Z" });
  await run();
  assert.equal((await db.orders.get("old")).name, "server");
  assert.equal((await db.orders.get("old")).syncStatus, "synced");
  assert.equal(await db.orders.get("missing"), undefined);
  assert.ok(await db.orders.get("other"));
  assert.equal(await db.syncQueue.count(), 0);
  assert.equal(await db.syncConflicts.count(), 0);
  assert.equal((await db.syncMetadata.get(tenantMetadataKey("r"))).lastPullCursor, 6);
});
test("failed download preserves local data and operations", async () => {
  fail = true;
  await assert.rejects(run(), /offline/);
  assert.equal((await db.orders.get("old")).name, "local");
  assert.equal(await db.syncQueue.count(), 2);
  assert.equal((await db.syncMetadata.get(tenantMetadataKey("r"))).reconciledBusinessDay, "2026-11-21");
  fail = false; await run();
  assert.equal(await db.syncQueue.count(), 0);
});
test("preserves today's edits created during download and removes discarded dependencies", async () => {
  duringDownload = async () => db.syncQueue.put(op("today", now.toISOString(), { entityId: "old", dependencyIds: ["old"] }));
  await run();
  assert.equal((await db.orders.get("old")).name, "local");
  assert.deepEqual((await db.syncQueue.get("today")).dependencyIds, []);
});
test("uses restaurant boundary and preserves invalid dates", async () => {
  await db.syncQueue.put(op("bad", "invalid"));
  await db.syncQueue.put(op("before-boundary", "2026-11-22T00:30:00Z"));
  await db.syncQueue.put(op("after-boundary", "2026-11-22T01:30:00Z"));
  await run();
  assert.ok(await db.syncQueue.get("bad"));
  assert.equal(await db.syncQueue.get("before-boundary"), undefined);
  assert.ok(await db.syncQueue.get("after-boundary"));
});
test("does not download again after the day's successful reconciliation", async () => {
  await run();
  fail = true;
  await run();
  assert.equal((await db.orders.get("old")).name, "server");
});
test("keeps a local prerequisite absent from server for today's operation", async () => {
  await db.syncQueue.put(op("today", now.toISOString(), { entityId: "new", dependencyIds: ["missing"], payload: { orderId: "missing" } }));
  await run();
  assert.ok(await db.syncQueue.get("missing"));
  assert.ok(await db.orders.get("missing"));
  assert.deepEqual((await db.syncQueue.get("today")).dependencyIds, ["missing"]);
});
test("preserves linked artifacts of today's operations and cleans old-only artifacts", async () => {
  await db.syncQueue.put(op("today", now.toISOString(), { entityId: "current" }));
  await db.orders.put({ id: "current", restaurantId: "r", invoiceId: "invoice-current" });
  await db.invoices.bulkPut([
    { id: "invoice-current", restaurantId: "r", orderId: "current", syncStatus: "pending" },
    { id: "invoice-old", restaurantId: "r", orderId: "missing", syncStatus: "syncing" }
  ]);
  await reconcileBusinessDay("r", "token", [["order", db.orders], ["invoice", db.invoices]], now);
  assert.ok(await db.invoices.get("invoice-current"));
  assert.equal(await db.invoices.get("invoice-old"), undefined);
});
test("failure during final apply rolls back records and queue cleanup together", async () => {
  const rejectWrite = () => { throw new Error("disk full"); };
  db.orders.hook("updating", rejectWrite);
  try {
    await assert.rejects(run(), /disk full/);
  } finally {
    db.orders.hook("updating").unsubscribe(rejectWrite);
  }
  assert.equal((await db.orders.get("old")).name, "local");
  assert.ok(await db.orders.get("missing"));
  assert.equal(await db.syncQueue.count(), 2);
});
