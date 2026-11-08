import Dexie, { type Table } from "dexie";
import { menuCacheKey, type MenuCache, type WaiterMenu, type WaiterSession } from "./data-client";

type Entry = { key: string; restaurantId: string; userId: string; sessionId: string; menu: WaiterMenu };
// Separate from the owner's offline database: no shared menu IDs or session tokens.
class WaiterMenuDatabase extends Dexie {
  menus!: Table<Entry, string>;
  constructor() {
    super("restaurant-waiter-menu");
    this.version(1).stores({ menus: "&key, [restaurantId+userId]" });
  }
}
export const waiterMenuDb = new WaiterMenuDatabase();
export const waiterMenuCache: MenuCache = {
  async get(key) { return (await waiterMenuDb.menus.get(key))?.menu; },
  async put(key, menu) {
    const [restaurantId, userId, sessionId] = JSON.parse(key) as string[];
    await waiterMenuDb.menus.put({ key, restaurantId, userId, sessionId, menu });
  },
  async remove(key) { await waiterMenuDb.menus.delete(key); },
  async removeOtherSessions(s: WaiterSession) {
    const key = menuCacheKey(s);
    await waiterMenuDb.menus.where("[restaurantId+userId]")
      .equals([s.user.restaurantId, s.user.id]).filter(entry => entry.key !== key).delete();
  },
};
