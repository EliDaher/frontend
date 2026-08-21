"use client";

import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { OwnerAppShell } from "@/components/owner/dashboard/OwnerAppShell";
import { AppBadge, AppEmptyState, AppPageHeader, AppSurface, cn } from "@/components/shared";
import { adminRequest } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { normalizeModules } from "@/lib/modules";
import type { OpsSummary, Restaurant, RestaurantModules } from "@/types/menu";
import type { CashMovement, InventoryItem, Invoice, OpsOrder, OpsTable } from "@/types/ops";

export function OwnerDashboardOverview() {
  const [token, setToken] = useState("");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [modules, setModules] = useState<RestaurantModules | null>(null);
  const [summary, setSummary] = useState<OpsSummary | null>(null);
  const [orders, setOrders] = useState<OpsOrder[]>([]);
  const [tables, setTables] = useState<OpsTable[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

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
      const nextModules = normalizeModules(nextRestaurant.plan, nextRestaurant.modules);
      setRestaurant(nextRestaurant);
      setModules(nextModules);

      const [nextSummary, nextOrders, nextTables, nextInventory, nextInvoices, nextCashMovements] = await Promise.all([
        nextModules.reports ? adminRequest<OpsSummary>("/api/owner/ops/reports/summary", authToken).catch(() => null) : Promise.resolve(null),
        nextModules.orders ? adminRequest<OpsOrder[]>("/api/owner/ops/orders", authToken).catch(() => []) : Promise.resolve([]),
        nextModules.tables ? adminRequest<OpsTable[]>("/api/owner/ops/tables", authToken).catch(() => []) : Promise.resolve([]),
        nextModules.inventory ? adminRequest<InventoryItem[]>("/api/owner/ops/inventory/items", authToken).catch(() => []) : Promise.resolve([]),
        nextModules.accounting ? adminRequest<Invoice[]>("/api/owner/ops/invoices", authToken).catch(() => []) : Promise.resolve([]),
        nextModules.accounting ? adminRequest<CashMovement[]>("/api/owner/ops/cash/movements", authToken).catch(() => []) : Promise.resolve([])
      ]);

      setSummary(nextSummary);
      setOrders(nextOrders);
      setTables(nextTables);
      setInventory(nextInventory);
      setInvoices(nextInvoices);
      setCashMovements(nextCashMovements);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحميل لوحة الإدارة.");
    } finally {
      setBusy(false);
    }
  }

  const activeOrders = orders.filter((order) => !["COMPLETED", "CANCELLED"].includes(order.status)).slice(0, 8);
  const lowStock = inventory.filter((item) => item.currentQuantity <= item.minimumQuantity).slice(0, 8);
  const occupiedTables = tables.filter((table) => table.status === "OCCUPIED").length;
  const unpaidInvoices = invoices.filter((invoice) => invoice.status === "UNPAID" || invoice.status === "PARTIAL");
  const expenseTotal = summary?.totals.expenses ?? 0;

  return (
    <OwnerAppShell restaurant={restaurant} modules={modules} title="لوحة التشغيل" eyebrow="إدارة يومية للمطعم" busy={busy} onRefresh={() => void load()}>
      <div className="mx-auto grid max-w-7xl gap-4">
        <AppPageHeader
          title="نظرة تشغيلية"
          description="مؤشرات مختصرة عن الطلبات والطاولات والمخزون والفواتير."
          secondaryActions={restaurant ? <AppBadge variant="neutral">{restaurant.name}</AppBadge> : null}
        />
        {message ? <p className="rounded-app-md border border-app-danger-soft bg-app-danger-soft p-3 text-app-body font-semibold text-app-danger">{message}</p> : null}
        {!restaurant ? (
          <div className="grid min-h-[320px] place-items-center rounded-app-lg border border-app-border bg-app-surface">
            <RefreshCw className="h-6 w-6 animate-spin text-app-primary" />
          </div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <OverviewMetric label="مبيعات اليوم" value={formatMoney(summary?.totals.sales ?? 0, restaurant.currency)} tone="success" />
              <OverviewMetric label="طلبات مفتوحة" value={String(activeOrders.length)} tone="warning" />
              <OverviewMetric label="طاولات مشغولة" value={`${occupiedTables}/${tables.length}`} />
              <OverviewMetric label="مخزون منخفض" value={String(lowStock.length)} tone={lowStock.length ? "danger" : "success"} />
              <OverviewMetric label="فواتير غير مدفوعة" value={String(unpaidInvoices.length)} tone={unpaidInvoices.length ? "warning" : "success"} />
              <OverviewMetric label="مصروفات" value={formatMoney(expenseTotal, restaurant.currency)} />
            </section>

            <section className="grid gap-3 md:grid-cols-5">
              {quickActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex h-10 items-center justify-center gap-2 rounded-app-md border border-app-primary bg-app-primary px-3 text-sm font-semibold text-app-primary-foreground transition-colors hover:border-app-primary-hover hover:bg-app-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft"
                >
                  <Plus className="h-4 w-4" />
                  {action.label}
                </Link>
              ))}
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
              <AppSurface title="الطلبات النشطة">
                <DenseList
                  empty="لا توجد طلبات نشطة."
                  rows={activeOrders.map((order) => ({
                    id: order.id,
                    title: order.items.map((item) => `${item.name} x${item.quantity}`).join("، ") || order.id,
                    meta: `${order.status} · ${formatMoney(order.total, restaurant.currency)}`
                  }))}
                />
              </AppSurface>
              <AppSurface title="حالة الطاولات">
                {tables.length ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-4">
                    {tables.slice(0, 12).map((table) => (
                      <Link
                        key={table.id}
                        href="/owner/operations/tables"
                        className={cn(
                          "rounded-app-md border p-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft",
                          table.status === "AVAILABLE"
                            ? "border-app-success-soft bg-app-success-soft text-app-success"
                            : table.status === "OCCUPIED"
                              ? "border-app-warning-soft bg-app-warning-soft text-app-warning"
                              : "border-app-border bg-app-surface-muted text-app-muted"
                        )}
                      >
                        <span className="block truncate">{table.name}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <AppEmptyState title="لا توجد طاولات" description="ستظهر الطاولات هنا بعد إضافتها." />
                )}
              </AppSurface>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              <AppSurface title="تنبيهات المخزون">
                <DenseList empty="المخزون ضمن الحدود." rows={lowStock.map((item) => ({ id: item.id, title: item.name, meta: `${item.currentQuantity} ${item.unit} / حد ${item.minimumQuantity}` }))} />
              </AppSurface>
              <AppSurface title="فواتير تحتاج متابعة">
                <DenseList empty="لا توجد فواتير معلقة." rows={unpaidInvoices.slice(0, 8).map((invoice) => ({ id: invoice.id, title: `${invoice.type} · ${invoice.status}`, meta: formatMoney(invoice.remainingAmount, restaurant.currency) }))} />
              </AppSurface>
              <AppSurface title="حركات النقد الأخيرة">
                <DenseList empty="لا توجد حركات نقدية." rows={cashMovements.slice(0, 8).map((movement) => ({ id: movement.id, title: `${movement.type} · ${formatMoney(movement.amount, restaurant.currency)}`, meta: movement.note || movement.referenceType }))} />
              </AppSurface>
            </section>
          </>
        )}
      </div>
    </OwnerAppShell>
  );
}

const quickActions = [
  { label: "طلب جديد", href: "/owner/operations/orders" },
  { label: "طاولة جديدة", href: "/owner/operations/tables" },
  { label: "حركة مخزون", href: "/owner/operations/inventory" },
  { label: "مصروف جديد", href: "/owner/operations/expenses" },
  { label: "فاتورة جديدة", href: "/owner/operations/invoices" }
];

function OverviewMetric({
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

function DenseList({ rows, empty }: { rows: Array<{ id: string; title: string; meta: string }>; empty: string }) {
  if (!rows.length) {
    return <AppEmptyState title={empty} description="" className="py-5" />;
  }

  return (
    <div className="divide-y divide-app-border">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-3 py-2">
          <p className="truncate text-sm font-semibold text-app-ink">{row.title}</p>
          <p className="shrink-0 text-app-helper font-medium text-app-muted">{row.meta}</p>
        </div>
      ))}
    </div>
  );
}
