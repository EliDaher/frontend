"use client";

import { useEffect } from "react";

const shellCachePrefix = "restaurant-ops-shell-";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // A worker installed by a previous production run can otherwise keep
      // serving old, non-hashed development bundles on localhost.
      void disableDevelopmentWorker().catch(() => undefined);
      return;
    }

    navigator.serviceWorker.register("/offline-sw.js", { updateViaCache: "none" }).catch(() => {
      // Offline support should never block rendering the app.
    });
  }, []);

  return null;
}

async function disableDevelopmentWorker() {
  const isOurWorker = (worker: ServiceWorker | null) => worker && new URL(worker.scriptURL).pathname === "/offline-sw.js";
  const hadController = Boolean(isOurWorker(navigator.serviceWorker.controller));
  const registrations = await navigator.serviceWorker.getRegistrations();
  const removed = await Promise.all(registrations.filter(registration =>
    isOurWorker(registration.active) || isOurWorker(registration.waiting) || isOurWorker(registration.installing)
  ).map(registration => registration.unregister()));

  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(shellCachePrefix)).map(name => caches.delete(name)));
  }
  // Only cached interface assets are removed; IndexedDB and local storage,
  // including pending orders and the login session, are left intact.
  if (hadController && removed.some(Boolean)) window.location.reload();
}
