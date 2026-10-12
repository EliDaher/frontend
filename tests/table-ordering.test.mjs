import assert from "node:assert/strict";
import { it } from "node:test";
import { sortTablesByNumber } from "../src/lib/table-number.ts";

const tables = (names) => names.map((name, index) => ({ id: `table-${index}`, name }));
const names = (entries) => entries.map((entry) => entry.name);

it("sorts numeric tables ascending without lexicographic or precision errors", () => {
  assert.deepEqual(names(sortTablesByNumber(tables(["20", "11", "2", "10", "1"]))), ["1", "2", "10", "11", "20"]);
  assert.deepEqual(names(sortTablesByNumber(tables(["9007199254740993", "9007199254740992"]))), ["9007199254740992", "9007199254740993"]);
});

it("normalizes mixed Arabic, Persian, and English numeric representations for sorting", () => {
  assert.deepEqual(names(sortTablesByNumber(tables(["۲۰", "١١", "2", "۱۰", "١", "5", "٥", "05", "۰۵"]))),
    ["١", "2", "5", "٥", "05", "۰۵", "۱۰", "١١", "۲۰"]);
});

it("uses a natural deterministic fallback for named tables without changing identities", () => {
  const source = tables(["VIP 10", "Terrace", "VIP 2", "2", "VIP 1"]);
  const result = sortTablesByNumber(source);
  assert.deepEqual(names(result), ["2", "Terrace", "VIP 1", "VIP 2", "VIP 10"]);
  assert.deepEqual(sortTablesByNumber(source), result);
  const arabicNames = tables(["طاولة ١٠", "طاولة ٢", "طاولة 1"]);
  assert.deepEqual(names(sortTablesByNumber(arabicNames)), ["طاولة 1", "طاولة ٢", "طاولة ١٠"]);
});

it("search and status filters preserve the same order whether applied before or after sorting", () => {
  const source = tables(["20", "11", "2", "10", "1"]).map((table) => ({ ...table, status: table.name === "11" ? "DISABLED" : "AVAILABLE" }));
  const filter = (table) => table.status === "AVAILABLE" && table.name.includes("1");
  assert.deepEqual(names(sortTablesByNumber(source.filter(filter))), ["1", "10"]);
  assert.deepEqual(sortTablesByNumber(source).filter(filter), sortTablesByNumber(source.filter(filter)));
});

it("keeps equivalent numeric values stable through repeated sorting and refreshed record objects", () => {
  const source = [
    { id: "z", name: "٥" }, { id: "y", name: "05" },
    { id: "x", name: "5" }, { id: "ten", name: "10" }, { id: "one", name: "1" }
  ];
  const expectedIds = ["one", "z", "y", "x", "ten"];
  const initial = sortTablesByNumber(source);
  assert.deepEqual(initial.map((table) => table.id), expectedIds);
  assert.deepEqual(sortTablesByNumber(initial).map((table) => table.id), expectedIds);
  const refreshed = source.map((table) => ({ ...table, updatedAt: "later", status: "AVAILABLE" }));
  assert.deepEqual(sortTablesByNumber(refreshed).map((table) => table.id), expectedIds);
});

it("does not mutate Dexie or React arrays or records", () => {
  const source = Object.freeze(tables(["10", "2", "1"]).map(Object.freeze));
  const before = structuredClone(source);
  const result = sortTablesByNumber(source);
  assert.notEqual(result, source);
  assert.deepEqual(source, before);
  assert.equal(result[0], source[2]);
});
