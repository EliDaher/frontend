import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readRestaurantIdFromToken, restaurantMatchesSession } from "../src/offline/restaurant-session.ts";

function tokenFor(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `header.${encoded}.signature`;
}

describe("restaurant session cache matching", () => {
  it("reads the restaurant id from the session token payload", () => {
    const token = tokenFor({ restaurantId: "restaurant-a" });

    assert.equal(readRestaurantIdFromToken(token), "restaurant-a");
  });

  it("allows a cached restaurant only when it belongs to the current session", () => {
    const token = tokenFor({ restaurantId: "restaurant-a" });

    assert.equal(restaurantMatchesSession(token, { id: "restaurant-a", restaurantId: "restaurant-a" }), true);
  });

  it("rejects cached data for another restaurant", () => {
    const token = tokenFor({ restaurantId: "restaurant-a" });

    assert.equal(restaurantMatchesSession(token, { id: "restaurant-b", restaurantId: "restaurant-b" }), false);
  });

  it("does not allow arbitrary cached fallback when the session has no restaurant id", () => {
    const token = tokenFor({ role: "restaurantOwner" });

    assert.equal(restaurantMatchesSession(token, { id: "restaurant-a", restaurantId: "restaurant-a" }), false);
  });

  it("rejects malformed tokens", () => {
    assert.equal(readRestaurantIdFromToken("not-a-jwt"), "");
    assert.equal(restaurantMatchesSession("not-a-jwt", { id: "restaurant-a" }), false);
  });
});
