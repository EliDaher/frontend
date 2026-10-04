export type TokenInspection = {
  present: boolean;
  expired: boolean;
  expiresAt?: string;
};

const expirySkewMs = 30_000;

export function inspectToken(token: string | null | undefined, now = Date.now()): TokenInspection {
  if (!token) return { present: false, expired: false };
  const expiresAtMs = tokenExpirationMs(token);
  if (!expiresAtMs) return { present: true, expired: false };
  return {
    present: true,
    expired: expiresAtMs <= now + expirySkewMs,
    expiresAt: new Date(expiresAtMs).toISOString()
  };
}

export function isTokenUsable(token: string | null | undefined) {
  const inspection = inspectToken(token);
  return inspection.present && !inspection.expired;
}

export function tokenExpirationMs(token: string) {
  try {
    const [, payload] = token.split(".");
    if (!payload) return 0;
    const parsed = JSON.parse(decodeBase64Url(payload)) as { exp?: unknown };
    const exp = Number(parsed.exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  if (typeof globalThis.atob === "function") return globalThis.atob(padded);
  if (typeof Buffer !== "undefined") return Buffer.from(padded, "base64").toString("binary");
  return "";
}
