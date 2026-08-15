"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { OwnerAppShell, ProPanel } from "@/components/owner/dashboard/OwnerAppShell";
import { adminRequest } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { moduleLabels, normalizeModules } from "@/lib/modules";
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

  async function loadRestaurant(authToken = token) {
    setBusy(true);
    setMessage("");
    try {
      const nextRestaurant = await adminRequest<Restaurant>("/api/owner/restaurant", authToken);
      setRestaurant(nextRestaurant);
      const enabledModules = normalizeModules(nextRestaurant.plan, nextRestaurant.modules);
      if (!enabledModules[requiredModule]) {
        setMessage(`وحدة ${moduleLabels[requiredModule]} غير مفعلة لهذا المطعم.`);
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
        <nav className="mb-4 flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 shadow-sm lg:hidden">
          {opsLinks.map((link) => (
            <Link key={link.href} href={link.href} className="shrink-0 rounded-md px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-50">
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

export function Message({ text }: { text: string }) {
  return <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-black text-red-800">{text}</p>;
}

export function Loading() {
  return (
    <div className="grid min-h-[280px] place-items-center rounded-lg border border-slate-200 bg-white">
      <RefreshCw className="h-6 w-6 animate-spin text-amber-600" />
    </div>
  );
}

export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="font-black">{title}</p>
      <p className="mt-2 text-sm font-bold text-slate-500">{text}</p>
    </div>
  );
}

export function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <ProPanel title={title} action={action}>{children}</ProPanel>;
}

export function Field({ label, value, onChange, type = "text", min }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; min?: string }) {
  return (
    <label className="grid gap-1 text-sm font-black">
      <span>{label}</span>
      <input
        value={value}
        type={type}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-md border border-slate-200 bg-white px-3 font-bold outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
      />
    </label>
  );
}

export function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm font-black">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-md border border-slate-200 bg-white px-3 font-bold outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm font-black">
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-24 rounded-md border border-slate-200 bg-white p-3 font-bold outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100" />
    </label>
  );
}

export function PrimaryButton({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <button disabled={disabled} className="inline-flex h-11 items-center justify-center rounded-md bg-amber-500 px-4 text-sm font-black text-white disabled:bg-slate-300">
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-black text-slate-700">
      {children}
    </button>
  );
}

export function DangerButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-10 items-center justify-center rounded-md border border-red-200 bg-red-50 px-3 text-sm font-black text-red-700">
      {children}
    </button>
  );
}

export function StatusBadge({ label, tone = "slate" }: { label: string; tone?: "slate" | "green" | "amber" | "red" }) {
  const styles = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700"
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${styles[tone]}`}>{label}</span>;
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
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-black text-slate-600">
        الطلب {orderStatusLabels[status]}.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {operationalStatusActions.map((action) => (
        <button
          key={action.status}
          type="button"
          disabled={busy || status === action.status}
          onClick={() => onStatusChange(action.status)}
          className={`inline-flex h-10 items-center justify-center rounded-md px-3 text-sm font-black transition disabled:cursor-not-allowed ${
            status === action.status
              ? "bg-slate-900 text-white"
              : "border border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50"
          } ${busy ? "opacity-60" : ""}`}
        >
          {action.label}
        </button>
      ))}
      <button
        type="button"
        disabled={busy}
        onClick={onComplete}
        className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-600 px-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        إنهاء الطلب
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onCancel}
        className="inline-flex h-10 items-center justify-center rounded-md border border-red-200 bg-red-50 px-3 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        إلغاء
      </button>
    </div>
  );
}

export function paymentAmountForMethod(method: PaymentMethod, total: number, paidAmount: number) {
  if (method === "DEBT") return 0;
  if (method === "SPLIT") return paidAmount;
  return paidAmount || total;
}
