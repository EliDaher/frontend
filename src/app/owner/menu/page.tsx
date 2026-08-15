"use client";

import { useEffect, useMemo, useState } from "react";
import { OwnerDashboard } from "@/components/owner/OwnerDashboard";
import { OwnerAppShell } from "@/components/owner/dashboard/OwnerAppShell";
import { adminRequest } from "@/lib/api";
import { normalizeModules } from "@/lib/modules";
import type { Restaurant } from "@/types/menu";

export default function OwnerMenuPage() {
  const [token, setToken] = useState("");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const modules = useMemo(() => {
    return restaurant ? normalizeModules(restaurant.plan, restaurant.modules) : null;
  }, [restaurant]);

  useEffect(() => {
    const storedToken = window.localStorage.getItem("menu-owner-token");
    if (!storedToken) {
      window.location.href = "/owner/login";
      return;
    }

    setToken(storedToken);
    void loadRestaurant(storedToken);
  }, []);

  async function loadRestaurant(authToken = token) {
    if (!authToken) return;
    setBusy(true);
    try {
      setRestaurant(await adminRequest<Restaurant>("/api/owner/restaurant", authToken));
    } finally {
      setBusy(false);
    }
  }

  return (
    <OwnerAppShell
      restaurant={restaurant}
      modules={modules}
      title="المنيو"
      eyebrow="إدارة الأصناف والتصميم"
      busy={busy}
      onRefresh={() => {
        setRefreshKey((current) => current + 1);
        void loadRestaurant();
      }}
    >
      <OwnerDashboard key={refreshKey} embedded />
    </OwnerAppShell>
  );
}
