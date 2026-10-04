export type SessionRestaurantRecord = {
  id?: string;
  restaurantId?: string;
};

export function readRestaurantIdFromToken(token: string) {
  try {
    const [, payload] = token.split(".");
    if (!payload) return "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const parsed = JSON.parse(decodeBase64(padded)) as { restaurantId?: string };
    return typeof parsed.restaurantId === "string" ? parsed.restaurantId : "";
  } catch {
    return "";
  }
}

export function restaurantMatchesSession(token: string, restaurant: SessionRestaurantRecord | null | undefined) {
  const restaurantId = readRestaurantIdFromToken(token);
  if (!restaurantId || !restaurant) return false;
  return (restaurant.restaurantId || restaurant.id) === restaurantId;
}

function decodeBase64(value: string) {
  if (typeof globalThis.atob === "function") return globalThis.atob(value);
  if (typeof Buffer !== "undefined") return Buffer.from(value, "base64").toString("binary");
  return "";
}
