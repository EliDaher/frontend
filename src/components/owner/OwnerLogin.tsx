"use client";

import { ArrowRight, LockKeyhole } from "lucide-react";
import { FormEvent, useState } from "react";
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
    <main className="min-h-screen bg-[#0d0f14] px-4 py-10 text-white" dir="rtl">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-5xl items-center gap-8 lg:grid-cols-[1fr_420px]">
        <section className="space-y-5">
          <span className="inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-xs font-black text-amber-200">
            لوحة صاحب المطعم
          </span>
          <h1 className="max-w-2xl text-4xl font-black leading-tight sm:text-5xl">
            إدارة منيوك، تصميمك، وأصنافك من مكان واحد.
          </h1>
          <p className="max-w-xl text-base font-semibold leading-8 text-zinc-300">
            دخول مخصص لصاحب كل مطعم. سترى مطعمك فقط، وتعدل البيانات والتصميم والمنيو حسب الباقة المفعلة.
          </p>
        </section>

        <form onSubmit={submit} className="rounded-lg border border-white/10 bg-white/[0.07] p-5 shadow-[0_32px_90px_rgba(0,0,0,0.4)] backdrop-blur">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md bg-amber-300 text-zinc-950">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <h2 className="text-2xl font-black">تسجيل الدخول</h2>
          <p className="mt-2 text-sm font-semibold leading-7 text-zinc-300">استخدم الحساب الذي أنشأه المسؤول العام لمطعمك.</p>

          <label className="mt-5 block text-sm font-black">
            البريد الإلكتروني
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              className="mt-2 h-12 w-full rounded-md border border-white/10 bg-white/10 px-3 text-white outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-300/15"
            />
          </label>

          <label className="mt-4 block text-sm font-black">
            كلمة المرور
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              className="mt-2 h-12 w-full rounded-md border border-white/10 bg-white/10 px-3 text-white outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-300/15"
            />
          </label>

          {message ? <p className="mt-4 rounded-md border border-red-300/20 bg-red-500/15 p-3 text-sm font-bold text-red-100">{message}</p> : null}

          <button
            disabled={busy}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-amber-300 px-4 font-black text-zinc-950 transition hover:-translate-y-0.5 disabled:opacity-60"
          >
            دخول
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </main>
  );
}
