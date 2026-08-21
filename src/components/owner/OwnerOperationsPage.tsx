"use client";

import Link from "next/link";
import { BarChart3, Boxes, CreditCard, FileText, RefreshCw, ReceiptText, Table2, UtensilsCrossed } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { OwnerAppShell } from "@/components/owner/dashboard/OwnerAppShell";
import { AppBadge, AppPageHeader, AppSurface, cn } from "@/components/shared";
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
        <AppPageHeader
          title="مركز العمليات"
          description="الوصول السريع لوحدات التشغيل المتاحة حسب خطة المطعم."
          secondaryActions={modules ? <AppBadge variant="neutral">{Object.values(modules).filter(Boolean).length} وحدة متاحة</AppBadge> : null}
        />
        {message ? <p className="rounded-app-md border border-app-danger-soft bg-app-danger-soft p-3 text-app-body font-semibold text-app-danger">{message}</p> : null}
        {!restaurant || !modules ? (
          <div className="grid min-h-[320px] place-items-center rounded-app-lg border border-app-border bg-app-surface">
            <RefreshCw className="h-6 w-6 animate-spin text-app-primary" />
          </div>
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-4">
              <OperationsMetric label="المبيعات" value={formatMoney(summary?.totals.sales ?? 0, restaurant.currency)} tone="success" />
              <OperationsMetric label="صافي تقديري" value={formatMoney(summary?.totals.net ?? 0, restaurant.currency)} />
              <OperationsMetric label="طلبات مفتوحة" value={String(summary?.orders.open ?? 0)} tone="warning" />
              <OperationsMetric label="مخزون منخفض" value={String(summary?.inventory.lowStockCount ?? 0)} tone={(summary?.inventory.lowStockCount ?? 0) > 0 ? "danger" : "success"} />
            </section>

            <AppSurface title="الوحدات">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {cards.map((card) => {
                  const Icon = card.icon;
                  const enabled = modules[card.module];
                  return (
                    <Link
                      key={`${card.module}-${card.href}`}
                      href={enabled ? card.href : "/owner/operations"}
                      className={cn(
                        "rounded-app-lg border p-4 transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft",
                        enabled
                          ? "border-app-border bg-app-surface hover:border-app-primary hover:bg-app-primary-soft"
                          : "border-app-border bg-app-surface-muted opacity-75"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className={cn("grid h-10 w-10 place-items-center rounded-app-md border", enabled ? "border-app-primary-soft bg-app-primary-soft text-app-primary" : "border-app-border bg-app-surface text-app-muted")}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <AppBadge variant={enabled ? "success" : "neutral"}>{enabled ? "مفعلة" : "مقفلة"}</AppBadge>
                      </div>
                      <h2 className="mt-3 text-app-panel-title font-semibold text-app-ink">{card.title}</h2>
                      <p className="mt-1 text-app-body text-app-muted">{enabled ? card.text : `وحدة ${moduleLabels[card.module]} غير مفعلة في هذه الخطة.`}</p>
                    </Link>
                  );
                })}
              </div>
            </AppSurface>
          </>
        )}
      </div>
    </OwnerAppShell>
  );
}

function OperationsMetric({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const styles = {
    neutral: "border-app-border bg-app-surface text-app-ink",
    success: "border-app-success-soft bg-app-success-soft text-app-success",
    warning: "border-app-warning-soft bg-app-warning-soft text-app-warning",
    danger: "border-app-danger-soft bg-app-danger-soft text-app-danger"
  };

  return (
    <div className={cn("rounded-app-lg border p-4", styles[tone])}>
      <p className="text-app-helper font-semibold opacity-75">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}
