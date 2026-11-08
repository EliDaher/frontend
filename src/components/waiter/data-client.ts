import type { OrderLine } from "./draft";

export type WaiterSession = {
  token: string;
  cacheSessionId: string;
  user: { id: string; restaurantId: string; name: string };
  restaurantName: string;
};
export type WaiterMenu = {
  items: { id: string; name: string; categoryId: string; isAvailable: boolean; order: number }[];
  categories: { id: string; name: string; order: number }[];
};
export type WaiterState = {
  tables: { id: string; name: string; area: string; status: string; currentOrderId: string }[];
  orders: { id: string; tableId: string; status?: string; items: OrderLine[] }[];
};
export type BatchConfirmation = {
  orderId: string;
  table: WaiterState["tables"][number] | null;
  order: WaiterState["orders"][number] | null;
};
export type MenuCache = {
  get(key: string): Promise<WaiterMenu | undefined>;
  put(key: string, menu: WaiterMenu): Promise<void>;
  remove(key: string): Promise<void>;
  removeOtherSessions(session: WaiterSession): Promise<void>;
};
export const menuCacheKey = (s: WaiterSession) =>
  JSON.stringify([s.user.restaurantId, s.user.id, s.cacheSessionId]);
type MenuLock = <T>(key: string, action: () => Promise<T>) => Promise<T>;
async function withMenuLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  // Two tabs restoring the same authenticated session must not both miss the cache.
  if (typeof navigator !== "undefined" && navigator.locks)
    return await navigator.locks.request(`waiter-menu:${key}`, action);
  return action();
}

// No timers or focus/reconnect data-fetching hooks. Callers explicitly request each read.
export class WaiterDataClient {
  private menus = new Map<string, Promise<WaiterMenu>>();
  private states = new Map<string, Promise<WaiterState>>();
  private invalidated = new Set<string>();
  private cache: MenuCache;
  private request: <T>(path: string, token: string) => Promise<T>;
  private cacheFailure: () => void;
  private withLock: MenuLock;
  constructor(
    cache: MenuCache,
    request: <T>(path: string, token: string) => Promise<T>,
    cacheFailure: () => void = () => {},
    withLock: MenuLock = withMenuLock,
  ) { this.cache = cache; this.request = request; this.cacheFailure = cacheFailure; this.withLock = withLock; }

  menu(s: WaiterSession): Promise<WaiterMenu> {
    const key = menuCacheKey(s);
    const existing = this.menus.get(key);
    if (existing) return existing;
    const pending = this.withLock(key, () => this.loadMenu(s, key)).catch(error => {
      this.menus.delete(key); // An explicit retry is allowed if initialization failed.
      throw error;
    });
    this.menus.set(key, pending);
    return pending;
  }

  private async loadMenu(s: WaiterSession, key: string) {
    let menu: WaiterMenu | undefined;
    try { menu = await this.cache.get(key); } catch { this.cacheFailure(); }
    if (menu) return menu;
    menu = await this.request<WaiterMenu>("/api/waiter/menu", s.token);
    if (!this.invalidated.has(key)) {
      try {
        await this.cache.put(key, menu);
        // Logout can race with the IndexedDB commit; never leave that session's cache behind.
        if (this.invalidated.has(key)) await this.cache.remove(key);
      } catch { this.cacheFailure(); }
    }
    return menu;
  }

  refresh(s: WaiterSession): Promise<WaiterState> {
    const key = menuCacheKey(s);
    const existing = this.states.get(key);
    if (existing) return existing;
    const pending = this.request<WaiterState>("/api/waiter/state", s.token)
      .finally(() => { this.states.delete(key); });
    this.states.set(key, pending);
    return pending;
  }

  async waitForRefresh(s: WaiterSession) {
    // Serialize confirmation application after any earlier snapshot request.
    await this.states.get(menuCacheKey(s))?.catch(() => {});
  }

  async invalidate(s: WaiterSession) {
    const key = menuCacheKey(s);
    this.invalidated.add(key);
    this.menus.delete(key);
    await this.cache.remove(key);
  }
}

export function applyConfirmation(state: WaiterState, batchTableId: string, result: BatchConfirmation): WaiterState {
  return {
    tables: [...state.tables.filter(t => t.id !== batchTableId), ...(result.table ? [result.table] : [])],
    orders: [
      ...state.orders.filter(o => o.id !== result.orderId && o.tableId !== batchTableId),
      ...(result.order ? [result.order] : []),
    ],
  };
}

// Recovery sends only already-persisted batches. It never refreshes menu/tables/orders.
export function bindSubmissionRecovery(target: Pick<Window, "addEventListener" | "removeEventListener">, retry: () => void) {
  target.addEventListener("online", retry);
  return () => target.removeEventListener("online", retry);
}
