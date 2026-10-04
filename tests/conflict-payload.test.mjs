import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { localConflictPayload } from "../src/offline/conflict-payload.ts";

describe("local conflict payload snapshots", () => {
  it("preserves operation intent and version context for later resolution", () => {
    const snapshot = localConflictPayload({
      action: "update",
      payload: { notes: "Less salt", tableId: "table-2" },
      baseVersion: 5,
      dependencyIds: ["op-create", "op-items"],
      createdAt: "2026-09-26T08:00:00.000Z"
    });

    assert.deepEqual(snapshot, {
      action: "update",
      payload: { notes: "Less salt", tableId: "table-2" },
      baseVersion: 5,
      dependencyIds: ["op-create", "op-items"],
      clientCreatedAt: "2026-09-26T08:00:00.000Z"
    });
  });

  it("copies dependency ids instead of sharing the mutable queue array", () => {
    const dependencyIds = ["op-a"];
    const snapshot = localConflictPayload({
      action: "completeOrder",
      payload: { paidAmount: 20 },
      baseVersion: 6,
      dependencyIds,
      createdAt: "2026-09-26T08:05:00.000Z"
    });

    dependencyIds.push("op-b");

    assert.deepEqual(snapshot.dependencyIds, ["op-a"]);
  });
});
