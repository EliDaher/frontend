import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidPricedLine, withLineTotal, withQuantity, withUnitPrice } from "../src/components/owner/ops/order-line-pricing.ts";

const line = { quantity: 3, unitPrice: 30, total: 90 };

describe("owner order line pricing", () => {
  it("recalculates the line total when unit price changes", () => {
    assert.deepEqual(withUnitPrice(line, 40), { quantity: 3, unitPrice: 40, total: 120 });
  });

  it("keeps an exact edited total and derives a fractional unit price", () => {
    const result = withLineTotal(line, 100);
    assert.equal(result.total, 100);
    assert.equal(result.unitPrice, 100 / 3);
  });

  it("recalculates total from the current unit price when quantity changes", () => {
    assert.deepEqual(withQuantity(line, 4), { quantity: 4, unitPrice: 30, total: 120 });
  });

  it("accepts zero prices but rejects non-finite and negative values", () => {
    assert.equal(isValidPricedLine({ quantity: 1, unitPrice: 0, total: 0 }), true);
    assert.equal(isValidPricedLine({ quantity: 1, unitPrice: -1, total: -1 }), false);
    assert.equal(isValidPricedLine({ quantity: 1, unitPrice: Number.NaN, total: 1 }), false);
  });
});
