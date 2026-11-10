import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test, beforeEach, after, mock } from "node:test";
import { db, store } from "../../backend/tests/firestore-fixture.mjs";
mock.module("../../backend/dist/config/firebase.js", { namedExports: { db, FieldValue: { serverTimestamp: () => new Date().toISOString(), increment: n => ({ increment: n }) } } });
const { snapshotPage } = await import("../../backend/dist/modules/sync/snapshot.js");
const { listChanges } = await import("../../backend/dist/modules/sync/change-log.js");
const { runLoggedTransaction } = await import("../../backend/dist/modules/sync/logged-transaction.js");
let snapshots, pulls, pushes, interrupt, onSnapshot, quota;
mock.module("../src/lib/api.ts", { namedExports: {
  adminRequest: async (path) => {
    if (path.endsWith("/config")) return { enabled: true, schemaVersion: 1 };
    const url = new URL(path, "https://example.test");
    snapshots++;
    if (interrupt?.(url)) throw new Error("interrupted");
    const page = await snapshotPage("r", url.searchParams.get("entity"), url.searchParams.get("after") ?? undefined);
    await onSnapshot?.(url, page);
    return page;
  },
  syncPull: async (_token, cursor, throughCursor) => {
    pulls++;
    if (quota) throw Object.assign(new Error("temporary"), { code: "firestore_resource_exhausted" });
    return listChanges("r", cursor, throughCursor);
  },
  syncPush: async (_token, _device, operations) => {
    pushes++;
    if (quota) throw Object.assign(new Error("temporary"), { code: "firestore_resource_exhausted" });
    return { results: operations.map(operation => ({ ...operation, status: "applied", serverVersion: 2 })) };
  }
} });
mock.module("../src/offline/auth-session.ts", { namedExports: { inspectToken: () => ({ expired: false }) } });
globalThis.BroadcastChannel = undefined;
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
const { offlineDb, tenantMetadataKey } = await import("../src/offline/db.ts");
const { startSync, tryIncrementalRefresh } = await import("../src/offline/sync-engine.ts");
const context = { tenantId: "r", token: "session" };
beforeEach(async () => {
  await Promise.all(offlineDb.tables.map(table => table.clear()));
  store.clear(); snapshots = 0; pulls = 0; pushes = 0; interrupt = undefined; onSnapshot = undefined; quota = false;
  process.env.INCREMENTAL_SYNC_TENANTS = "r";
  store.set("restaurants/r", { isActive: true });
});
after(() => offlineDb.close());
const orderRef = id => db.collection("restaurants").doc("r").collection("orders").doc(id);
test("bootstraps 1001 orders, catches an edit during initialization and never snapshots again", async () => {
  for (let i = 0; i < 1001; i++) store.set(orderRef(String(i).padStart(4, "0")).path, { restaurantId: "r", name: "old", version: 1 });
  let changed = false;
  onSnapshot = async url => {
    if (changed || url.searchParams.get("entity") !== "order") return;
    changed = true;
    await runLoggedTransaction(db, async tx => { tx.update(orderRef("0000"), { name: "new", version: 2 }); tx.delete(orderRef("0001")); });
  };
  await Promise.all([tryIncrementalRefresh(context), tryIncrementalRefresh(context)]);
  assert.equal((await offlineDb.orders.get("0000")).name, "new");
  assert.ok((await offlineDb.orders.get("0001")).deletedAt);
  assert.equal(await offlineDb.orders.count(), 1001);
  const initial = snapshots;
  await tryIncrementalRefresh(context);
  assert.equal(snapshots, initial);
  assert.ok((await offlineDb.syncMetadata.get(tenantMetadataKey("r"))).bootstrap.complete);
});
test("interrupted bootstrap resumes its page checkpoint and keeps pending records", async () => {
  for (let i = 0; i < 501; i++) store.set(orderRef(String(i).padStart(4, "0")).path, { restaurantId: "r", name: "server", version: 1 });
  await offlineDb.orders.put({ id: "0000", restaurantId: "r", name: "local pending", syncStatus: "pending", version: 1 });
  interrupt = url => url.searchParams.get("entity") === "order" && url.searchParams.has("after");
  await assert.rejects(startSync("r", "session"), /interrupted/);
  const meta = await offlineDb.syncMetadata.get(tenantMetadataKey("r"));
  assert.equal(meta.bootstrap.complete, false); assert.equal(meta.bootstrap.after, "0499");
  interrupt = undefined;
  const pages = [];
  onSnapshot = async url => { pages.push(url.searchParams.get("entity") + ":" + (url.searchParams.get("after") ?? "")); };
  await startSync("r", "session");
  assert.equal(pages[0], "order:0499");
  assert.equal((await offlineDb.orders.get("0000")).name, "local pending");
  assert.equal((await offlineDb.syncMetadata.get(tenantMetadataKey("r"))).bootstrap.complete, true);
});
test("drains 501 changes and preserves an unresolved conflict", async () => {
  await startSync("r", "session");
  for (let i = 1; i <= 501; i++) {
    const id = String(i);
    store.set(`restaurants/r/accounts/${id}`, { name: `Account ${i}`, restaurantId: "r" });
    store.set(`restaurants/r/changeLog/${String(i).padStart(20, "0")}`, { cursor: i, entityType: "account", entityId: id, action: "upsert", version: 1 });
  }
  store.set("restaurants/r/syncMeta/main", { cursor: 501 });
  await offlineDb.accounts.put({ id: "1", name: "Protected", restaurantId: "r", syncStatus: "conflict" });
  const before = pulls;
  await startSync("r", "session");
  assert.equal(pulls - before, 2);
  assert.equal(await offlineDb.accounts.count(), 501);
  assert.equal((await offlineDb.accounts.get("1")).name, "Protected");
  assert.equal((await offlineDb.syncMetadata.get(tenantMetadataKey("r"))).lastPullCursor, 501);
});
test("quota cooldown persists across sync triggers without dropping pending operations", async () => {
  await startSync("r", "session");
  quota = true;
  await assert.rejects(startSync("r", "session"));
  const meta = await offlineDb.syncMetadata.get(tenantMetadataKey("r"));
  assert.ok(meta.quotaRetryAt >= Date.now() + 29_000);
  const attempts = pulls;
  await Promise.all([startSync("r", "session"), startSync("r", "session")]);
  assert.equal(pulls, attempts);
  quota = false;
  await offlineDb.syncMetadata.update(tenantMetadataKey("r"), { quotaRetryAt: 0 });
  await startSync("r", "session");
  assert.equal((await offlineDb.syncMetadata.get(tenantMetadataKey("r"))).quotaRetryCount, 0);
});

test("HTTP quota preserves the pending operation and retries its original identity once", async () => {
  await startSync("r", "session");
  await offlineDb.opsTables.put({ id: "t", name: "local", restaurantId: "r", syncStatus: "pending", version: 1 });
  await offlineDb.syncQueue.put({ operationId: "original-id", tenantId: "r", deviceId: "device", userId: "owner", entityType: "table", entityId: "t", action: "update", payload: { name: "local" }, createdAt: new Date().toISOString(), status: "pending", retryCount: 0, dependencyIds: [] });
  quota = true;
  await startSync("r", "session");
  const pending = await offlineDb.syncQueue.get("original-id");
  assert.equal(pending.status, "pending");
  assert.equal(pending.error.code, "firestore_resource_exhausted");
  await startSync("r", "session");
  assert.equal(pushes, 1);
  quota = false;
  await offlineDb.syncMetadata.update(tenantMetadataKey("r"), { quotaRetryAt: 0 });
  await offlineDb.syncQueue.update("original-id", { nextAttemptAt: undefined });
  await startSync("r", "session");
  assert.equal(pushes, 2);
  assert.equal((await offlineDb.syncQueue.get("original-id")).status, "synced");
  assert.equal(await offlineDb.syncQueue.count(), 1);
  assert.equal((await offlineDb.opsTables.get("t")).syncStatus, "synced");
});
