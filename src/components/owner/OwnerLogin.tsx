"use client";

import Link from "next/link";
import { ArrowRight, LayoutDashboard, LockKeyhole, QrCode } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import {
  AppBadge,
  AppButton,
  AppFieldShell,
  AppInput,
  AppSurface
} from "@/components/shared";
import { adminRequest } from "@/lib/api";
import type { AuthUser } from "@/types/menu";

export function OwnerLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const result = await adminRequest<{ token: string; user: AuthUser }>("/api/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({ email, password })
      });

      if (result.user.role !== "restaurantOwner") {
        setMessage("هذا الحساب ليس حساب صاحب مطعم.");
        return;
      }

      window.localStorage.setItem("menu-owner-token", result.token);
      window.location.href = "/owner/dashboard";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تسجيل الدخول.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-app-bg font-app text-app-ink" dir="rtl">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:px-8">
        <section className="order-2 hidden lg:block">
          <div className="rounded-app-lg border border-app-border bg-app-surface p-4">
            <div className="rounded-app-md border border-app-border bg-app-ink p-5 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-white/60">Owner Dashboard</p>
                  <h2 className="mt-1 text-2xl font-semibold">إدارة يومية واضحة</h2>
                  <p className="mt-2 max-w-sm text-sm leading-7 text-white/70">طلبات، أصناف، طاولات، وفوترة في واجهة واحدة هادئة.</p>
                </div>
                <div className="grid h-11 w-11 place-items-center rounded-app-md bg-white text-app-ink">
                  <LayoutDashboard className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-6 grid gap-3">
                <PreviewRow label="الأصناف" value="128 / 500" />
                <PreviewRow label="الطلبات المفتوحة" value="14" />
                <PreviewRow label="حالة الاشتراك" value="فعال" />
              </div>
            </div>
          </div>
        </section>

        <section className="order-1">
          <div className="mb-5 flex items-center justify-between gap-3">
            <Link href="/" className="inline-flex items-center gap-2 font-semibold text-app-ink" aria-label="DMenu">
              <span className="grid h-10 w-10 place-items-center rounded-app-md border border-app-border bg-app-primary-soft text-app-primary">
                <QrCode className="h-5 w-5" />
              </span>
              DMenu
            </Link>
            <Link href="/signup" className="text-sm font-semibold text-app-primary hover:underline">إنشاء حساب</Link>
          </div>

          <AppSurface className="p-5 sm:p-6">
            <form onSubmit={submit} className="grid gap-5">
              <div>
                <div className="grid h-11 w-11 place-items-center rounded-app-md border border-app-border bg-app-primary-soft text-app-primary">
                  <LockKeyhole className="h-5 w-5" />
                </div>
                <AppBadge variant="neutral" className="mt-4">لوحة صاحب المطعم</AppBadge>
                <h1 className="mt-3 text-2xl font-semibold text-app-ink">تسجيل الدخول</h1>
                <p className="mt-2 text-app-body leading-7 text-app-muted">استخدم الحساب الذي أنشأه المسؤول العام أو الذي سجلت به مطعمك.</p>
              </div>

              <div className="grid gap-3">
                <AppFieldShell label="البريد الإلكتروني">
                  <AppInput
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    autoComplete="email"
                  />
                </AppFieldShell>

                <AppFieldShell label="كلمة المرور">
                  <AppInput
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                  />
                </AppFieldShell>
              </div>

              {message ? <p className="rounded-app-md border border-app-danger-soft bg-app-danger-soft p-3 text-app-body font-semibold text-app-danger">{message}</p> : null}

              <AppButton type="submit" size="lg" loading={busy} iconEnd={<ArrowRight className="h-4 w-4" />} className="w-full">
                دخول
              </AppButton>

              <p className="text-center text-app-helper text-app-muted">
                لا تملك حساباً؟ <Link href="/signup" className="font-semibold text-app-primary hover:underline">ابدأ مع DMenu</Link>
              </p>
            </form>
          </AppSurface>
        </section>
      </div>
    </main>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-app-md border border-white/10 bg-white/5 px-3 py-2 text-sm">
      <span className="text-white/65">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}
