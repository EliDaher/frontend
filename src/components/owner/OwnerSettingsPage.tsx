"use client";

import Link from "next/link";
import { ArrowRight, Globe2, RefreshCw, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { adminRequest } from "@/lib/api";
import { planLabels } from "@/lib/plans";
import type { Restaurant } from "@/types/menu";

export function OwnerSettingsPage() {
  const [token, setToken] = useState("");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
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
    <main
      className="min-h-screen bg-[#f5f6f8] px-4 py-6 text-slate-950"
      dir="rtl"
    >
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black text-amber-700">إعدادات</p>
            <h1 className="text-2xl font-black">المطعم والدومين</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void load()}
              className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-white shadow-sm"
            >
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            </button>
            <Link
              href="/owner/dashboard"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-black text-white"
            >
              <ArrowRight className="h-4 w-4" />
              اللوحة
            </Link>
          </div>
        </div>

        {message ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-black text-red-800">
            {message}
          </p>
        ) : null}

        {restaurant ? (
          <div className="grid gap-4">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-md bg-amber-100 text-amber-800">
                  <Settings className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black">{restaurant.name}</h2>
                  <p className="mt-1 text-sm font-bold text-slate-500">
                    /{restaurant.slug} ·{" "}
                    {planLabels[restaurant.plan ?? "basic"]}
                  </p>
                </div>
              </div>
            </section>

            <section className="mb-4 grid gap-3 md:grid-cols-4">
              <a
                href="/owner/billing"
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5"
              >
                <p className="text-xs font-black text-slate-500">
                  SaaS Billing
                </p>
                <p className="mt-1 font-black">الفوترة والحدود</p>
              </a>
              <a
                href="/owner/operations"
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5"
              >
                <p className="text-xs font-black text-slate-500">Operations</p>
                <p className="mt-1 font-black">إدارة المطعم والـ POS</p>
              </a>
              <a
                href="/owner/settings"
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5"
              >
                <p className="text-xs font-black text-slate-500">Settings</p>
                <p className="mt-1 font-black">الإعدادات والدومين</p>
              </a>
              <div
                className={`rounded-lg border p-4 text-sm font-black leading-6 ${subscriptionStatus === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
              >
                {subscriptionStatus === "active"
                  ? "الاشتراك فعال، والمنيو متاح ضمن حدود الباقة."
                  : "المنيو العام لن يظهر حتى تصبح حالة الاشتراك فعالة."}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-md bg-slate-950 text-white">
                  <Globe2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-black">الدومين المخصص</h2>
                  <p className="mt-2 text-sm font-bold leading-7 text-slate-600">
                    الدومين المخصص متاح لباقات Premium فقط ويتم ربط DNS يدوياً
                    في نسخة MVP. بعد ضبط DNS، يفعّل السوبر أدمن الدومين من لوحة
                    الإدارة.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <ReadOnly
                      label="الدومين"
                      value={restaurant.customDomain || "غير مضبوط"}
                    />
                    <ReadOnly
                      label="الحالة"
                      value={restaurant.customDomainStatus || "none"}
                    />
                  </div>
                </div>
              </div>
            </section>
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

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <label className="space-y-1 text-sm font-black">
      <span>{label}</span>
      <input value={value} readOnly className="h-12 w-full rounded-md border border-slate-200 bg-slate-50 px-3 font-bold text-slate-600" />
    </label>
  );
}
