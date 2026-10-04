import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pendingInventoryEffectsForOrders, shouldApplyServerInventoryRecordToLocal, shouldTombstoneMissingServerInventoryRecord } from "../src/offline/inventory-cache-rules.ts";

describe("inventory cache hydration rules", () => {
  it("applies server inventory records when there is no local copy", () => {
    assert.equal(shouldApplyServerInventoryRecordToLocal(undefined, "restaurant-a"), true);
  });

  it("applies server refresh to clean local inventory records", () => {
    assert.equal(shouldApplyServerInventoryRecordToLocal({ restaurantId: "restaurant-a", syncStatus: "synced" }, "restaurant-a"), true);
  });

  it("does not replace inventory data from another restaurant", () => {
    assert.equal(shouldApplyServerInventoryRecordToLocal({ restaurantId: "restaurant-b", syncStatus: "synced" }, "restaurant-a"), false);
  });

  it("does not overwrite conflicted local inventory data", () => {
    assert.equal(shouldApplyServerInventoryRecordToLocal({ restaurantId: "restaurant-a", syncStatus: "conflict" }, "restaurant-a"), false);
  });

  it("does not overwrite unresolved local inventory state", () => {
    assert.equal(shouldApplyServerInventoryRecordToLocal({ restaurantId: "restaurant-a", syncStatus: "pending" }, "restaurant-a"), false);
    assert.equal(shouldApplyServerInventoryRecordToLocal({ restaurantId: "restaurant-a", syncStatus: "syncing" }, "restaurant-a"), false);
    assert.equal(shouldApplyServerInventoryRecordToLocal({ restaurantId: "restaurant-a", syncStatus: "failed" }, "restaurant-a"), false);
  });

  it("tombstones clean cached rows missing from a full server refresh", () => {
    assert.equal(shouldTombstoneMissingServerInventoryRecord({ restaurantId: "restaurant-a", syncStatus: "synced" }, "restaurant-a"), true);
  });

  it("does not tombstone unresolved or cross-restaurant cached rows", () => {
    assert.equal(shouldTombstoneMissingServerInventoryRecord({ restaurantId: "restaurant-a", syncStatus: "pending" }, "restaurant-a"), false);
    assert.equal(shouldTombstoneMissingServerInventoryRecord({ restaurantId: "restaurant-b", syncStatus: "synced" }, "restaurant-a"), false);
  });
});

describe("pending inventory effects", () => {
  it("derives pending deductions from completed local orders and cached recipes", () => {
    const effects = pendingInventoryEffectsForOrders({
      orders: [
        {
          id: "order-1",
          items: [
            { menuItemId: "burger", quantity: 2 },
            { menuItemId: "fries", quantity: 3 }
          ]
        }
      ],
      recipes: [
        { menuItemId: "burger", inventoryItemId: "beef", quantity: 0.2 },
        { menuItemId: "burger", inventoryItemId: "bun", quantity: 1 },
        { menuItemId: "fries", inventoryItemId: "potato", quantity: 0.15 }
      ],
      operations: [
        { entityType: "order", entityId: "order-1", action: "completeOrder", status: "pending" }
      ]
    });

    assert.equal(effects.pendingCompletionCount, 1);
    assert.equal(effects.unknownOrderCount, 0);
    assert.equal(effects.unknownRecipeCount, 0);
    assert.deepEqual(effects.byInventoryItemId, {
      beef: 0.4,
      bun: 2,
      potato: 0.44999999999999996
    });
  });

  it("ignores synced completion operations", () => {
    const effects = pendingInventoryEffectsForOrders({
      orders: [{ id: "order-1", items: [{ menuItemId: "burger", quantity: 2 }] }],
      recipes: [{ menuItemId: "burger", inventoryItemId: "beef", quantity: 0.2 }],
      operations: [{ entityType: "order", entityId: "order-1", action: "completeOrder", status: "synced" }]
    });

    assert.equal(effects.pendingCompletionCount, 0);
    assert.deepEqual(effects.byInventoryItemId, {});
  });

  it("reports unknown pending effects when local order or recipe details are missing", () => {
    const effects = pendingInventoryEffectsForOrders({
      orders: [{ id: "order-1", items: [{ menuItemId: "uncached", quantity: 1 }] }],
      recipes: [],
      operations: [
        { entityType: "order", entityId: "order-1", action: "completeOrder", status: "failed" },
        { entityType: "order", entityId: "order-2", action: "completeOrder", status: "pending" }
      ]
    });

    assert.equal(effects.pendingCompletionCount, 2);
    assert.equal(effects.unknownOrderCount, 1);
    assert.equal(effects.unknownRecipeCount, 1);
    assert.deepEqual(effects.byInventoryItemId, {});
  });
});
