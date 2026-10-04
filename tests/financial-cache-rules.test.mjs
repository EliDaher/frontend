import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cashMovementAffectsRegisterBalance,
  pendingCashBalanceEffect,
  shouldApplyServerFinancialRecordToLocal,
  shouldTombstoneMissingServerFinancialRecord
} from "../src/offline/financial-cache-rules.ts";

describe("financial cache hydration rules", () => {
  it("applies server financial records when there is no local copy", () => {
    assert.equal(shouldApplyServerFinancialRecordToLocal(undefined, "restaurant-a"), true);
  });

  it("applies server refresh to clean local financial records", () => {
    assert.equal(shouldApplyServerFinancialRecordToLocal({ restaurantId: "restaurant-a", syncStatus: "synced" }, "restaurant-a"), true);
  });

  it("does not overwrite financial records from another restaurant", () => {
    assert.equal(shouldApplyServerFinancialRecordToLocal({ restaurantId: "restaurant-b", syncStatus: "synced" }, "restaurant-a"), false);
  });

  it("does not overwrite unresolved local financial state", () => {
    assert.equal(shouldApplyServerFinancialRecordToLocal({ restaurantId: "restaurant-a", syncStatus: "pending" }, "restaurant-a"), false);
    assert.equal(shouldApplyServerFinancialRecordToLocal({ restaurantId: "restaurant-a", syncStatus: "syncing" }, "restaurant-a"), false);
    assert.equal(shouldApplyServerFinancialRecordToLocal({ restaurantId: "restaurant-a", syncStatus: "failed" }, "restaurant-a"), false);
    assert.equal(shouldApplyServerFinancialRecordToLocal({ restaurantId: "restaurant-a", syncStatus: "conflict" }, "restaurant-a"), false);
  });

  it("tombstones clean cached rows missing from a full server refresh", () => {
    assert.equal(shouldTombstoneMissingServerFinancialRecord({ restaurantId: "restaurant-a", syncStatus: "synced" }, "restaurant-a"), true);
  });

  it("does not tombstone unresolved or cross-restaurant financial rows", () => {
    assert.equal(shouldTombstoneMissingServerFinancialRecord({ restaurantId: "restaurant-a", syncStatus: "pending" }, "restaurant-a"), false);
    assert.equal(shouldTombstoneMissingServerFinancialRecord({ restaurantId: "restaurant-b", syncStatus: "synced" }, "restaurant-a"), false);
  });
});

describe("pending cash balance effect", () => {
  it("sums only unsynced cash movements", () => {
    assert.equal(pendingCashBalanceEffect([
      { type: "IN", amount: 100, referenceType: "ORDER", syncStatus: "pending" },
      { type: "OUT", amount: 35, referenceType: "ORDER_CANCEL", syncStatus: "syncing" },
      { type: "IN", amount: 50, referenceType: "ORDER", syncStatus: "synced" },
      { type: "OUT", amount: 10, referenceType: "ORDER_CANCEL" }
    ]), 65);
  });

  it("returns zero when all cash movements are confirmed", () => {
    assert.equal(pendingCashBalanceEffect([
      { type: "IN", amount: 100, referenceType: "ORDER", syncStatus: "synced" },
      { type: "OUT", amount: 25, referenceType: "ORDER_CANCEL", syncStatus: "synced" }
    ]), 0);
  });

  it("does not count pending manual cash movements toward register balance", () => {
    assert.equal(cashMovementAffectsRegisterBalance({ referenceType: "MANUAL" }), false);
    assert.equal(cashMovementAffectsRegisterBalance({ referenceType: "ORDER" }), true);
    assert.equal(pendingCashBalanceEffect([
      { type: "IN", amount: 100, referenceType: "MANUAL", syncStatus: "pending" },
      { type: "IN", amount: 40, referenceType: "ORDER", syncStatus: "pending" },
      { type: "OUT", amount: 15, referenceType: "ORDER_CANCEL", syncStatus: "failed" }
    ]), 25);
  });
});
