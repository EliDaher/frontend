import { adminBackgroundRequest } from "@/lib/api";
import type { OpsTable } from "@/types/ops";
import { offlineDb } from "../db";
import { createLocalEntityId, getDeviceId } from "../device";
import { shouldProtectHydratedRecord } from "../hydration";
import { queueOperation } from "../outbox";
import type { LocalTable } from "../schema";
import { startSync } from "../sync-engine";

export type OfflineContext = {
  token: string;
  tenantId: string;
  userId: string;
};

const tableRefreshes = new Map<string, Promise<OpsTable[]>>();

export async function hydrateTables(context: OfflineContext) {
  void refreshTables(context);
  return listLocalTables(context.tenantId);
}

export async function refreshTables(context: OfflineContext) {
  const current = tableRefreshes.get(context.tenantId);
  if (current) return current;

  const refresh = pullTables(context)
    .catch(() => listLocalTables(context.tenantId))
    .finally(() => {
      tableRefreshes.delete(context.tenantId);
    });
  tableRefreshes.set(context.tenantId, refresh);
  return refresh;
}

async function pullTables(context: OfflineContext) {
  try {
    const remoteTables = await adminBackgroundRequest<OpsTable[]>("/api/owner/ops/tables", context.token);
    const now = new Date().toISOString();
    const deviceId = await getDeviceId();
    await offlineDb.transaction("rw", offlineDb.opsTables, offlineDb.syncQueue, offlineDb.syncConflicts, async () => {
      for (const table of remoteTables) {
        const local = await offlineDb.opsTables.get(table.id);
        const protectedLocal = await shouldProtectHydratedRecord({
          tenantId: context.tenantId,
          entityType: "table",
          entityId: table.id,
          local
        });
        if (protectedLocal) continue;

        await offlineDb.opsTables.put({
          ...table,
          restaurantId: context.tenantId,
          deviceId,
          syncStatus: "synced",
          lastSyncedAt: now,
          version: tableVersion(table)
        });
      }
    });
    return listLocalTables(context.tenantId);
  } catch {
    return listLocalTables(context.tenantId);
  }
}

export async function listLocalTables(tenantId: string) {
  const tables = await offlineDb.opsTables
    .where("restaurantId")
    .equals(tenantId)
    .filter((table) => !table.deletedAt)
    .toArray();
  return tables.sort((first, second) => first.name.localeCompare(second.name, "ar"));
}

export async function getLocalTable(tenantId: string, tableId: string) {
  const table = await offlineDb.opsTables.get(tableId);
  return table?.restaurantId === tenantId && !table.deletedAt ? table : null;
}

export async function saveLocalTable(
  context: OfflineContext,
  input: {
    id?: string;
    name: string;
    area: string;
    capacity: number;
    status: OpsTable["status"];
    currentOrderId: string;
    qrCode: string;
  }
) {
  const now = new Date().toISOString();
  const deviceId = await getDeviceId();
  const existing = input.id ? await offlineDb.opsTables.get(input.id) : null;
  const id = existing?.id ?? input.id ?? createLocalEntityId("table");
  const table: LocalTable = {
    id,
    restaurantId: context.tenantId,
    name: input.name,
    area: input.area,
    capacity: input.capacity,
    status: input.status,
    currentOrderId: input.currentOrderId,
    qrCode: input.qrCode,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    version: existing?.version ?? 0,
    syncStatus: "pending",
    deviceId,
    createdById: context.userId
  };

  await offlineDb.transaction("rw", offlineDb.opsTables, offlineDb.syncQueue, offlineDb.deviceState, async () => {
    await offlineDb.opsTables.put(table);
    await queueOperation({
      entityType: "table",
      entityId: id,
      action: existing ? "update" : "create",
      payload: {
        name: table.name,
        area: table.area,
        capacity: table.capacity,
        status: table.status,
        currentOrderId: table.currentOrderId,
        qrCode: table.qrCode
      },
      baseVersion: existing?.version,
      tenantId: context.tenantId,
      userId: context.userId
    });
  });

  void startSync(context.tenantId, context.token);
  return table;
}

export async function deleteLocalTable(context: OfflineContext, tableId: string) {
  const table = await offlineDb.opsTables.get(tableId);
  if (!table || table.restaurantId !== context.tenantId) return;
  const deletedAt = new Date().toISOString();

  await offlineDb.transaction("rw", offlineDb.opsTables, offlineDb.syncQueue, offlineDb.deviceState, async () => {
    await offlineDb.opsTables.put({ ...table, deletedAt, syncStatus: "pending", updatedAt: deletedAt });
    await queueOperation({
      entityType: "table",
      entityId: tableId,
      action: "delete",
      payload: {},
      baseVersion: table.version,
      tenantId: context.tenantId,
      userId: context.userId
    });
  });

  void startSync(context.tenantId, context.token);
}

function tableVersion(table: OpsTable) {
  const value = Date.parse(table.updatedAt ?? table.createdAt ?? "");
  return Number.isFinite(value) ? value : 0;
}
