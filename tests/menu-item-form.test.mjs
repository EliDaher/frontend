import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateMenuItem, submitMenuItem } from "../src/components/owner/menu-item-form.ts";
const categories = [{ id: "A", name: "A", order: 0, isActive: true }, { id: "B", name: "B", order: 1, isActive: true }];
const empty = { name: "", price: 0, categoryId: "A", order: 0, description: "", image: "", badges: [], isAvailable: true, isFeatured: false };
const valid = { ...empty, name: "  Coffee  ", price: 10, categoryId: "B", order: 5, description: " desc ", image: "https://example.com/image.png" };
const enabled = (draft) => Object.keys(validateMenuItem(draft, categories)).length === 0;
function harness(draft = valid, patch = {}) {
  const state = { draft, open: true, notices: [], items: [], errors: [], requests: 0, saving: false };
  const options = {
    lock: { current: false }, draft, categories, editingId: "", premium: false,
    write: async () => ({ id: `item-${++state.requests}` }),
    onStart: () => { state.saving = true; },
    onSuccess: ({ item, nextDraft, message }) => {
      state.items.push(item);
      if (nextDraft) state.draft = nextDraft;
      else state.open = false;
      state.notices.push(message);
    },
    onError: (error) => state.errors.push(error),
    onFinish: () => { state.saving = false; },
    ...patch
  };
  return { state, options };
}
describe("menu item validation shared by controls and submission", () => {
  for (const [label, draft] of [
    ["initial form", empty], ["name only", { ...empty, name: "Coffee" }],
    ["zero price", { ...valid, price: 0 }], ["whitespace name", { ...valid, name: "   " }],
    ["nonfinite price", { ...valid, price: Infinity }], ["invalid category", { ...valid, categoryId: "other-tenant" }],
    ["negative sort order", { ...valid, order: -1 }], ["fractional sort order", { ...valid, order: 0.5 }]
  ]) it(`${label} disables Save and cannot submit`, async () => {
    assert.equal(enabled(draft), false);
    const { options, state } = harness(draft);
    assert.equal(await submitMenuItem(options), false);
    assert.equal(state.requests, 0);
  });
  it("positive decimal price and valid category enable Save", () => {
    assert.equal(enabled({ ...valid, price: 1.5 }), true);
  });
});
describe("confirmed saves and rapid creation", () => {
  it("double Save starts one request", async () => {
    let finish;
    let requests = 0;
    const { options } = harness(valid, { write: () => { requests++; return new Promise((resolve) => { finish = resolve; }); } });
    const first = submitMenuItem(options);
    assert.equal(await submitMenuItem(options), false);
    assert.equal(requests, 1);
    finish({ id: "one" });
    assert.equal(await first, true);
    assert.equal(options.lock.current, false);
  });
  it("create notifies, stays open, resets fields, preserves category/order and disables Save", async () => {
    const { options, state } = harness();
    await submitMenuItem(options);
    assert.equal(state.open, true);
    assert.deepEqual(state.notices, ["تمت إضافة الصنف بنجاح"]);
    assert.deepEqual(state.draft, { ...empty, categoryId: "B", order: 5 });
    assert.equal(enabled(state.draft), false);
    assert.equal(state.items[0].name, "Coffee");
    assert.equal(state.items[0].image, valid.image);
  });
  it("two consecutive creations produce distinct items, without resubmitting cleared fields", async () => {
    const { options, state } = harness();
    await submitMenuItem(options);
    options.draft = state.draft;
    assert.equal(await submitMenuItem(options), false);
    options.draft = { ...state.draft, name: "Tea", price: 3 };
    await submitMenuItem(options);
    assert.deepEqual(state.items.map((item) => [item.id, item.name]), [["item-1", "Coffee"], ["item-2", "Tea"]]);
  });
  it("failure preserves values and image, shows no success, releases lock and permits retry", async () => {
    const { options, state } = harness(valid, { write: async () => { throw new Error("network"); } });
    assert.equal(await submitMenuItem(options), false);
    assert.equal(state.draft, valid);
    assert.equal(state.open, true);
    assert.equal(state.notices.length, 0);
    assert.equal(state.errors.length, 1);
    assert.equal(state.saving, false);
    assert.equal(options.lock.current, false);
    options.write = async () => ({ id: "retry" });
    assert.equal(await submitMenuItem(options), true);
  });
  it("ambiguous create/update responses preserve data without a toast or retry", async () => {
    for (const editingId of ["", "existing"]) {
      let requests = 0;
      const { options, state } = harness(valid, { editingId, write: async () => { requests++; return {}; } });
      assert.equal(await submitMenuItem(options), false);
      assert.equal(state.draft, valid);
      assert.equal(state.open, true);
      assert.equal(state.notices.length, 0);
      assert.equal(requests, 1);
    }
  });
  it("confirmed edit closes with actual category and leaves new-item preference alone", async () => {
    const { options, state } = harness({ ...valid, categoryId: "A" }, { editingId: "existing", write: async () => ({ ok: true }) });
    await submitMenuItem(options);
    assert.equal(state.open, false);
    assert.equal(state.items[0].categoryId, "A");
    assert.equal(state.items[0].id, "existing");
    assert.deepEqual(state.notices, ["تم تحديث الصنف بنجاح"]);
  });
});
