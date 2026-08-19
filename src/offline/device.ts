import { offlineDb } from "./db";

function createUuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `uuid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export async function getDeviceId() {
  const now = new Date().toISOString();
  const existing = await offlineDb.deviceState.get("current");
  if (existing) {
    await offlineDb.deviceState.put({ ...existing, lastSeenAt: now });
    return existing.deviceId;
  }

  const deviceId = createUuid();
  await offlineDb.deviceState.put({
    key: "current",
    deviceId,
    createdAt: now,
    lastSeenAt: now
  });
  return deviceId;
}

export function createOperationId() {
  return createUuid();
}

export function createLocalEntityId(prefix = "local") {
  return `${prefix}_${createUuid()}`;
}
