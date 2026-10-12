import assert from "node:assert/strict";
import { it } from "node:test";
import { normalizeTableName, validateTableForm, duplicateTableNameMessage, isDuplicateTableNumberError, confirmedTableId, requireTableAdministrationOnline, saveConfirmedTable, tableAdministrationPayload } from "../src/lib/table-number.ts";
import { normalizeTableName as backendNormalize } from "../../backend/src/modules/restaurant-ops/table-name.ts";
const cached = [
  { id: "five", name: "5", restaurantId: "A" },
  { id: "six", name: "6", restaurantId: "A", status: "DISABLED" },
  { id: "other", name: "7", restaurantId: "B" },
  { id: "deleted", name: "8", restaurantId: "A", deletedAt: "now" }
];
it("requires name and positive integer capacity", () => {
  assert.ok(validateTableForm({ name: "  ", capacity: 0 }, cached, "A").name);
  assert.ok(validateTableForm({ name: "9", capacity: 1.5 }, cached, "A").capacity);
});
it("same-restaurant duplicate gives exact Arabic inline feedback", () => {
  for (const name of ["5", "٥", "۰۵", " 05 "]) {
    assert.equal(validateTableForm({ name, capacity: 4 }, cached, "A").name, duplicateTableNameMessage);
  }
});
it("unchanged edit excludes its own ID and conflicting rename is rejected", () => {
  assert.deepEqual(validateTableForm({ name: "٥", capacity: 4 }, cached, "A", "five"), {});
  assert.equal(validateTableForm({ name: "6", capacity: 4 }, cached, "A", "five").name, duplicateTableNameMessage);
});
it("another restaurant and deleted tables do not conflict", () => {
  assert.deepEqual(validateTableForm({ name: "7", capacity: 4 }, cached, "A"), {});
  assert.deepEqual(validateTableForm({ name: "8", capacity: 4 }, cached, "A"), {});
});
it("frontend and backend normalization agree", () => {
  for (const name of [" ٥ ", "۰۰۵", "05", "000", "A05", "A5", "Table 5", "table 5", "طاولة ٥", "5/roof", "A  5", ""]) assert.equal(normalizeTableName(name), backendNormalize(name));
});
it("digit normalization applies only to numeric identities, preserving named tables", () => {
  const named = [{ id: "named", name: "طاولة ٥", restaurantId: "A" }];
  assert.deepEqual(validateTableForm({ name: "طاولة 5", capacity: 4 }, named, "A"), {});
  assert.equal(normalizeTableName(" A۵ "), "A۵");
  assert.equal(normalizeTableName("٠۰5"), "5");
  assert.equal(normalizeTableName("0009007199254740993"), "9007199254740993");
});
it("distinguishes structured duplicate conflicts from other failures", () => {
  assert.equal(isDuplicateTableNumberError({ status: 409, message: duplicateTableNameMessage }), true);
  assert.equal(isDuplicateTableNumberError({ status: 409, code: "duplicate_table_number" }), true);
  assert.equal(isDuplicateTableNumberError({ status: 409, message: "open order" }), false);
  assert.equal(isDuplicateTableNumberError(null), false);
});
it("requires server confirmation before a successful create/update", () => {
  assert.equal(confirmedTableId({ id: "new" }), "new");
  assert.equal(confirmedTableId({ ok: true }, "existing"), "existing");
  for (const response of [undefined, {}, { ok: false }]) {
    assert.throws(() => confirmedTableId(response));
    assert.throws(() => confirmedTableId(response, "existing"));
  }
});
it("validation preserves the entered form and cached table references", () => {
  const form = { name: "٥", capacity: 4 };
  const before = structuredClone(cached);
  validateTableForm(form, cached, "A");
  assert.deepEqual(form, { name: "٥", capacity: 4 });
  assert.deepEqual(cached, before);
});

it("offline table administration stops before writes; cached data remains available", () => {
  const before = structuredClone(cached);
  assert.throws(() => requireTableAdministrationOnline(false), /الإنترنت/);
  assert.doesNotThrow(() => requireTableAdministrationOnline(true));
  assert.deepEqual(cached, before);
});
it("confirmed create followed by cache failure is still saved and is not retried", async () => {
  let writes = 0;
  const result = await saveConfirmedTable(async () => { writes++; return { id: "new" }; }, async () => { throw new Error("cache network failure"); });
  assert.deepEqual(result, { id: "new", cacheUpdated: false });
  assert.equal(writes, 1);
});
it("server conflict does not mutate the cache or claim successful creation", async () => {
  let refreshes = 0;
  const conflict = Object.assign(new Error(duplicateTableNameMessage), { status: 409 });
  await assert.rejects(saveConfirmedTable(async () => { throw conflict; }, async () => { refreshes++; return true; }), (error) => isDuplicateTableNumberError(error));
  assert.equal(refreshes, 0);
});
it("successful edit refreshes only its stable ID after confirmation", async () => {
  const events = [];
  const result = await saveConfirmedTable(async () => { events.push("server-confirmed"); return { ok: true }; }, async (id) => { events.push(id); return true; }, "five");
  assert.deepEqual(result, { id: "five", cacheUpdated: true });
  assert.deepEqual(events, ["server-confirmed", "five"]);
});

it("renaming a table never submits a stale current-order association", () => {
  const form = { name: " 5 ", currentOrderId: "stale-local-order", area: "Main", capacity: 4 };
  const payload = tableAdministrationPayload(form, true);
  assert.equal(payload.name, "5");
  assert.equal("currentOrderId" in payload, false);
  assert.equal(tableAdministrationPayload(form, false).currentOrderId, "stale-local-order");
  assert.equal(form.currentOrderId, "stale-local-order");
});
