"use client";

import { useEffect, useState } from "react";
import { checkApiReachable } from "@/offline/connectivity";
import { syncQueueSummary, type SyncQueueIssue } from "@/offline/outbox";

export type SyncStatusView = {
  browserOnline: boolean;
  apiReachable: boolean;
  pending: number;
  syncing: number;
  failed: number;
  conflict: number;
  totalWaiting: number;
  issues: SyncQueueIssue[];
  syncInProgress: boolean;
};

const initialStatus: SyncStatusView = {
  browserOnline: true,
  apiReachable: true,
  pending: 0,
  syncing: 0,
  failed: 0,
  conflict: 0,
  totalWaiting: 0,
  issues: [],
  syncInProgress: false
};

export function useSyncStatus(tenantId?: string, token?: string) {
  const [status, setStatus] = useState<SyncStatusView>(initialStatus);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const [connectivity, queue] = await Promise.all([
        checkApiReachable(token),
        syncQueueSummary(tenantId)
      ]);
      if (cancelled) return;
      setStatus({
        browserOnline: connectivity.browserOnline,
        apiReachable: connectivity.apiReachable,
        ...queue
      });
    }

    void refresh();
    const interval = window.setInterval(refresh, 15_000);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("restaurant-sync-status-changed", refresh);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("restaurant-sync-status-changed", refresh);
    };
  }, [tenantId, token]);

  return status;
}
