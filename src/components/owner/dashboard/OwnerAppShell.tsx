"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  Building2,
  CreditCard,
  FileText,
  Home,
  LogOut,
  Menu as MenuIcon,
  ReceiptText,
  RefreshCw,
  Settings,
  ShoppingCart,
  Table2,
  Utensils
} from "lucide-react";
import { SyncStatusIndicator } from "@/components/owner/SyncStatusIndicator";
import type { Restaurant, RestaurantModule, RestaurantModules } from "@/types/menu";

type NavItem = {
  label: string;
  href: string;
  icon: typeof Home;
  module?: RestaurantModule;
};

const navItems: NavItem[] = [
  { label: "\u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629", href: "/owner/dashboard", icon: Home },
  { label: "\u0627\u0644\u0645\u0646\u064a\u0648", href: "/owner/menu", icon: Utensils, module: "menu" },
  { label: "\u0627\u0644\u0637\u0644\u0628\u0627\u062a", href: "/owner/operations/orders", icon: ShoppingCart, module: "orders" },
  { label: "\u0627\u0644\u0637\u0627\u0648\u0644\u0627\u062a", href: "/owner/operations/tables", icon: Table2, module: "tables" },
  { label: "\u0627\u0644\u0645\u062e\u0632\u0648\u0646", href: "/owner/operations/inventory", icon: Boxes, module: "inventory" },
  { label: "\u0627\u0644\u0645\u0648\u0631\u062f\u0648\u0646", href: "/owner/operations/suppliers", icon: Building2, module: "purchasing" },
  { label: "\u0627\u0644\u0641\u0648\u0627\u062a\u064a\u0631", href: "/owner/operations/invoices", icon: FileText, module: "accounting" },
  { label: "\u0627\u0644\u0645\u0635\u0631\u0648\u0641\u0627\u062a", href: "/owner/operations/expenses", icon: ReceiptText, module: "expenses" },
  { label: "\u0627\u0644\u0645\u062d\u0627\u0633\u0628\u0629", href: "/owner/operations/accounting", icon: BarChart3, module: "accounting" },
  { label: "\u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a", href: "/owner/settings", icon: Settings }
];
export function OwnerAppShell({
  restaurant,
  modules,
  title,
  eyebrow,
  busy,
  onRefresh,
  children
}: {
  restaurant: Restaurant | null;
  modules: RestaurantModules | null;
  title: string;
  eyebrow: string;
  busy?: boolean;
  onRefresh?: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const visibleNav = navItems.filter((item) => !item.module || !modules || modules[item.module]);

  function logout() {
    window.localStorage.removeItem("menu-owner-token");
    window.location.href = "/owner/login";
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950" dir="rtl">
      <aside className="fixed inset-y-0 right-0 z-40 hidden w-64 border-l border-slate-200 bg-slate-950 text-white lg:flex lg:flex-col">
        <div className="border-b border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-amber-500 text-slate-950">
              <MenuIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black">{restaurant?.name ?? "لوحة المطعم"}</p>
              <p className="mt-0.5 text-xs font-bold text-slate-400">{restaurant?.plan ?? "..."}</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/owner/dashboard" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-black transition ${active ? "bg-amber-500 text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <button onClick={logout} className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-black text-slate-300 hover:bg-white/10 hover:text-white">
            <LogOut className="h-4 w-4" />
            خروج
          </button>
        </div>
      </aside>

      <div className="lg:pr-64">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black text-amber-700">{eyebrow}</p>
              <h1 className="truncate text-xl font-black">{title}</h1>
            </div>
            <div className="flex items-center gap-2">
              <SyncStatusIndicator tenantId={restaurant?.id} />
              {restaurant ? (
                <Link href={`/${restaurant.slug}`} target="_blank" className="hidden h-10 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 sm:inline-flex">
                  عرض المنيو
                </Link>
              ) : null}
              {onRefresh ? (
                <button onClick={onRefresh} className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-700" aria-label="تحديث">
                  <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
                </button>
              ) : null}
              <button onClick={logout} className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 lg:hidden" aria-label="خروج">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="px-4 py-4 pb-20 lg:pb-6">{children}</div>

        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white p-1 shadow-[0_-12px_24px_rgba(15,23,42,0.08)] lg:hidden">
          {visibleNav.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/owner/dashboard" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={`grid h-12 place-items-center rounded-md text-[11px] font-black ${active ? "bg-amber-500 text-slate-950" : "text-slate-500"}`}>
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </main>
  );
}

export function MetricCard({ label, value, hint, tone = "slate" }: { label: string; value: string; hint?: string; tone?: "slate" | "green" | "amber" | "red" }) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-950",
    green: "border-emerald-200 bg-emerald-50 text-emerald-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    red: "border-red-200 bg-red-50 text-red-950"
  };
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${tones[tone]}`}>
      <p className="text-xs font-black opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
      {hint ? <p className="mt-1 text-xs font-bold opacity-70">{hint}</p> : null}
    </div>
  );
}

export function ProPanel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="font-black">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function ProToolbar({ children }: { children: React.ReactNode }) {
  return <div className="sticky top-[65px] z-20 mb-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">{children}</div>;
}

export function ProTable({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">{children}</div>;
}

export function Drawer({
  title,
  open,
  onClose,
  children
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40" role="dialog" aria-modal="true">
      <div className="ms-auto h-full w-full max-w-md overflow-y-auto border-r border-slate-200 bg-white p-4 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-black">{title}</h2>
          <button onClick={onClose} className="h-9 rounded-md border border-slate-200 px-3 text-sm font-black">إغلاق</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  text,
  open,
  onCancel,
  onConfirm
}: {
  title: string;
  text: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-2xl">
        <h2 className="font-black">{title}</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-500">{text}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="h-10 rounded-md border border-slate-200 px-3 text-sm font-black">إلغاء</button>
          <button onClick={onConfirm} className="h-10 rounded-md bg-red-600 px-3 text-sm font-black text-white">تأكيد</button>
        </div>
      </div>
    </div>
  );
}
