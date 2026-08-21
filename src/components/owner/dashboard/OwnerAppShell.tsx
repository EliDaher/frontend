"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Boxes,
  Building2,
  CreditCard,
  FileText,
  Home,
  LogOut,
  Menu as MenuIcon,
  PanelRightClose,
  PanelRightOpen,
  ReceiptText,
  RefreshCw,
  Settings,
  ShoppingCart,
  Table2,
  Utensils,
  X
} from "lucide-react";
import { SyncStatusIndicator } from "@/components/owner/SyncStatusIndicator";
import { AppBadge, cn } from "@/components/shared";
import type { Restaurant, RestaurantModule, RestaurantModules } from "@/types/menu";

type NavItem = {
  label: string;
  href: string;
  icon: typeof Home;
  module?: RestaurantModule;
};

const navItems: NavItem[] = [
  { label: "الرئيسية", href: "/owner/dashboard", icon: Home },
  { label: "المنيو", href: "/owner/menu", icon: Utensils, module: "menu" },
  { label: "الطلبات", href: "/owner/operations/orders", icon: ShoppingCart, module: "orders" },
  { label: "الطاولات", href: "/owner/operations/tables", icon: Table2, module: "tables" },
  { label: "المخزون", href: "/owner/operations/inventory", icon: Boxes, module: "inventory" },
  { label: "الموردون", href: "/owner/operations/suppliers", icon: Building2, module: "purchasing" },
  { label: "الفواتير", href: "/owner/operations/invoices", icon: FileText, module: "accounting" },
  { label: "المصروفات", href: "/owner/operations/expenses", icon: ReceiptText, module: "expenses" },
  { label: "المحاسبة", href: "/owner/operations/accounting", icon: BarChart3, module: "accounting" },
  { label: "الإعدادات", href: "/owner/settings", icon: Settings }
];

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  { label: "الرئيسية", items: [navItems[0]] },
  { label: "إدارة المطعم", items: [navItems[1]] },
  { label: "الطلبات والمبيعات", items: [navItems[2], navItems[3]] },
  { label: "المخزون والمحاسبة", items: [navItems[4], navItems[5], navItems[6], navItems[7], navItems[8]] },
  { label: "الإعدادات", items: [navItems[9]] }
];

function isNavItemActive(pathname: string, href: string) {
  return pathname === href || (href !== "/owner/dashboard" && pathname.startsWith(href));
}

function DMenuMark() {
  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-app-md border border-app-border bg-app-primary-soft text-app-primary">
      <MenuIcon className="h-5 w-5" strokeWidth={2.2} />
    </div>
  );
}

const sidebarPreferenceKey = "dmenu-owner-sidebar-collapsed";

function readSidebarPreference() {
  try {
    return window.localStorage.getItem(sidebarPreferenceKey) === "true";
  } catch {
    return false;
  }
}

function writeSidebarPreference(collapsed: boolean) {
  try {
    window.localStorage.setItem(sidebarPreferenceKey, String(collapsed));
  } catch {
    // The sidebar should still work if browser storage is unavailable.
  }
}

function OwnerIdentity({ restaurant, collapsed = false }: { restaurant: Restaurant | null; collapsed?: boolean }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", collapsed && "justify-center")}>
      <DMenuMark />
      <div className={cn("min-w-0", collapsed && "hidden")}>
        <p className="text-sm font-semibold leading-5 text-app-ink">DMenu</p>
        <p className="truncate text-app-meta text-app-muted">{restaurant?.name ?? "لوحة المطعم"}</p>
      </div>
    </div>
  );
}

function OwnerNavLink({ item, active, collapsed = false, onNavigate }: { item: NavItem; active: boolean; collapsed?: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "relative flex h-10 items-center rounded-app-md text-sm font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft",
        collapsed ? "justify-center px-0" : "gap-3 px-3",
        active
          ? cn(
              "bg-app-primary-soft text-app-primary before:absolute before:inset-y-2 before:start-1 before:w-1 before:rounded-full before:bg-app-primary",
              collapsed ? "px-0" : "ps-4"
            )
          : "text-app-muted hover:bg-app-surface-muted hover:text-app-ink"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
      <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
    </Link>
  );
}

function OwnerNavGroups({
  pathname,
  visibleNav,
  collapsed = false,
  onNavigate
}: {
  pathname: string;
  visibleNav: NavItem[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const visibleHrefs = new Set(visibleNav.map((item) => item.href));

  return (
    <div className={cn("space-y-5", collapsed && "space-y-3")}>
      {navGroups.map((group) => {
        const groupItems = group.items.filter((item) => visibleHrefs.has(item.href));
        if (groupItems.length === 0) return null;

        return (
          <div key={group.label} className="space-y-1.5">
            <p className={cn("px-3 text-[11px] font-semibold text-app-muted", collapsed && "sr-only")}>{group.label}</p>
            <div className="space-y-1">
              {groupItems.map((item) => (
                <OwnerNavLink
                  key={item.href}
                  item={item}
                  active={isNavItemActive(pathname, item.href)}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const visibleNav = navItems.filter((item) => !item.module || !modules || modules[item.module]);

  useEffect(() => {
    setSidebarCollapsed(readSidebarPreference());
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileNavOpen]);

  function logout() {
    window.localStorage.removeItem("menu-owner-token");
    window.location.href = "/owner/login";
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((current) => {
      const next = !current;
      writeSidebarPreference(next);
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-app-bg font-app text-app-ink" dir="rtl">
      <aside
        className={cn(
          "fixed inset-y-0 end-0 z-40 hidden border-s border-app-border bg-app-surface transition-[width] duration-200 ease-out lg:flex lg:flex-col",
          sidebarCollapsed ? "w-20" : "w-64"
        )}
      >
        <div className={cn("border-b border-app-border p-4", sidebarCollapsed && "px-3")}>
          <div className={cn("flex items-start gap-3", sidebarCollapsed ? "flex-col items-center" : "justify-between")}>
            <OwnerIdentity restaurant={restaurant} collapsed={sidebarCollapsed} />
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-app-md border border-app-border bg-app-surface text-app-muted transition-colors hover:bg-app-surface-muted hover:text-app-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft"
              aria-label={sidebarCollapsed ? "توسيع الشريط الجانبي" : "طي الشريط الجانبي"}
              aria-expanded={!sidebarCollapsed}
              title={sidebarCollapsed ? "توسيع الشريط الجانبي" : "طي الشريط الجانبي"}
            >
              {sidebarCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
            </button>
          </div>
          <div className={cn("mt-3", sidebarCollapsed && "hidden")}>
            <AppBadge variant="neutral">{restaurant?.plan ?? "..."}</AppBadge>
          </div>
        </div>
        <nav className={cn("flex-1 overflow-y-auto px-3 py-4", sidebarCollapsed && "px-2")} aria-label="تنقل لوحة صاحب المطعم">
          <OwnerNavGroups pathname={pathname} visibleNav={visibleNav} collapsed={sidebarCollapsed} />
        </nav>
        <div className="border-t border-app-border p-3">
          <button
            onClick={logout}
            className={cn(
              "flex h-10 w-full items-center rounded-app-md text-sm font-semibold text-app-muted transition-colors hover:bg-app-surface-muted hover:text-app-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft",
              sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"
            )}
            aria-label={sidebarCollapsed ? "خروج" : undefined}
            title={sidebarCollapsed ? "خروج" : undefined}
          >
            <LogOut className="h-4 w-4" />
            <span className={cn(sidebarCollapsed && "sr-only")}>خروج</span>
          </button>
        </div>
      </aside>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="قائمة التنقل">
          <button
            type="button"
            className="absolute inset-0 bg-app-backdrop"
            aria-label="إغلاق قائمة التنقل"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="absolute inset-y-0 end-0 flex w-[min(20rem,calc(100vw-2rem))] flex-col border-s border-app-border bg-app-surface shadow-app-dialog">
            <div className="flex items-start justify-between gap-3 border-b border-app-border p-4">
              <div className="min-w-0">
                <OwnerIdentity restaurant={restaurant} />
                <div className="mt-3">
                  <AppBadge variant="neutral">{restaurant?.plan ?? "..."}</AppBadge>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-app-md border border-app-border bg-app-surface text-app-muted transition-colors hover:bg-app-surface-muted hover:text-app-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft sm:h-9 sm:w-9"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="تنقل لوحة صاحب المطعم للهاتف">
              <OwnerNavGroups pathname={pathname} visibleNav={visibleNav} onNavigate={() => setMobileNavOpen(false)} />
            </nav>
            <div className="border-t border-app-border p-3">
              <button
                onClick={logout}
                className="flex h-10 w-full items-center gap-3 rounded-app-md px-3 text-sm font-semibold text-app-muted transition-colors hover:bg-app-surface-muted hover:text-app-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft"
              >
                <LogOut className="h-4 w-4" />
                خروج
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={cn("transition-[padding] duration-200 ease-out", sidebarCollapsed ? "lg:pe-20" : "lg:pe-64")}>
        <header className="sticky top-0 z-30 border-b border-app-border bg-app-surface/95 px-4 py-3 backdrop-blur lg:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-app-md border border-app-border bg-app-surface text-app-ink transition-colors hover:bg-app-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft lg:hidden"
                aria-label="فتح قائمة التنقل"
                aria-expanded={mobileNavOpen}
              >
                <MenuIcon className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="text-app-meta text-app-primary">{eyebrow}</p>
                <h1 className="truncate text-app-section-title font-semibold text-app-ink">{title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <SyncStatusIndicator tenantId={restaurant?.id} />
              {restaurant ? (
                <Link
                  href={`/${restaurant.slug}`}
                  target="_blank"
                  className="hidden h-10 items-center rounded-app-md border border-app-border bg-app-surface px-3 text-sm font-semibold text-app-ink transition-colors hover:border-app-border-strong hover:bg-app-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft sm:inline-flex"
                >
                  عرض المنيو
                </Link>
              ) : null}
              {onRefresh ? (
                <button
                  onClick={onRefresh}
                  className="grid h-10 w-10 place-items-center rounded-app-md border border-app-border bg-app-surface text-app-muted transition-colors hover:bg-app-surface-muted hover:text-app-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft"
                  aria-label="تحديث"
                >
                  <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
                </button>
              ) : null}
              <button
                onClick={logout}
                className="grid h-10 w-10 place-items-center rounded-app-md border border-app-border bg-app-surface text-app-muted transition-colors hover:bg-app-surface-muted hover:text-app-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft lg:hidden"
                aria-label="خروج"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="px-4 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-5 md:px-6 lg:px-8 lg:py-6 lg:pb-8">{children}</div>

        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-app-border bg-app-surface px-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] pt-1 lg:hidden" aria-label="تنقل سريع">
          {visibleNav.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const active = isNavItemActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "grid h-12 place-items-center rounded-app-md text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft",
                  active ? "bg-app-primary-soft text-app-primary" : "text-app-muted hover:bg-app-surface-muted hover:text-app-ink"
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </main>
  );
}
