import assert from "node:assert/strict";
import { test } from "node:test";
import { adminRequest } from "../src/lib/api.ts";

test("request deadline includes a stalled response body", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(globalThis, "fetch", async (_url, init) => ({
    ok: true,
    json: () => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }))
  }));
  const request = assert.rejects(adminRequest("/test", "token"), /انتهت مهلة/);
  await Promise.resolve(); await Promise.resolve();
  t.mock.timers.tick(20000);
  await request;
});
test("a malformed successful response is never treated as cloud confirmation", async t => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => ({}) }));
  await assert.rejects(adminRequest("/test", "token"), /Missing server confirmation/);
});
