import { io } from "socket.io-client";
import { API_BASE_URL } from "@/lib/api";

export function connectRealtime(token: string, tenantId: string, reconcile: () => Promise<unknown>) {
  const socket = io(API_BASE_URL, { auth: { token }, reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 30000 });
  let stopped = false, dirty = false, running = false, cursor = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const drain = async () => {
    if (stopped || running) return;
    running = true;
    try {
      do { dirty = false; await reconcile(); } while (dirty && !stopped);
    } catch { /* The durable queue and fallback reconciliation retain work. */ }
    finally { running = false; }
  };
  const request = () => {
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void drain(); }, 200);
  };
  socket.on("connect", () => { cursor = -1; request(); });
  socket.on("sync:changed", (event: { tenantId: string; cursor: number; changes?: Array<{ entityType: string; entityId: string }> }) => {
    if (event.tenantId !== tenantId || !Number.isSafeInteger(event.cursor) || event.cursor <= cursor) return;
    cursor = event.cursor;
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("restaurant-remote-changes", { detail: event }));
    request();
  });
  // Covers lost notifications and deployments without a shared Socket.IO adapter.
  const fallback = setInterval(request, 120000);
  return () => { stopped = true; clearInterval(fallback); if (timer) clearTimeout(timer); socket.disconnect(); };
}
