import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createActionGuard } from "../src/offline/action-guard.ts";

describe("local action guard", () => {
  it("runs only one in-flight action at a time", async () => {
    const guard = createActionGuard();
    let release;
    let calls = 0;
    const first = guard.run(async () => {
      calls += 1;
      await new Promise((resolve) => {
        release = resolve;
      });
    });
    const second = guard.run(async () => {
      calls += 1;
    });

    assert.equal(await second, false);
    assert.equal(calls, 1);
    release();
    assert.equal(await first, true);
  });

  it("releases the lock after a failing action", async () => {
    const guard = createActionGuard();

    await assert.rejects(
      guard.run(async () => {
        throw new Error("boom");
      }),
      /boom/
    );

    assert.equal(guard.busy, false);
    assert.equal(await guard.run(async () => undefined), true);
  });
});
