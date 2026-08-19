import { adminRequest } from "@/lib/api";
import type { Restaurant } from "@/types/menu";
import { offlineDb } from "../db";

export async function loadRestaurantWithOfflineFallback(token: string) {
  try {
    const restaurant = await adminRequest<Restaurant>("/api/owner/restaurant", token);
    await cacheRestaurant(restaurant);
    return { restaurant, offline: false };
  } catch (error) {
    const cached = await getCachedRestaurantForToken(token);
    if (cached) {
      return { restaurant: cached, offline: true };
    }
    throw error;
  }
}

export async function cacheRestaurant(restaurant: Restaurant) {
  await offlineDb.restaurants.put({
    ...restaurant,
    restaurantId: restaurant.id,
    syncStatus: "synced",
    lastSyncedAt: new Date().toISOString()
  });
}

async function getCachedRestaurantForToken(token: string) {
  const restaurantId = readRestaurantIdFromJwt(token);
  if (restaurantId) {
    const restaurant = await offlineDb.restaurants.get(restaurantId);
    if (restaurant) return restaurant;
  }

  const restaurants = await offlineDb.restaurants.toArray();
  return restaurants[0] ?? null;
}

function readRestaurantIdFromJwt(token: string) {
  try {
    const [, payload] = token.split(".");
    if (!payload) return "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const parsed = JSON.parse(window.atob(padded)) as { restaurantId?: string };
    return parsed.restaurantId ?? "";
  } catch {
    return "";
  }
}
