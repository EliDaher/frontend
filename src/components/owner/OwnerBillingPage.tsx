"use client";

import Link from "next/link";
import { ArrowRight, CreditCard, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { adminRequest } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { planLabels, subscriptionLabels } from "@/lib/plans";
import type { OwnerSubscription } from "@/types/menu";

export function OwnerBillingPage() {
  const [token, setToken] = useState("");
  const [subscription, setSubscription] = useState<OwnerSubscription | null>(null);
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
      setSubscription(await adminRequest<OwnerSubscription>("/api/owner/subscription", authToken));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحميل الاشتراك.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f6f8] px-4 py-6 text-slate-950" dir="rtl">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black text-amber-700">الفوترة اليدوية</p>
            <h1 className="text-2xl font-black">الاشتراك والحدود</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void load()} className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-white shadow-sm">
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            </button>
            <Link href="/owner/dashboard" className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-black text-white">
              <ArrowRight className="h-4 w-4" />
              اللوحة
            </Link>
          </div>
        </div>

        {message ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-black text-red-800">{message}</p> : null}

        {subscription ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">{planLabels[subscription.plan]}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{subscriptionLabels[subscription.status]}</span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600 ring-1 ring-slate-200">
                  {subscription.billingCycle === "yearly" ? "سنوي" : "شهري"}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Usage label="الأصناف" value={subscription.usage.items} max={subscription.limits.maxItems} />
                <Usage label="الأقسام" value={subscription.usage.categories} max={subscription.limits.maxCategories} />
              </div>

              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-black text-slate-500">تاريخ الانتهاء</p>
                <p className="mt-1 text-xl font-black">{subscription.endsAt ? formatDate(subscription.endsAt) : "لم يحدد بعد"}</p>
                <p className="mt-3 text-sm font-bold leading-7 text-slate-600">
                  عند الدفع، يضيف السوبر أدمن الدفعة يدوياً ويمدد الاشتراك. إذا كانت الحالة غير فعالة لن تظهر صفحة المنيو العامة.
                </p>
              </div>
            </section>

            <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid h-12 w-12 place-items-center rounded-md bg-amber-100 text-amber-800">
                <CreditCard className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-lg font-black">تعليمات الدفع</h2>
              <p className="mt-2 text-sm font-bold leading-7 text-slate-600">
                الدفع في هذه النسخة يدوي بالكامل. أرسل إثبات الدفع للإدارة مع اسم المطعم والبريد المسجل، وسيتم تفعيل أو تمديد الاشتراك من لوحة السوبر أدمن.
              </p>
              <div className="mt-4 rounded-md bg-slate-950 p-4 text-sm font-bold leading-7 text-white">
                الحالة الحالية: {subscriptionLabels[subscription.status]}
              </div>
            </aside>
          </div>
        ) : (
          <div className="grid min-h-[320px] place-items-center rounded-lg border border-slate-200 bg-white">
            <RefreshCw className="h-6 w-6 animate-spin text-amber-600" />
          </div>
        )}
      </div>
    </main>
  );
}

function Usage({ label, value, max }: { label: string; value: number; max: number }) {
  const percentage = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-black">{label}</p>
        <p className="text-sm font-black text-slate-500">
          {value} / {max}
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-amber-500" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
