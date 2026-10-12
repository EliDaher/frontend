import { adminRequest } from "./api";
import { requireTableAdministrationOnline, saveConfirmedTable, tableAdministrationPayload } from "./table-number";
import { offlineDb } from "@/offline/db";
import { getDeviceId } from "@/offline/device";
import { shouldProtectHydratedRecord } from "@/offline/hydration";
import type { OfflineContext } from "@/offline/repositories/tables";
import type { OpsTable } from "@/types/ops";

type TableInput = Omit<OpsTable, "id" | "createdAt" | "updatedAt"> & { id?: string };

// Administration requires server confirmation. Cached reads and queued operations
// already created by older clients continue through the existing sync architecture.
export async function saveTableOnline(context: OfflineContext, input: TableInput) {
  requireTableAdministrationOnline(typeof navigator === "undefined" || navigator.onLine);
  if (input.id) {
    const local = await offlineDb.opsTables.get(input.id);
    if (local && local.restaurantId !== context.tenantId) throw new Error("الطاولة لا تتبع المطعم الحالي.");
    if (await shouldProtectHydratedRecord({ tenantId: context.tenantId, entityType: "table", entityId: input.id, local })) {
      throw new Error("للطاولة تغييرات محلية بانتظار المزامنة أو المراجعة. أكملها قبل تعديل الطاولة على الخادم.");
    }
  }
  const { id: editingId, ...fields } = input;
  const payload = tableAdministrationPayload(fields, Boolean(editingId));
  const basePath = "/api/owner/ops/tables";
  return saveConfirmedTable(
    () => adminRequest<{ id?: string; ok?: boolean }>(editingId ? `${basePath}/${editingId}` : basePath, context.token, {
      method: editingId ? "PATCH" : "POST", body: JSON.stringify(payload)
    }),
    async (id) => {
      const table = await adminRequest<OpsTable & { version?: number }>(`${basePath}/${id}`, context.token);
      const deviceId = await getDeviceId();
      return offlineDb.transaction("rw", offlineDb.opsTables, offlineDb.syncQueue, offlineDb.syncConflicts, offlineDb.orders, async () => {
        const local = await offlineDb.opsTables.get(id);
        if (await shouldProtectHydratedRecord({ tenantId: context.tenantId, entityType: "table", entityId: id, local })) return false;
        if (local?.currentOrderId) {
          const localOrder = await offlineDb.orders.get(local.currentOrderId);
          if (await shouldProtectHydratedRecord({ tenantId: context.tenantId, entityType: "order", entityId: local.currentOrderId, local: localOrder })) return false;
        }
        await offlineDb.opsTables.put({
          ...table, restaurantId: context.tenantId, deviceId, syncStatus: "synced", lastSyncedAt: new Date().toISOString(),
          version: table.version ?? (Date.parse(table.updatedAt ?? table.createdAt ?? "") || 0)
        });
        return true;
      });
    },
    editingId
  );
}
