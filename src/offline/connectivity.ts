import { API_BASE_URL } from "@/lib/api";
import { inspectToken } from "./auth-session";

export type ConnectivityState = {
  browserOnline: boolean;
  apiReachable: boolean;
  authRequired: boolean;
  checkedAt: string;
};

const healthTimeoutMs = 5_000;

async function probeApi(token?: string): Promise<ConnectivityState> {
  const browserOnline = typeof navigator === "undefined" ? true : navigator.onLine;
  const checkedAt = new Date().toISOString();
  if (!browserOnline) {
    return {
      browserOnline,
      apiReachable: false,
      authRequired: false,
      checkedAt
    };
  }

  const tokenInspection = inspectToken(token);
  if (!tokenInspection.present) {
    return {
      browserOnline,
      apiReachable: true,
      authRequired: true,
      checkedAt
    };
  }

  if (tokenInspection.present && tokenInspection.expired) {
    return {
      browserOnline,
      apiReachable: true,
      authRequired: true,
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
      apiReachable: response.ok || response.status === 401,
      authRequired: response.status === 401,
      checkedAt
    };
  } catch {
    return {
      browserOnline,
      apiReachable: false,
      authRequired: false,
      checkedAt
    };
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

let probe: { token?: string; online: boolean; expires: number; promise: Promise<ConnectivityState> } | undefined;
export function checkApiReachable(token?: string): Promise<ConnectivityState> {
  const online = typeof navigator === "undefined" || navigator.onLine;
  if (probe && probe.token === token && probe.online === online && probe.expires > Date.now()) return probe.promise;
  const promise = probeApi(token);
  probe = { token, online, expires: Date.now() + 15_000, promise };
  return promise;
}
