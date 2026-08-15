"use client";

import Link from "next/link";
import { BarChart3, Boxes, CreditCard, FileText, RefreshCw, ReceiptText, Table2, UtensilsCrossed } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { OwnerAppShell, MetricCard, ProPanel } from "@/components/owner/dashboard/OwnerAppShell";
import { adminRequest } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { moduleLabels, normalizeModules } from "@/lib/modules";
import type { OpsSummary, Restaurant } from "@/types/menu";

const cards = [
  { module: "orders", title: "الطلبات", icon: UtensilsCrossed, href: "/owner/operations/orders", text: "إنشاء ومتابعة وإغلاق الطلبات." },
  { module: "tables", title: "الطاولات", icon: Table2, href: "/owner/operations/tables", text: "إدارة الصالات وحالات الطاولات." },
  { module: "pos", title: "نقطة البيع", icon: CreditCard, href: "/owner/operations/orders", text: "تدفق بيع سريع مبني على الطلبات." },
  { module: "inventory", title: "المخزون", icon: Boxes, href: "/owner/operations/inventory", text: "المواد والحركات والوصفات." },
  { module: "accounting", title: "الفواتير", icon: FileText, href: "/owner/operations/invoices", text: "فواتير البيع والشراء." },
  { module: "expenses", title: "المصروفات", icon: ReceiptText, href: "/owner/operations/expenses", text: "مصروفات يومية وفلاتر تاريخية." },
  { module: "accounting", title: "المحاسبة", icon: BarChart3, href: "/owner/operations/accounting", text: "حسابات وقيود وصندوق." }
] as const;

export function OwnerOperationsPage() {
  const [token, setToken] = useState("");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [summary, setSummary] = useState<OpsSummary | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

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
    void load(storedToken);
  }, []);

  async function load(authToken = token) {
    setBusy(true);
    setMessage("");
    try {
      const nextRestaurant = await adminRequest<Restaurant>("/api/owner/restaurant", authToken);
      setRestaurant(nextRestaurant);
      const enabledModules = normalizeModules(nextRestaurant.plan, nextRestaurant.modules);
      if (enabledModules.reports) {
        setSummary(await adminRequest<OpsSummary>("/api/owner/ops/reports/summary", authToken));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحميل وحدات الإدارة.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OwnerAppShell restaurant={restaurant} modules={modules} title="مركز العمليات" eyebrow="وحدات إدارة المطعم" busy={busy} onRefresh={() => void load()}>
      <div className="mx-auto grid max-w-7xl gap-4">
        {message ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-black text-red-800">{message}</p> : null}
        {!restaurant || !modules ? (
          <div className="grid min-h-[320px] place-items-center rounded-lg border border-slate-200 bg-white">
            <RefreshCw className="h-6 w-6 animate-spin text-amber-600" />
          </div>
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-4">
              <MetricCard label="المبيعات" value={formatMoney(summary?.totals.sales ?? 0, restaurant.currency)} tone="green" />
              <MetricCard label="صافي تقديري" value={formatMoney(summary?.totals.net ?? 0, restaurant.currency)} />
              <MetricCard label="طلبات مفتوحة" value={String(summary?.orders.open ?? 0)} tone="amber" />
              <MetricCard label="مخزون منخفض" value={String(summary?.inventory.lowStockCount ?? 0)} tone={(summary?.inventory.lowStockCount ?? 0) > 0 ? "red" : "green"} />
            </section>

            <ProPanel title="الوحدات">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {cards.map((card) => {
                  const Icon = card.icon;
                  const enabled = modules[card.module];
                  return (
                    <Link key={`${card.module}-${card.href}`} href={enabled ? card.href : "/owner/operations"} className={`rounded-lg border p-4 transition hover:-translate-y-0.5 ${enabled ? "border-slate-200 bg-white shadow-sm" : "border-slate-200 bg-slate-50 opacity-70"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-md bg-slate-950 text-white">
                          <Icon className="h-5 w-5" />
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{enabled ? "مفعلة" : "مقفلة"}</span>
                      </div>
                      <h2 className="mt-3 font-black">{card.title}</h2>
                      <p className="mt-1 text-sm font-bold leading-6 text-slate-500">{enabled ? card.text : `وحدة ${moduleLabels[card.module]} غير مفعلة في هذه الخطة.`}</p>
                    </Link>
                  );
                })}
              </div>
            </ProPanel>
          </>
        )}
      </div>
    </OwnerAppShell>
  );
}
