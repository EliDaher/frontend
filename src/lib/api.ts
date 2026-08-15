import type { ApiEnvelope, MenuPayload, Restaurant } from "@/types/menu";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  // "https://restaurantsserver.onrender.com";
  "http://localhost:4000";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "حدث خطأ أثناء الاتصال بالخادم");
  }

  return (payload as ApiEnvelope<T>).data;
}

export function getRestaurant(slug: string) {
  return fetchJson<Restaurant>(`/api/restaurants/${slug}`, {
    cache: "no-store"
  });
}

export function getMenu(slug: string) {
  return fetchJson<MenuPayload>(`/api/restaurants/${slug}/menu`, {
    cache: "no-store"
  });
}

export function getRestaurantByDomain(host: string) {
  return fetchJson<{ restaurant: Restaurant; menu: MenuPayload }>(`/api/restaurants/by-domain?host=${encodeURIComponent(host)}`, {
    cache: "no-store"
  });
}

export function adminRequest<T>(path: string, token?: string, init?: RequestInit) {
  return fetchJson<T>(path, {
    ...init,
    cache: "no-store",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  });
}

