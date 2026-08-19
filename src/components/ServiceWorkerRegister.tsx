"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker.register("/offline-sw.js").catch(() => {
      // Offline support should never block rendering the app.
    });
  }, []);

  return null;
}
