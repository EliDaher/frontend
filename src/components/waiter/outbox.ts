import Dexie, { type Table } from "dexie";
import type { WaiterBatch } from "./submission";

type Entry = WaiterBatch & { owner: string };
const db = new Dexie("restaurant-waiter-outbox");
db.version(1).stores({ batches: "&operationId, owner, status" });
const batches = db.table("batches") as Table<Entry, string>;
export const waiterOwner = (restaurantId: string, userId: string) => `${restaurantId}:${userId}`;
export async function persistBatch(owner: string, batch: WaiterBatch) {
  await batches.put({ ...batch, owner });
}
export async function restoreBatches(owner: string) {
  return batches.where("owner").equals(owner).toArray();
}
export async function migrateBatches(owner: string, legacy: WaiterBatch[]) {
  await db.transaction("rw", batches, async () => {
    for (const batch of legacy) if (!await batches.get(batch.operationId)) await batches.add({ ...batch, owner });
  });
}
