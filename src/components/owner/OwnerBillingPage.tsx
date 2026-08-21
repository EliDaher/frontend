"use client";

import { CreditCard, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { OwnerAppShell } from "@/components/owner/dashboard/OwnerAppShell";
import {
  AppBadge,
  AppButton,
  AppEmptyState,
  AppPageHeader,
  AppSurface,
  cn
} from "@/components/shared";
import { adminRequest } from "@/lib/api";
import { formatDate, formatInteger } from "@/lib/format";
import { normalizeModules } from "@/lib/modules";
import { planLabels, subscriptionLabels } from "@/lib/plans";
import type { OwnerSubscription, Restaurant, SubscriptionStatus } from "@/types/menu";

export function OwnerBillingPage() {
  const [token, setToken] = useState("");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [subscription, setSubscription] = useState<OwnerSubscription | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const modules = useMemo(() => restaurant ? normalizeModules(restaurant.plan, restaurant.modules) : null, [restaurant]);

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
      const nextSubscription = await adminRequest<OwnerSubscription>("/api/owner/subscription", authToken);
      setSubscription(nextSubscription);
      const nextRestaurant = await adminRequest<Restaurant>("/api/owner/restaurant", authToken).catch(() => null);
      setRestaurant(nextRestaurant);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحميل الاشتراك.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OwnerAppShell restaurant={restaurant} modules={modules} title="الفوترة والاشتراك" eyebrow="SaaS Billing" busy={busy} onRefresh={() => void load()}>
      <div className="mx-auto grid max-w-6xl gap-4">
        <AppPageHeader
          title="الفوترة والاشتراك"
          description="إدارة باقة DMenu وحالة الاشتراك."
          secondaryActions={subscription ? (
            <>
              <AppBadge variant="primary">{planLabels[subscription.plan]}</AppBadge>
              <SubscriptionStatusBadge status={subscription.status} />
              <AppBadge variant="neutral">{subscription.billingCycle === "yearly" ? "سنوي" : "شهري"}</AppBadge>
            </>
          ) : null}
        />

        {message ? <PageMessage text={message} /> : null}

        {subscription ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <AppSurface title="الخطة الحالية">
              <div className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <ReadOnlyFact label="الباقة" value={planLabels[subscription.plan]} />
                  <ReadOnlyFact label="الحالة" value={subscriptionLabels[subscription.status]} badge={<SubscriptionStatusBadge status={subscription.status} />} />
                  <ReadOnlyFact label="دورة الفوترة" value={subscription.billingCycle === "yearly" ? "سنوي" : "شهري"} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Usage label="الأصناف" value={subscription.usage.items} max={subscription.limits.maxItems} />
                  <Usage label="الأقسام" value={subscription.usage.categories} max={subscription.limits.maxCategories} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <ReadOnlyFact label="تاريخ الانتهاء" value={subscription.endsAt ? formatDate(subscription.endsAt) : "لم يحدد بعد"} />
                  <ReadOnlyFact label="آخر دفعة" value={subscription.lastPaymentAt ? formatDate(subscription.lastPaymentAt) : "لا توجد دفعة مسجلة"} />
                </div>

                <div className="rounded-app-md border border-app-border bg-app-surface-muted p-4 text-app-body leading-7 text-app-muted">
                  عند الدفع، يضيف السوبر أدمن الدفعة يدوياً ويمدد الاشتراك. إذا كانت الحالة غير فعالة لن تظهر صفحة المنيو العامة.
                </div>
              </div>
            </AppSurface>

            <AppSurface>
              <div className="grid gap-4">
                <div className="grid h-11 w-11 place-items-center rounded-app-md border border-app-border bg-app-primary-soft text-app-primary">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-app-section-title font-semibold text-app-ink">تعليمات الدفع</h2>
                  <p className="mt-2 text-app-body leading-7 text-app-muted">
                    الدفع في هذه النسخة يدوي بالكامل. أرسل إثبات الدفع للإدارة مع اسم المطعم والبريد المسجل، وسيتم تفعيل أو تمديد الاشتراك من لوحة السوبر أدمن.
                  </p>
                </div>
                <div className="rounded-app-md border border-app-border bg-app-surface-muted p-4 text-app-body">
                  <p className="text-app-helper text-app-muted">الحالة الحالية</p>
                  <div className="mt-2">
                    <SubscriptionStatusBadge status={subscription.status} />
                  </div>
                </div>
              </div>
            </AppSurface>
          </div>
        ) : (
          <AppEmptyState
            title="جاري تحميل الاشتراك"
            description="يتم تحميل حالة الباقة والحدود."
            icon={<RefreshCw className="h-5 w-5 animate-spin" />}
          />
        )}
      </div>
    </OwnerAppShell>
  );
}

function Usage({ label, value, max }: { label: string; value: number; max: number }) {
  const percentage = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="rounded-app-md border border-app-border bg-app-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-app-ink">{label}</p>
        <p className="text-app-helper font-semibold text-app-muted">
          {formatInteger(value)} / {formatInteger(max)}
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-app-sm bg-app-surface-muted">
        <div className="h-full rounded-app-sm bg-app-primary" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function ReadOnlyFact({ label, value, badge }: { label: string; value: string; badge?: React.ReactNode }) {
  return (
    <div className="rounded-app-md border border-app-border bg-app-surface-muted p-3">
      <p className="text-app-helper font-medium text-app-muted">{label}</p>
      <div className="mt-1 min-w-0">
        {badge ?? <p className="truncate font-semibold text-app-ink">{value}</p>}
      </div>
    </div>
  );
}

function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  return <AppBadge variant={subscriptionStatusVariant(status)}>{subscriptionLabels[status]}</AppBadge>;
}

function subscriptionStatusVariant(status: SubscriptionStatus): "neutral" | "success" | "warning" | "danger" {
  if (status === "active") return "success";
  if (status === "pendingApproval" || status === "pastDue") return "warning";
  if (status === "suspended" || status === "cancelled") return "danger";
  return "neutral";
}

function PageMessage({ text }: { text: string }) {
  return <p className="rounded-app-md border border-app-danger-soft bg-app-danger-soft p-3 text-app-body font-semibold text-app-danger">{text}</p>;
}
