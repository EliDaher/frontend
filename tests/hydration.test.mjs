import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasProtectedSyncStatus, shouldProtectHydratedRecordSnapshot } from "../src/offline/hydration-rules.ts";

const tenantId = "restaurant-a";

describe("safe hydration protection", () => {
  it("allows a clean local order to receive a remote update", () => {
    assert.equal(shouldProtectHydratedRecordSnapshot({
      tenantId,
      local: { restaurantId: tenantId, syncStatus: "synced" }
    }), false);
  });

  it("protects pending local orders from stale remote data", () => {
    assert.equal(shouldProtectHydratedRecordSnapshot({
      tenantId,
      local: { restaurantId: tenantId, syncStatus: "pending" }
    }), true);
  });

  it("protects syncing local orders", () => {
    assert.equal(shouldProtectHydratedRecordSnapshot({
      tenantId,
      local: { restaurantId: tenantId, syncStatus: "syncing" }
    }), true);
  });

  it("protects conflicted local orders", () => {
    assert.equal(shouldProtectHydratedRecordSnapshot({
      tenantId,
      local: { restaurantId: tenantId, syncStatus: "conflict" }
    }), true);
  });

  it("protects failed local records while the unresolved operation remains", () => {
    assert.equal(shouldProtectHydratedRecordSnapshot({
      tenantId,
      local: { restaurantId: tenantId, syncStatus: "failed" }
    }), true);
  });

  it("protects pending local tables", () => {
    assert.equal(shouldProtectHydratedRecordSnapshot({
      tenantId,
      local: { restaurantId: tenantId, syncStatus: "pending" }
    }), true);
  });

  it("allows clean local tables to receive remote updates", () => {
    assert.equal(shouldProtectHydratedRecordSnapshot({
      tenantId,
      local: { restaurantId: tenantId, syncStatus: "synced" }
    }), false);
  });

  it("protects a clean record when a concurrent local write queued an operation", () => {
    assert.equal(shouldProtectHydratedRecordSnapshot({
      tenantId,
      local: { restaurantId: tenantId, syncStatus: "synced" },
      hasUnresolvedOperation: true
    }), true);
  });

  it("protects remote data arriving after an offline modification", () => {
    assert.equal(shouldProtectHydratedRecordSnapshot({
      tenantId,
      local: { restaurantId: tenantId, syncStatus: "pending" },
      hasUnresolvedOperation: true
    }), true);
  });

  it("allows repeated hydration for clean records", () => {
    assert.equal(shouldProtectHydratedRecordSnapshot({
      tenantId,
      local: { restaurantId: tenantId, syncStatus: "synced" },
      hasUnresolvedOperation: false,
      hasUnresolvedConflict: false
    }), false);
  });

  it("keeps outbox-backed records protected until the operation is confirmed", () => {
    assert.equal(shouldProtectHydratedRecordSnapshot({
      tenantId,
      local: { restaurantId: tenantId, syncStatus: "synced" },
      hasUnresolvedOperation: true
    }), true);
  });

  it("does not require remote presence to protect a pending local record", () => {
    assert.equal(hasProtectedSyncStatus("pending"), true);
  });

  it("protects records belonging to another restaurant from cross-tenant overwrite", () => {
    assert.equal(shouldProtectHydratedRecordSnapshot({
      tenantId,
      local: { restaurantId: "restaurant-b", syncStatus: "synced" }
    }), true);
  });

  it("protects records with unresolved conflict storage even if the local status is clean", () => {
    assert.equal(shouldProtectHydratedRecordSnapshot({
      tenantId,
      local: { restaurantId: tenantId, syncStatus: "synced" },
      hasUnresolvedConflict: true
    }), true);
  });
});
