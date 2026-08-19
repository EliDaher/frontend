import { API_BASE_URL } from "@/lib/api";

export type ConnectivityState = {
  browserOnline: boolean;
  apiReachable: boolean;
  checkedAt: string;
};

const healthTimeoutMs = 5_000;

export async function checkApiReachable(token?: string): Promise<ConnectivityState> {
  const browserOnline = typeof navigator === "undefined" ? true : navigator.onLine;
  const checkedAt = new Date().toISOString();
  if (!browserOnline) {
    return {
      browserOnline,
      apiReachable: false,
      checkedAt
    };
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), healthTimeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}/api/owner/sync/health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });

    return {
      browserOnline,
      apiReachable: response.ok,
      checkedAt
    };
  } catch {
    return {
      browserOnline,
      apiReachable: false,
      checkedAt
    };
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
