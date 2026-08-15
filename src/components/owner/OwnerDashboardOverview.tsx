"use client";

import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { OwnerAppShell, MetricCard, ProPanel } from "@/components/owner/dashboard/OwnerAppShell";
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
        {message ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-black text-red-800">{message}</p> : null}
        {!restaurant ? (
          <div className="grid min-h-[320px] place-items-center rounded-lg border border-slate-200 bg-white">
            <RefreshCw className="h-6 w-6 animate-spin text-amber-600" />
          </div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <MetricCard label="مبيعات اليوم" value={formatMoney(summary?.totals.sales ?? 0, restaurant.currency)} tone="green" />
              <MetricCard label="طلبات مفتوحة" value={String(activeOrders.length)} tone="amber" />
              <MetricCard label="طاولات مشغولة" value={`${occupiedTables}/${tables.length}`} />
              <MetricCard label="مخزون منخفض" value={String(lowStock.length)} tone={lowStock.length ? "red" : "green"} />
              <MetricCard label="فواتير غير مدفوعة" value={String(unpaidInvoices.length)} tone={unpaidInvoices.length ? "amber" : "green"} />
              <MetricCard label="مصروفات" value={formatMoney(expenseTotal, restaurant.currency)} />
            </section>

            <section className="grid gap-3 md:grid-cols-5">
              {quickActions.map((action) => (
                <Link key={action.href} href={action.href} className="flex h-12 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5">
                  <Plus className="h-4 w-4" />
                  {action.label}
                </Link>
              ))}
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
              <ProPanel title="الطلبات النشطة">
                <DenseList
                  empty="لا توجد طلبات نشطة."
                  rows={activeOrders.map((order) => ({
                    id: order.id,
                    title: order.items.map((item) => `${item.name} x${item.quantity}`).join("، ") || order.id,
                    meta: `${order.status} · ${formatMoney(order.total, restaurant.currency)}`
                  }))}
                />
              </ProPanel>
              <ProPanel title="حالة الطاولات">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {tables.slice(0, 12).map((table) => (
                    <Link key={table.id} href="/owner/operations/tables" className={`rounded-md border p-3 text-sm font-black ${table.status === "AVAILABLE" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : table.status === "OCCUPIED" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                      <span className="block truncate">{table.name}</span>
                      <span className="mt-1 block text-xs opacity-70">{table.status}</span>
                    </Link>
                  ))}
                </div>
              </ProPanel>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              <ProPanel title="تنبيهات المخزون">
                <DenseList empty="المخزون ضمن الحدود." rows={lowStock.map((item) => ({ id: item.id, title: item.name, meta: `${item.currentQuantity} ${item.unit} / حد ${item.minimumQuantity}` }))} />
              </ProPanel>
              <ProPanel title="فواتير تحتاج متابعة">
                <DenseList empty="لا توجد فواتير معلقة." rows={unpaidInvoices.slice(0, 8).map((invoice) => ({ id: invoice.id, title: `${invoice.type} · ${invoice.status}`, meta: formatMoney(invoice.remainingAmount, restaurant.currency) }))} />
              </ProPanel>
              <ProPanel title="حركات النقد الأخيرة">
                <DenseList empty="لا توجد حركات نقدية." rows={cashMovements.slice(0, 8).map((movement) => ({ id: movement.id, title: `${movement.type} · ${formatMoney(movement.amount, restaurant.currency)}`, meta: movement.note || movement.referenceType }))} />
              </ProPanel>
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

function DenseList({ rows, empty }: { rows: Array<{ id: string; title: string; meta: string }>; empty: string }) {
  if (!rows.length) {
    return <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">{empty}</p>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-3 py-2">
          <p className="truncate text-sm font-black">{row.title}</p>
          <p className="shrink-0 text-xs font-bold text-slate-500">{row.meta}</p>
        </div>
      ))}
    </div>
  );
}
