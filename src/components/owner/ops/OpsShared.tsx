"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { OwnerAppShell } from "@/components/owner/dashboard/OwnerAppShell";
import { AppButton, AppEmptyState, cn } from "@/components/shared";
import { formatMoney } from "@/lib/format";
import { moduleLabels, normalizeModules } from "@/lib/modules";
import { loadRestaurantWithOfflineFallback } from "@/offline/repositories/restaurant";
import { startSync } from "@/offline/sync-engine";
import type { Restaurant, RestaurantModule, RestaurantModules } from "@/types/menu";
import type { OrderStatus, PaymentMethod } from "@/types/ops";

export type LoadState = {
  token: string;
  restaurant: Restaurant | null;
  modules: RestaurantModules | null;
  message: string;
  busy: boolean;
  setMessage: (message: string) => void;
  loadRestaurant: (authToken?: string) => Promise<Restaurant | null>;
};

export const money = formatMoney;

export function useOpsPage(requiredModule: RestaurantModule): LoadState {
  const [token, setToken] = useState("");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
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
    void loadRestaurant(storedToken);
  }, []);

  useEffect(() => {
    if (!token || !restaurant?.id) return;
    void startSync(restaurant.id, token);

    function resumeSync() {
      void startSync(restaurant!.id, token);
    }

    window.addEventListener("online", resumeSync);
    window.addEventListener("focus", resumeSync);
    return () => {
      window.removeEventListener("online", resumeSync);
      window.removeEventListener("focus", resumeSync);
    };
  }, [restaurant?.id, token]);

  async function loadRestaurant(authToken = token) {
    setBusy(true);
    setMessage("");
    try {
      const { restaurant: nextRestaurant, offline } = await loadRestaurantWithOfflineFallback(authToken);
      setRestaurant(nextRestaurant);
      const enabledModules = normalizeModules(nextRestaurant.plan, nextRestaurant.modules);
      if (!enabledModules[requiredModule]) {
        setMessage(`وحدة ${moduleLabels[requiredModule]} غير مفعلة لهذا المطعم.`);
      } else if (offline) {
        setMessage("أنت تعمل دون اتصال. سيتم حفظ التغييرات محليًا ومزامنتها عند عودة الإنترنت.");
      }
      return nextRestaurant;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحميل بيانات المطعم.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { token, restaurant, modules, message, busy, setMessage, loadRestaurant };
}

export function OpsShell({
  title,
  eyebrow,
  module,
  state,
  onRefresh,
  children
}: {
  title: string;
  eyebrow: string;
  module: RestaurantModule;
  state: LoadState;
  onRefresh: () => void;
  children: React.ReactNode;
}) {
  const enabled = state.modules?.[module] ?? false;

  return (
    <OwnerAppShell restaurant={state.restaurant} modules={state.modules} title={title} eyebrow={eyebrow} busy={state.busy} onRefresh={onRefresh}>
      <div className="mx-auto max-w-7xl">
        <nav className="mb-4 flex gap-2 overflow-x-auto rounded-app-lg border border-app-border bg-app-surface p-2 lg:hidden">
          {opsLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="shrink-0 rounded-app-md px-3 py-2 text-sm font-semibold text-app-muted transition-colors hover:bg-app-surface-muted hover:text-app-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        {state.message ? <Message text={state.message} /> : null}
        {!state.restaurant ? <Loading /> : enabled ? children : <Empty title="الوحدة غير مفعلة" text="فعّل الوحدة من الخطة أو إعدادات المطعم قبل استخدامها." />}
      </div>
    </OwnerAppShell>
  );
}

const opsLinks = [
  { href: "/owner/operations/tables", label: "الطاولات" },
  { href: "/owner/operations/orders", label: "الطلبات" },
  { href: "/owner/operations/inventory", label: "المخزون" },
  { href: "/owner/operations/suppliers", label: "الموردون" },
  { href: "/owner/operations/invoices", label: "الفواتير" },
  { href: "/owner/operations/expenses", label: "المصروفات" },
  { href: "/owner/operations/accounting", label: "المحاسبة" }
];

function Message({ text }: { text: string }) {
  return <p className="mb-4 rounded-app-md border border-app-danger-soft bg-app-danger-soft p-3 text-app-body font-semibold text-app-danger">{text}</p>;
}

function Loading() {
  return (
    <div className="grid min-h-[280px] place-items-center rounded-app-lg border border-app-border bg-app-surface">
      <RefreshCw className="h-6 w-6 animate-spin text-app-primary" />
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return <AppEmptyState title={title} description={text} />;
}

const operationalStatusActions: Array<{ status: Exclude<OrderStatus, "DRAFT" | "COMPLETED" | "CANCELLED">; label: string }> = [
  { status: "PENDING", label: "معلّق" },
  { status: "CONFIRMED", label: "تأكيد" },
  { status: "PREPARING", label: "قيد التحضير" },
  { status: "READY", label: "جاهز" },
  { status: "SERVED", label: "تم التقديم" }
];

export const orderStatusLabels: Record<OrderStatus, string> = {
  DRAFT: "مسودة",
  PENDING: "معلّق",
  CONFIRMED: "مؤكد",
  PREPARING: "قيد التحضير",
  READY: "جاهز",
  SERVED: "تم التقديم",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغى"
};

export function OrderStatusActions({
  status,
  busy,
  onStatusChange,
  onComplete,
  onCancel
}: {
  status: OrderStatus;
  busy?: boolean;
  onStatusChange: (status: OrderStatus) => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const closed = status === "COMPLETED" || status === "CANCELLED";

  if (closed) {
    return (
      <div className="rounded-app-md border border-app-border bg-app-surface-muted p-3 text-app-body font-semibold text-app-muted">
        الطلب {orderStatusLabels[status]}.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {operationalStatusActions.map((action) => (
        <AppButton
          key={action.status}
          type="button"
          variant={status === action.status ? "primary" : "secondary"}
          size="sm"
          disabled={busy || status === action.status}
          onClick={() => onStatusChange(action.status)}
          className={cn(busy && "opacity-60")}
        >
          {action.label}
        </AppButton>
      ))}
      <AppButton
        type="button"
        size="sm"
        disabled={busy}
        onClick={onComplete}
      >
        إنهاء الطلب
      </AppButton>
      <AppButton
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={onCancel}
        className="text-app-danger hover:bg-app-danger-soft"
      >
        إلغاء
      </AppButton>
    </div>
  );
}

export function paymentAmountForMethod(method: PaymentMethod, total: number, paidAmount: number) {
  if (method === "DEBT") return 0;
  if (method === "SPLIT") return paidAmount;
  return paidAmount || total;
}
