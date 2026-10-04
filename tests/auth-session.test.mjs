import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectToken, isTokenUsable, tokenExpirationMs } from "../src/offline/auth-session.ts";

const now = Date.parse("2026-09-25T12:00:00.000Z");

function tokenFor(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `header.${encoded}.signature`;
}

describe("auth session token inspection", () => {
  it("treats a future exp token as usable", () => {
    const token = tokenFor({ exp: Math.floor((now + 60_000) / 1000), restaurantId: "restaurant-a" });
    const realClockToken = tokenFor({ exp: Math.floor((Date.now() + 120_000) / 1000), restaurantId: "restaurant-a" });

    assert.equal(inspectToken(token, now).expired, false);
    assert.equal(isTokenUsable(realClockToken), true);
  });

  it("treats an expired token as not usable", () => {
    const token = tokenFor({ exp: Math.floor((now - 1_000) / 1000) });

    assert.equal(inspectToken(token, now).expired, true);
  });

  it("treats a token expiring inside the safety window as expired", () => {
    const token = tokenFor({ exp: Math.floor((now + 10_000) / 1000) });

    assert.equal(inspectToken(token, now).expired, true);
  });

  it("reports missing tokens without calling them expired", () => {
    assert.deepEqual(inspectToken("", now), { present: false, expired: false });
  });

  it("does not crash on malformed tokens", () => {
    assert.equal(tokenExpirationMs("not-a-token"), 0);
    assert.equal(inspectToken("not-a-token", now).present, true);
  });

  it("allows legacy tokens without exp to reach server verification", () => {
    const token = tokenFor({ restaurantId: "restaurant-a" });

    assert.equal(inspectToken(token, now).expired, false);
  });
});
