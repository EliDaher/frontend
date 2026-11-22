import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test, mock, beforeEach, after } from "node:test";
let pushes, onPush, committed, authExpired = false;
mock.module("../src/lib/api.ts", { namedExports: {
  adminRequest: async path => path.includes("/operations/") ? { record: committed } : { enabled: false, schemaVersion: 1 },
  syncPush: async (_token, _device, operations) => {
    pushes.push(operations);
    if (onPush) return onPush(operations);
    return { results: operations.map(op => ({ operationId: op.operationId, entityId: op.entityId, entityType: op.entityType, status: "applied", serverVersion: 2, response: { status: "PENDING" } })) };
  },
  syncPull: async (_token, cursor) => ({ cursor, changes: [], hasMore: false })
} });
mock.module("../src/offline/auth-session.ts", { namedExports: { inspectToken: () => ({ expired: authExpired }) } });
globalThis.BroadcastChannel = undefined;
Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });
const { offlineDb, tenantMetadataKey } = await import("../src/offline/db.ts");
const { queueOperation, pendingOperations, recoverStaleSyncingOperations } = await import("../src/offline/outbox.ts");
const { startSync } = await import("../src/offline/sync-engine.ts");
const input = patch => ({ tenantId: "r", userId: "owner", entityId: "o", entityType: "order", action: "update", payload: patch });
beforeEach(async () => {
  await Promise.all(offlineDb.tables.map(table => table.clear()));
  pushes = []; onPush = undefined; committed = null; authExpired = false; navigator.onLine = false;
});
after(() => offlineDb.close());
test("offline patches coalesce, closure remains ordered and all survive reopening IndexedDB", async () => {
  const first = await queueOperation(input({ notes: "first" }));
  const second = await queueOperation(input({ notes: "latest", discount: 5 }));
  assert.equal(first.operationId, second.operationId);
  const close = await queueOperation({ ...input({ paidAmount: 100 }), action: "completeOrder" });
  assert.ok(close.dependencyIds.includes(first.operationId));
  await startSync("r", "token"); assert.equal(pushes.length, 0);
  offlineDb.close(); await offlineDb.open();
  assert.equal(await offlineDb.syncQueue.count(), 2);
  assert.equal((await offlineDb.syncQueue.get(first.operationId)).payload.notes, "latest");
  assert.deepEqual((await pendingOperations("r")).map(op => op.operationId), [first.operationId]);
});
test("an attempted operation is immutable and cannot be coalesced after lost acknowledgment", async () => {
  const first = await queueOperation(input({ notes: "sent" }));
  await offlineDb.syncQueue.update(first.operationId, { retryCount: 1, lastAttemptAt: new Date().toISOString() });
  const second = await queueOperation(input({ notes: "new" }));
  assert.notEqual(first.operationId, second.operationId);
  assert.equal((await offlineDb.syncQueue.get(first.operationId)).payload.notes, "sent");
});
test("older acknowledgment never reopens a locally closed order or loses its dependent completion", async () => {
  await queueOperation(input({ notes: "sent" }));
  onPush = async operations => {
    await offlineDb.orders.put({ id: "o", restaurantId: "r", status: "COMPLETED", version: 1, syncStatus: "pending" });
    await queueOperation({ ...input({ paidAmount: 100 }), action: "completeOrder" });
    return { results: operations.map(op => ({ ...op, status: "applied", serverVersion: 2, response: { status: "PENDING" } })) };
  };
  // Stop subsequent batches without changing the local completion.
  let count = 0; const original = onPush;
  onPush = async ops => ++count === 1 ? original(ops) : { results: ops.map(op => ({ ...op, status: "rejected", error: { code: "temporary", retryable: true, message: "retry" } })) };
  navigator.onLine = true; await startSync("r", "token");
  assert.equal((await offlineDb.orders.get("o")).status, "COMPLETED");
  assert.equal((await offlineDb.orders.get("o")).syncStatus, "failed");
});
test("active lease protects in-flight work; an abandoned lease is recoverable", async () => {
  const op = await queueOperation(input({}));
  await offlineDb.syncQueue.update(op.operationId, { status: "syncing", lastAttemptAt: new Date(Date.now() - 120000).toISOString() });
  await offlineDb.syncMetadata.put({ key: tenantMetadataKey("r"), tenantId: "r", lastPullCursor: 0, syncInProgress: true, syncLeaseUntil: new Date(Date.now() + 60000).toISOString() });
  assert.equal(await recoverStaleSyncingOperations("r"), 0);
  await offlineDb.syncMetadata.update(tenantMetadataKey("r"), { syncLeaseUntil: new Date(0).toISOString() });
  assert.equal(await recoverStaleSyncingOperations("r"), 1);
});
test("23-hour recovery verifies a committed operation without resubmitting its effect", async () => {
  const op = await queueOperation({ ...input({}), entityType: "cashMovement", action: "create" });
  await offlineDb.syncQueue.update(op.operationId, { createdAt: new Date(Date.now() - 23.5 * 3600000).toISOString() });
  committed = { ...op, status: "applied", serverVersion: 2, response: {} };
  navigator.onLine = true; await startSync("r", "token");
  assert.equal(pushes.length, 0); assert.equal((await offlineDb.syncQueue.get(op.operationId)).status, "synced");
});
test("missing dependencies become durable needs-attention after status verification", async () => {
  const op = await queueOperation({ ...input({}), dependencyIds: ["missing"] });
  await offlineDb.syncQueue.update(op.operationId, { createdAt: new Date(Date.now() - 25 * 3600000).toISOString() });
  navigator.onLine = true; await startSync("r", "token");
  assert.equal(pushes.length, 0);
  assert.equal((await offlineDb.syncQueue.get(op.operationId)).error.code, "needs_attention");
});
test("24-hour repeated failures retain the operation and stop automatic resubmission", async () => {
  const op = await queueOperation(input({ notes: "preserve" }));
  await offlineDb.syncQueue.update(op.operationId, { createdAt: new Date(Date.now() - 26 * 3600000).toISOString(), recoveryCheckedAt: new Date(Date.now() - 2 * 3600000).toISOString(), retryCount: 40 });
  navigator.onLine = true; await startSync("r", "token");
  const saved = await offlineDb.syncQueue.get(op.operationId);
  assert.equal(saved.error.code, "needs_attention"); assert.equal(saved.payload.notes, "preserve"); assert.equal(pushes.length, 0);
});
test("waiter legacy migration preserves the backup and never replaces a durable confirmation", async () => {
  const { persistBatch, migrateBatches, restoreBatches } = await import("../src/components/waiter/outbox.ts");
  const batch = { operationId: "legacy-key", tableId: "t", orderId: "o", createdAt: new Date().toISOString(), items: [], status: "pending" };
  await migrateBatches("r:owner", [batch]);
  await persistBatch("r:owner", { ...batch, status: "sent" });
  await migrateBatches("r:owner", [batch]);
  assert.equal((await restoreBatches("r:owner"))[0].status, "sent");
  assert.equal(batch.status, "pending");
});
