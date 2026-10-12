import assert from "node:assert/strict";
import { it } from "node:test";
import { resolveNewItemCategory as resolve } from "../src/components/owner/menu-item-category.ts";
const categories = [{ id: "A", isActive: true }, { id: "B", isActive: true }];
it("remembers successive creations", () => {
  const memory = { tenant: "A" };
  assert.equal(resolve(categories, memory, "tenant"), "A");
  memory.tenant = "B";
  assert.equal(resolve(categories, memory, "tenant"), "B");
});
it("explicit context takes precedence without changing creation preference", () => {
  const memory = { tenant: "B" };
  assert.equal(resolve(categories, memory, "tenant", "A"), "A");
  assert.equal(resolve(categories, memory, "tenant", "all"), "B");
  assert.deepEqual(memory, { tenant: "B" });
});
it("deleted and inactive categories fall back", () => {
  assert.equal(resolve(categories.slice(0, 1), { tenant: "B" }, "tenant"), "A");
  assert.equal(resolve([categories[0], { id: "B", isActive: false }], { tenant: "B" }, "tenant"), "A");
  assert.equal(resolve([], { tenant: "B" }, "tenant"), "");
});
it("inactive explicit contexts fall back to remembered category", () => {
  assert.equal(resolve([{ id: "C", isActive: false }, ...categories], { tenant: "B" }, "tenant", "C"), "B");
});
it("restaurant preferences do not leak even with overlapping category IDs", () => {
  const memory = { first: "B", second: "A" };
  assert.equal(resolve(categories, memory, "first"), "B");
  assert.equal(resolve(categories, memory, "second"), "A");
  assert.equal(resolve(categories, memory, "third"), "A");
  assert.equal(resolve(categories, memory), "A");
});
