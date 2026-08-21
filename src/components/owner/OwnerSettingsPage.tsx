"use client";

import Link from "next/link";
import { Globe2, RefreshCw, Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { OwnerAppShell } from "@/components/owner/dashboard/OwnerAppShell";
import {
  AppBadge,
  AppEmptyState,
  AppInput,
  AppPageHeader,
  AppSurface,
  cn
} from "@/components/shared";
import { adminRequest } from "@/lib/api";
import { normalizeModules } from "@/lib/modules";
import { planLabels, subscriptionLabels } from "@/lib/plans";
import type { CustomDomainStatus, Restaurant, SubscriptionStatus } from "@/types/menu";

export function OwnerSettingsPage() {
  const [token, setToken] = useState("");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const modules = useMemo(() => restaurant ? normalizeModules(restaurant.plan, restaurant.modules) : null, [restaurant]);
  const subscriptionStatus = restaurant?.subscriptionStatus ?? "active";

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
      setRestaurant(await adminRequest<Restaurant>("/api/owner/restaurant", authToken));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحميل الإعدادات.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OwnerAppShell restaurant={restaurant} modules={modules} title="الإعدادات" eyebrow="Settings" busy={busy} onRefresh={() => void load()}>
      <div className="mx-auto grid max-w-6xl gap-4">
        <AppPageHeader
          title="الإعدادات"
          description="مراجعة بيانات المطعم والدومين وحالة الاشتراك."
          secondaryActions={restaurant ? (
            <>
              <AppBadge variant="neutral">/{restaurant.slug}</AppBadge>
              <AppBadge variant="primary">{planLabels[restaurant.plan ?? "basic"]}</AppBadge>
              <SubscriptionStatusBadge status={subscriptionStatus} />
            </>
          ) : null}
        />

        {message ? <PageMessage text={message} /> : null}

        {restaurant ? (
          <div className="grid gap-4">
            <AppSurface>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-app-md border border-app-border bg-app-primary-soft text-app-primary">
                    <Settings className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-app-section-title font-semibold text-app-ink">{restaurant.name}</h2>
                    <p className="mt-1 text-app-body text-app-muted">/{restaurant.slug} · {planLabels[restaurant.plan ?? "basic"]}</p>
                  </div>
                </div>
                <SubscriptionNotice status={subscriptionStatus} />
              </div>
            </AppSurface>

            <section className="grid gap-3 md:grid-cols-3">
              <SettingsLink href="/owner/billing" eyebrow="SaaS Billing" title="الفوترة والحدود" />
              <SettingsLink href="/owner/operations" eyebrow="Operations" title="إدارة المطعم والـ POS" />
              <SettingsLink href="/owner/settings" eyebrow="Settings" title="الإعدادات والدومين" active />
            </section>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
              <AppSurface title="معلومات المطعم">
                <div className="grid gap-3 sm:grid-cols-2">
                  <ReadOnly label="اسم المطعم" value={restaurant.name} />
                  <ReadOnly label="رابط المنيو" value={`/${restaurant.slug}`} dir="ltr" />
                  <ReadOnly label="الهاتف" value={restaurant.phone || "غير مضبوط"} />
                  <ReadOnly label="العملة" value={restaurant.currency || "غير مضبوطة"} />
                  <ReadOnly label="العنوان" value={restaurant.address || "غير مضبوط"} />
                  <ReadOnly label="القالب" value={restaurant.template} />
                </div>
                {restaurant.description ? (
                  <div className="mt-3 rounded-app-md border border-app-border bg-app-surface-muted p-3">
                    <p className="text-app-helper font-medium text-app-muted">الوصف</p>
                    <p className="mt-1 text-app-body leading-7 text-app-ink">{restaurant.description}</p>
                  </div>
                ) : null}
              </AppSurface>

              <AppSurface title="الاشتراك">
                <div className="grid gap-3">
                  <ReadOnly label="الباقة" value={planLabels[restaurant.plan ?? "basic"]} />
                  <ReadOnly label="الحالة" value={subscriptionLabels[subscriptionStatus]} />
                  <ReadOnly label="دورة الفوترة" value={restaurant.billingCycle === "yearly" ? "سنوي" : "شهري"} />
                </div>
              </AppSurface>
            </div>

            <AppSurface title="الدومين المخصص">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-app-md border border-app-border bg-app-surface-muted text-app-muted">
                  <Globe2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-app-body leading-7 text-app-muted">
                    الدومين المخصص متاح لباقات Premium فقط ويتم ربط DNS يدوياً في نسخة MVP. بعد ضبط DNS، يفعّل السوبر أدمن الدومين من لوحة الإدارة.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <ReadOnly label="الدومين" value={restaurant.customDomain || "غير مضبوط"} dir="ltr" />
                    <div className="rounded-app-md border border-app-border bg-app-surface-muted p-3">
                      <p className="text-app-helper font-medium text-app-muted">الحالة</p>
                      <div className="mt-2">
                        <DomainStatusBadge status={restaurant.customDomainStatus || "none"} />
                      </div>
                    </div>
                    <ReadOnly label="تاريخ التحقق" value={restaurant.customDomainVerifiedAt || "غير متحقق"} />
                  </div>
                </div>
              </div>
            </AppSurface>
          </div>
        ) : (
          <AppEmptyState
            title="جاري تحميل الإعدادات"
            description="يتم تحميل بيانات المطعم والدومين."
            icon={<RefreshCw className="h-5 w-5 animate-spin" />}
          />
        )}
      </div>
    </OwnerAppShell>
  );
}

function SettingsLink({ href, eyebrow, title, active = false }: { href: string; eyebrow: string; title: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-app-md border bg-app-surface p-4 transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft",
        active ? "border-app-primary bg-app-primary-soft" : "border-app-border hover:border-app-border-strong hover:bg-app-surface-muted"
      )}
    >
      <p className={cn("text-app-helper font-semibold", active ? "text-app-primary" : "text-app-muted")}>{eyebrow}</p>
      <p className="mt-1 font-semibold text-app-ink">{title}</p>
    </Link>
  );
}

function ReadOnly({ label, value, dir }: { label: string; value: string; dir?: "rtl" | "ltr" }) {
  return (
    <label className="grid gap-1.5 text-app-label text-app-ink">
      <span>{label}</span>
      <AppInput value={value} readOnly dir={dir} className={cn("bg-app-surface-muted text-app-muted", dir === "ltr" && "text-left")} />
    </label>
  );
}

function SubscriptionNotice({ status }: { status: SubscriptionStatus }) {
  const active = status === "active";
  return (
    <div className={cn(
      "rounded-app-md border px-3 py-2 text-app-body font-semibold leading-6",
      active ? "border-app-success-soft bg-app-success-soft text-app-success" : "border-app-warning-soft bg-app-warning-soft text-app-warning"
    )}>
      {active ? "الاشتراك فعال، والمنيو متاح ضمن حدود الباقة." : "المنيو العام لن يظهر حتى تصبح حالة الاشتراك فعالة."}
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

function DomainStatusBadge({ status }: { status: CustomDomainStatus }) {
  const labels: Record<CustomDomainStatus, string> = {
    none: "none",
    pending: "pending",
    verified: "verified",
    rejected: "rejected"
  };
  return <AppBadge variant={domainStatusVariant(status)}>{labels[status]}</AppBadge>;
}

function domainStatusVariant(status: CustomDomainStatus): "neutral" | "success" | "warning" | "danger" {
  if (status === "verified") return "success";
  if (status === "pending") return "warning";
  if (status === "rejected") return "danger";
  return "neutral";
}

function PageMessage({ text }: { text: string }) {
  return <p className="rounded-app-md border border-app-danger-soft bg-app-danger-soft p-3 text-app-body font-semibold text-app-danger">{text}</p>;
}
