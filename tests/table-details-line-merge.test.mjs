import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addOrMergeOrderLine,
  canMergeOrderLines,
  lineItemsQuantity,
  lineItemsTotal,
  mergeOrderLines,
  updateLineQuantity
} from "../src/components/owner/ops/table-details-line-merge.ts";

function line(patch = {}) {
  return {
    menuItemId: "item-1",
    name: "عصير منجا",
    quantity: 1,
    unitPrice: 300,
    notes: "",
    modifiers: [],
    ...patch
  };
}

describe("table details add-items merge behavior", () => {
  it("merges the same item added twice into one line with quantity 2", () => {
    const result = addOrMergeOrderLine(addOrMergeOrderLine([], line()), line());
    assert.equal(result.length, 1);
    assert.equal(result[0].quantity, 2);
  });

  it("merges the same item added ten times into one line with quantity 10", () => {
    const result = Array.from({ length: 10 }).reduce((lines) => addOrMergeOrderLine(lines, line()), []);
    assert.equal(result.length, 1);
    assert.equal(result[0].quantity, 10);
  });

  it("merges dialog quantity into an existing compatible order line", () => {
    const result = mergeOrderLines([line({ quantity: 3 })], [line({ quantity: 2 })]);
    assert.equal(result.length, 1);
    assert.equal(result[0].quantity, 5);
  });

  it("does not merge different item ids", () => {
    const result = mergeOrderLines([line({ menuItemId: "item-1" })], [line({ menuItemId: "item-2" })]);
    assert.equal(result.length, 2);
  });

  it("does not merge matching display names with different ids", () => {
    const result = mergeOrderLines([line({ menuItemId: "mango-small" })], [line({ menuItemId: "mango-large" })]);
    assert.equal(result.length, 2);
  });

  it("does not merge incompatible notes or modifiers", () => {
    assert.equal(canMergeOrderLines(line({ notes: "بدون سكر" }), line({ notes: "بدون ثلج" })), false);
    assert.equal(canMergeOrderLines(line({ modifiers: ["hot"] }), line({ modifiers: ["iced"] })), false);
  });

  it("decrements temporary selection quantity", () => {
    const result = updateLineQuantity([line({ quantity: 3 })], 0, 2);
    assert.equal(result[0].quantity, 2);
  });

  it("removes temporary selection when quantity reaches zero", () => {
    const result = updateLineQuantity([line({ quantity: 1 })], 0, 0);
    assert.deepEqual(result, []);
  });

  it("preserves total quantity and amount after dialog commit", () => {
    const result = mergeOrderLines([line({ quantity: 3, unitPrice: 300 })], [line({ quantity: 2, unitPrice: 300 })]);
    assert.equal(lineItemsQuantity(result), 5);
    assert.equal(lineItemsTotal(result), 1500);
  });
});
