import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { WaiterDataClient, applyConfirmation, bindSubmissionRecovery, menuCacheKey } from "../src/components/waiter/data-client.ts";
import { waiterMenuCache, waiterMenuDb } from "../src/components/waiter/menu-cache.ts";
import { PendingBatchSender } from "../src/components/waiter/submission.ts";
import { ApiError } from "../src/lib/api-errors.ts";

const session = (cacheSessionId = "s1", restaurantId = "r1", id = "w1") => ({
  cacheSessionId, token: `private-token-${cacheSessionId}`, user: { id, restaurantId, name: "Waiter" }, restaurantName: "Cafe",
});
const menu = { items: [{ id: "juice", name: "Juice", categoryId: "drinks", isAvailable: true, order: 0 }], categories: [{ id: "drinks", name: "Drinks", order: 0 }] };
const state = { tables: [{ id: "t", name: "1", area: "Main", status: "AVAILABLE", currentOrderId: "" }], orders: [] };
const confirmed = { orderId: "o", table: { ...state.tables[0], status: "OCCUPIED", currentOrderId: "o" }, order: { id: "o", tableId: "t", status: "PENDING", items: [{ menuItemId: "juice", name: "Juice", quantity: 15, notes: "بدون سكر" }] } };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
beforeEach(async () => { await waiterMenuDb.menus.clear(); });
after(async () => { await waiterMenuDb.delete(); });

test("menu is fetched once, concurrent initialization is coalesced, IndexedDB survives a page-client reload", async () => {
  const paths = [];
  const request = async path => { paths.push(path); return structuredClone(menu); };
  const client = new WaiterDataClient(waiterMenuCache, request);
  await Promise.all([client.menu(session()), client.menu(session())]);
  await client.menu(session());
  assert.deepEqual(paths, ["/api/waiter/menu"]);
  const reloaded = new WaiterDataClient(waiterMenuCache, request);
  assert.deepEqual(await reloaded.menu(session()), menu);
  assert.equal(paths.length, 1);
  const entries = await waiterMenuDb.menus.toArray();
  assert.equal(entries.length, 1);
  assert.doesNotMatch(JSON.stringify(entries), /private-token|password|credentials/);
});

test("cache is isolated by restaurant, user AND authenticated session; new login gets a fresh menu", async () => {
  let calls = 0;
  const client = new WaiterDataClient(waiterMenuCache, async () => ({ ...menu, marker: ++calls }));
  const a = session(), b = session("s2"), c = session("s1", "r2"), d = session("s1", "r1", "w2");
  for (const s of [a, b, c, d]) await client.menu(s);
  assert.equal(calls, 4);
  assert.equal((await waiterMenuCache.get(menuCacheKey(a))).marker, 1);
  await waiterMenuCache.removeOtherSessions(b);
  assert.equal(await waiterMenuCache.get(menuCacheKey(a)), undefined);
  assert.ok(await waiterMenuCache.get(menuCacheKey(c)));
  assert.ok(await waiterMenuCache.get(menuCacheKey(d)));
});

test("two page clients sharing a session serialize cache misses across tabs", async () => {
  let tail = Promise.resolve(), requests = 0;
  const lock = (_key, action) => { const next = tail.then(action); tail = next.catch(() => {}); return next; };
  const request = async () => { requests++; return menu; };
  const firstTab = new WaiterDataClient(waiterMenuCache, request, () => {}, lock);
  const secondTab = new WaiterDataClient(waiterMenuCache, request, () => {}, lock);
  await Promise.all([firstTab.menu(session()), secondTab.menu(session())]);
  assert.equal(requests, 1);
});

test("failed initialization allows explicit menu retry; unavailable IndexedDB retains the successful in-memory result", async () => {
  let calls = 0, warnings = 0;
  const unavailable = { ...waiterMenuCache, get: async () => { throw Error("blocked"); }, put: async () => { throw Error("full"); } };
  const client = new WaiterDataClient(unavailable, async () => {
    if (++calls === 1) throw Error("network");
    return menu;
  }, () => { warnings++; });
  await assert.rejects(client.menu(session()));
  assert.deepEqual(await client.menu(session()), menu);
  await client.menu(session());
  assert.equal(calls, 2); assert.ok(warnings > 0);
});

test("logout/expiry invalidation removes only the relevant session; an in-flight fetch cannot resurrect it", async () => {
  const a = session(), b = session("s2");
  const request = deferred();
  const client = new WaiterDataClient(waiterMenuCache, () => request.promise);
  await waiterMenuCache.put(menuCacheKey(b), menu);
  const pending = client.menu(a);
  await client.invalidate(a);
  request.resolve(menu);
  await pending;
  assert.equal(await waiterMenuCache.get(menuCacheKey(a)), undefined);
  assert.ok(await waiterMenuCache.get(menuCacheKey(b)));
  await client.invalidate(b);
  assert.equal(await waiterMenuCache.get(menuCacheKey(b)), undefined);
});

test("initial and explicit state refreshes only read state; overlapping refreshes share one request", async () => {
  const calls = [], pending = deferred();
  const client = new WaiterDataClient(waiterMenuCache, async path => { calls.push(path); return pending.promise; });
  const first = client.refresh(session()), overlap = client.refresh(session());
  assert.equal(first, overlap);
  pending.resolve(state);
  assert.deepEqual(await first, state);
  await client.refresh(session());
  assert.deepEqual(calls, ["/api/waiter/state", "/api/waiter/state"]);
});

test("a failed refresh allows manual retry and leaves the previous displayed snapshot intact", async () => {
  let fail = false, displayed = structuredClone(state);
  const client = new WaiterDataClient(waiterMenuCache, async () => { if (fail) throw Error("offline"); return state; });
  displayed = await client.refresh(session());
  fail = true;
  await assert.rejects(async () => { displayed = await client.refresh(session()); });
  assert.deepEqual(displayed, state);
  fail = false;
  assert.deepEqual(await client.refresh(session()), state);
});

test("idle time, focus and visibility never request data; reconnect only invokes submission recovery", async t => {
  const paths = [], target = new EventTarget();
  const client = new WaiterDataClient(waiterMenuCache, async path => { paths.push(path); return path.endsWith("menu") ? menu : state; });
  await Promise.all([client.menu(session()), client.refresh(session())]);
  let recoveries = 0;
  const unbind = bindSubmissionRecovery(target, () => { recoveries++; });
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  t.mock.timers.tick(8 * 60 * 60 * 1000);
  target.dispatchEvent(new Event("focus"));
  target.dispatchEvent(new Event("visibilitychange"));
  assert.equal(recoveries, 0);
  target.dispatchEvent(new Event("online"));
  assert.equal(recoveries, 1);
  assert.deepEqual(paths.sort(), ["/api/waiter/menu", "/api/waiter/state"]);
  unbind(); target.dispatchEvent(new Event("online")); assert.equal(recoveries, 1);
});

function recoveryFixture(batchCount = 1) {
  let persisted = JSON.stringify(Array.from({ length: batchCount }, (_, index) => ({
    operationId: `operation-${index}`, tableId: "t", orderId: "", createdAt: new Date().toISOString(),
    items: confirmed.order.items, status: "pending",
  })));
  const sending = [], failures = [];
  let current = true, online = true, expired = false;
  let displayed = structuredClone(state);
  const read = () => JSON.parse(persisted);
  const update = (id, patch) => { persisted = JSON.stringify(read().map(b => b.operationId === id ? { ...b, ...patch } : b)); };
  return {
    read, sending, failures, displayed: () => displayed, expire: () => { current = false; }, offline: () => { online = false; },
    expired: () => expired,
    callbacks: {
      pending: read, current: () => current, online: () => online, waitForRefresh: async () => {},
      sending: value => sending.push(value), failed: message => failures.push(message),
      confirmed: (batch, result) => { update(batch.operationId, { status: "sent" }); displayed = applyConfirmation(displayed, batch.tableId, result); },
      review: (batch, error) => update(batch.operationId, { status: "review", error }),
      expired: () => { expired = true; current = false; },
    },
  };
}

test("successful submission updates confirmed UI, strips local fields and makes no data-fetch requests", async () => {
  const fixture = recoveryFixture(), payloads = [];
  const sender = new PendingBatchSender(async (token, body) => { payloads.push(body); return confirmed; });
  await sender.send(session(), fixture.callbacks);
  assert.equal(payloads.length, 1);
  assert.deepEqual(payloads[0].items, [{ menuItemId: "juice", quantity: 15, notes: "بدون سكر" }]);
  assert.equal(Object.hasOwn(payloads[0], "orderNote"), false, "legacy batch fingerprints preserve omitted notes");
  assert.equal(fixture.read()[0].status, "sent");
  assert.equal(fixture.displayed().tables[0].currentOrderId, "o");
  assert.deepEqual(fixture.displayed().orders[0].items, confirmed.order.items);
  await sender.send(session(), fixture.callbacks); assert.equal(payloads.length, 1);
});

test("lost response keeps a durable pending batch; reload/manual retry uses same operation ID without duplicate application", async () => {
  const fixture = recoveryFixture(), applied = new Set(), bodies = [];
  let lost = true;
  const post = async (_, body) => {
    bodies.push(body); applied.add(body.operationId);
    if (lost) { lost = false; throw Error("reply lost after server commit"); }
    return confirmed;
  };
  await new PendingBatchSender(post).send(session(), fixture.callbacks);
  assert.equal(fixture.read()[0].status, "pending"); assert.equal(bodies.length, 1);
  await new PendingBatchSender(post).send(session(), fixture.callbacks);
  assert.equal(fixture.read()[0].status, "sent"); assert.deepEqual(bodies[0], bodies[1]); assert.equal(applied.size, 1);
});

test("double taps coalesce, stale accounts cannot send the next queued batch or change another account's UI", async () => {
  const fixture = recoveryFixture(2), request = deferred(); let calls = 0;
  const sender = new PendingBatchSender(async () => { calls++; return request.promise; });
  const first = sender.send(session(), fixture.callbacks), duplicate = sender.send(session(), fixture.callbacks);
  assert.equal(first, duplicate);
  await Promise.resolve(); assert.equal(calls, 1);
  fixture.expire(); request.resolve(confirmed); await first;
  assert.equal(calls, 1); assert.ok(fixture.read().every(b => b.status === "pending"));
});

test("offline submissions stay queued; 401 stops recovery; conflicts need review; 503 is a finite retryable pass", async () => {
  const offline = recoveryFixture(); offline.offline();
  await new PendingBatchSender(async () => { throw Error("must not request"); }).send(session(), offline.callbacks);
  assert.equal(offline.read()[0].status, "pending");
  for (const [status, expected] of [[401, "pending"], [409, "review"], [503, "pending"], [429, "pending"]]) {
    const fixture = recoveryFixture(); let calls = 0;
    await new PendingBatchSender(async () => { calls++; throw new ApiError("failure", status); }).send(session(), fixture.callbacks);
    assert.equal(calls, 1); assert.equal(fixture.read()[0].status, expected);
    assert.equal(fixture.expired(), status === 401);
  }
});

test("submission waits for an in-flight snapshot; replay after closure removes only that table's old order", async () => {
  const fixture = recoveryFixture(), refresh = deferred(); let posted = false;
  const sender = new PendingBatchSender(async () => { posted = true; return confirmed; });
  const send = sender.send(session(), { ...fixture.callbacks, waitForRefresh: () => refresh.promise });
  await Promise.resolve(); assert.equal(posted, false); refresh.resolve(); await send;
  const next = applyConfirmation({ tables: [confirmed.table, { ...state.tables[0], id: "other" }], orders: [confirmed.order] }, "t", { orderId: "o", table: state.tables[0], order: null });
  assert.equal(next.orders.length, 0); assert.equal(next.tables.length, 2);
});

test("waiter component wires explicit initialization/refresh, token expiry cleanup, and no data polling/focus hooks", async () => {
  const source = await readFile(new URL("../src/components/waiter/WaiterApp.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /setInterval|addEventListener\("focus"|addEventListener\("visibilitychange"|\/api\/waiter\/bootstrap/);
  assert.match(source, /تحديث الطاولات/);
  assert.match(source, /إعادة إرسال الدفعات/);
  assert.match(source, /tokenExpirationMs/);
  assert.match(source, /client\.invalidate/);
  assert.match(source, /initializedSession\.current !== s\.cacheSessionId/);
  const senderSource = await readFile(new URL("../src/components/waiter/submission.ts", import.meta.url), "utf8");
  assert.doesNotMatch(senderSource, /\/api\/waiter\/(?:menu|state|bootstrap)|setInterval|setTimeout/);
});
