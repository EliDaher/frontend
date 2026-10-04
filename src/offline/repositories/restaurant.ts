import { adminRequest } from "@/lib/api";
import type { Restaurant } from "@/types/menu";
import { offlineDb } from "../db";
import { readRestaurantIdFromToken, restaurantMatchesSession } from "../restaurant-session";

type RestaurantLoadResult = {
  restaurant: Restaurant;
  offline: boolean;
  refresh?: Promise<Restaurant | null>;
};

const restaurantRefreshes = new Map<string, Promise<Restaurant | null>>();

export async function loadRestaurantWithOfflineFallback(token: string): Promise<RestaurantLoadResult> {
  const restaurantId = readRestaurantIdFromToken(token);
  if (!restaurantId) throw new Error("تعذر تحديد المطعم الحالي من الجلسة.");

  const refresh = refreshRestaurantForSession(token, restaurantId);
  const cached = await offlineDb.restaurants.get(restaurantId);
  if (cached && restaurantMatchesSession(token, cached)) {
    return { restaurant: cached, offline: true, refresh };
  }

  const restaurant = await refresh;
  if (!restaurant) throw new Error("تعذر تحميل بيانات المطعم.");
  return { restaurant, offline: false };
}

export async function cacheRestaurant(restaurant: Restaurant) {
  await offlineDb.restaurants.put({
    ...restaurant,
    restaurantId: restaurant.id,
    syncStatus: "synced",
    lastSyncedAt: new Date().toISOString()
  });
}

function refreshRestaurantForSession(token: string, restaurantId: string) {
  const cacheKey = `${restaurantId}:${token}`;
  const current = restaurantRefreshes.get(cacheKey);
  if (current) return current;

  const refresh = requestRestaurantForSession(token, restaurantId)
    .catch(() => null)
    .finally(() => {
      restaurantRefreshes.delete(cacheKey);
    });
  restaurantRefreshes.set(cacheKey, refresh);
  return refresh;
}

async function requestRestaurantForSession(token: string, restaurantId: string) {
  const restaurant = await adminRequest<Restaurant>("/api/owner/restaurant", token);
  if (restaurant.id !== restaurantId) {
    throw new Error("بيانات الجلسة لا تطابق المطعم الحالي.");
  }
  await cacheRestaurant(restaurant);
  return restaurant;
}
