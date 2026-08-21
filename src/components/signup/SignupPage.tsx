"use client";

import Link from "next/link";
import {
  CheckCircle2,
  Loader2,
  MessageCircle,
  QrCode,
  Store,
  UserPlus
} from "lucide-react";
import type { ReactNode } from "react";
import { AppBadge, AppButton, AppFieldShell, AppSelect, AppSurface, cn } from "@/components/shared";
import { planLabels } from "@/lib/plans";
import type { BillingCycle, RestaurantPlan } from "@/types/menu";
import { slugify, useSignupForm } from "./useSignupForm";
import { Field, ProductPreview } from "./SignupParts";

const plans: Array<{
  id: RestaurantPlan;
  title: string;
  subtitle: string;
  limit: string;
  features: string[];
}> = [
  {
    id: "basic",
    title: "Basic",
    subtitle: "للبداية السريعة",
    limit: "5 أقسام / 50 صنف",
    features: ["قوالب Minimal وClassic", "منيو سريع وخفيف", "مناسب للمطاعم الصغيرة"]
  },
  {
    id: "standard",
    title: "Standard",
    subtitle: "للمطاعم النشطة",
    limit: "15 قسم / 150 صنف",
    features: ["قالب Cafe", "صور وبادجات", "تجربة أوضح للجوال"]
  },
  {
    id: "premium",
    title: "Premium",
    subtitle: "للهوية الأقوى",
    limit: "50 قسم / 500 صنف",
    features: ["قوالب Premium وPinza", "منتجات مميزة", "دومين مخصص"]
  }
];

const supportWhatsappMessage = "مرحبا، أنشأت حساب مطعم وأريد تفعيل الاشتراك.";
const supportWhatsappContacts = [
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_NUMBER ?? "963947089514",
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_NUMBER_SECOND ?? "963993822320"
]
  .map((number) => number.replace(/\D/g, ""))
  .filter(Boolean)
  .filter((number, index, allNumbers) => allNumbers.indexOf(number) === index)
  .map((number, index) => ({
    label: `واتساب ${index + 1}`,
    display: `+${number}`,
    url: `https://wa.me/${number}?text=${encodeURIComponent(supportWhatsappMessage)}`
  }));
const supportWhatsappDisplay = supportWhatsappContacts.map((contact) => contact.display).join(" / ");

export function SignupPage() {
  const {
    ownerName,
    setOwnerName,
    email,
    setEmail,
    password,
    setPassword,
    restaurantName,
    setRestaurantName,
    slug,
    setSlug,
    phone,
    setPhone,
    address,
    setAddress,
    plan,
    setPlan,
    billingCycle,
    setBillingCycle,
    busy,
    message,
    selectedPlan,
    slugIsValid,
    passwordIsReady,
    submit
  } = useSignupForm();

  return (
    <main className="min-h-screen bg-app-bg font-app text-app-ink" dir="rtl">
      <section className="px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2 font-semibold text-app-ink" aria-label="DMenu">
            <span className="grid h-10 w-10 place-items-center rounded-app-md border border-app-border bg-app-primary-soft text-app-primary">
              <QrCode className="h-5 w-5" />
            </span>
            DMenu
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/owner/login" className="hidden h-10 items-center rounded-app-md border border-app-border bg-app-surface px-3 text-sm font-semibold text-app-ink transition-colors hover:bg-app-surface-muted sm:inline-flex">
              دخول المالك
            </Link>
            <Link href="/elidaher" className="inline-flex h-10 items-center rounded-app-md bg-app-ink px-3 text-sm font-semibold text-white transition-colors hover:bg-black">
              مثال مباشر
            </Link>
          </div>
        </div>

        <div className="mx-auto grid max-w-7xl gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:items-start">
          <aside className="hidden lg:block">
            <div className="sticky top-8 grid gap-5">
              <div>
                <AppBadge variant="primary">SaaS منيو إلكتروني</AppBadge>
                <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight text-app-ink">
                  ابدأ مع DMenu وأنشئ حساب مطعمك.
                </h1>
                <p className="mt-4 max-w-xl text-app-body leading-8 text-app-muted">
                  أنشئ حساب صاحب مطعم، اختر الباقة، ثم فعّل الاشتراك يدوياً بعد تأكيد الدفع.
                </p>
              </div>
              <ProductPreview />
            </div>
          </aside>

          <AppSurface className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <AppBadge variant="neutral">طلب تفعيل جديد</AppBadge>
                <h2 className="mt-3 text-2xl font-semibold text-app-ink">سجل مطعمك</h2>
                <p className="mt-2 text-app-body leading-6 text-app-muted">سيتم إنشاء الحساب بحالة انتظار الموافقة.</p>
              </div>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-app-md border border-app-border bg-app-primary-soft text-app-primary">
                <UserPlus className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-4 rounded-app-md border border-app-success-soft bg-app-success-soft p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-app-body font-semibold text-app-success">تفعيل الاشتراك يتم يدوياً</p>
                  <p className="mt-1 text-app-helper leading-6 text-app-success">
                    بعد إنشاء الحساب تواصل معنا على واتساب لتأكيد الدفع وتفعيل المنيو. الرقم: {supportWhatsappDisplay}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {supportWhatsappContacts.map((contact) => (
                    <a
                      key={contact.url}
                      href={contact.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-app-md bg-app-success px-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-800"
                    >
                      <MessageCircle className="h-4 w-4" />
                      {contact.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <form onSubmit={submit} className="mt-5 grid gap-5">
              <FormGroup title="الحساب والمطعم">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="اسم المالك" value={ownerName} onChange={setOwnerName} autoComplete="name" />
                  <Field label="البريد الإلكتروني" value={email} onChange={setEmail} type="email" autoComplete="email" />
                  <Field label="كلمة المرور" value={password} onChange={setPassword} type="password" autoComplete="new-password" hint={password ? (passwordIsReady ? "كلمة المرور مناسبة." : "6 أحرف على الأقل.") : "6 أحرف على الأقل."} valid={password ? passwordIsReady : undefined} />
                  <Field
                    label="اسم المطعم"
                    value={restaurantName}
                    onChange={(value) => {
                      setRestaurantName(value);
                      if (!slug) setSlug(slugify(value));
                    }}
                    autoComplete="organization"
                  />
                  <Field label="رابط المنيو" value={slug} onChange={(value) => setSlug(slugify(value))} prefix="/" placeholder="honor-cafe" hint={slug ? (slugIsValid ? "الرابط جاهز." : "استخدم حروفاً إنجليزية صغيرة وأرقاماً وشرطات.") : "مثال: burger-house"} valid={slug ? slugIsValid : undefined} />
                  <Field label="الهاتف" value={phone} onChange={setPhone} type="tel" autoComplete="tel" />
                  <Field label="العنوان" value={address} onChange={setAddress} wide required={false} autoComplete="street-address" />
                  <AppFieldShell label="دورة الدفع">
                    <AppSelect
                      value={billingCycle}
                      onChange={(event) => setBillingCycle(event.target.value as BillingCycle)}
                    >
                      <option value="monthly">شهري</option>
                      <option value="yearly">سنوي</option>
                    </AppSelect>
                  </AppFieldShell>
                </div>
              </FormGroup>

              <FormGroup title="الباقة">
                <div className="grid gap-2 sm:grid-cols-3">
                  {plans.map((currentPlan) => (
                    <button
                      key={currentPlan.id}
                      type="button"
                      onClick={() => setPlan(currentPlan.id)}
                      className={cn(
                        "min-h-24 rounded-app-md border p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft",
                        plan === currentPlan.id ? "border-app-primary bg-app-primary-soft text-app-primary" : "border-app-border bg-app-surface text-app-ink hover:bg-app-surface-muted"
                      )}
                    >
                      <p className="font-semibold">{planLabels[currentPlan.id]}</p>
                      <p className={cn("mt-1 text-app-helper leading-5", plan === currentPlan.id ? "text-app-primary" : "text-app-muted")}>{currentPlan.limit}</p>
                    </button>
                  ))}
                </div>

                <div className="mt-3 rounded-app-md border border-app-border bg-app-surface-muted p-3">
                  <p className="text-app-body font-semibold text-app-ink">{selectedPlan.title}: {selectedPlan.subtitle}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedPlan.features.map((feature) => (
                      <span key={feature} className="rounded-app-sm border border-app-border bg-app-surface px-2 py-1 text-xs font-semibold text-app-muted">
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              </FormGroup>

              {message ? (
                <div className={cn("rounded-app-md border p-3 text-app-body font-semibold leading-6", message.type === "success" ? "border-app-success-soft bg-app-success-soft text-app-success" : "border-app-danger-soft bg-app-danger-soft text-app-danger")}>
                  <div className="flex items-start gap-2">
                    {message.type === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : null}
                    <span>{message.text}</span>
                  </div>
                  {message.type === "success" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href="/owner/dashboard" className="inline-flex h-10 items-center gap-2 rounded-app-md bg-app-success px-3 text-sm font-semibold text-white">
                        <Store className="h-4 w-4" />
                        فتح لوحة المطعم
                      </Link>
                      <Link href="/owner/billing" className="inline-flex h-10 items-center gap-2 rounded-app-md border border-app-success-soft bg-app-surface px-3 text-sm font-semibold text-app-success">
                        حالة الاشتراك
                      </Link>
                      {supportWhatsappContacts.map((contact) => (
                        <a
                          key={contact.url}
                          href={contact.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-10 items-center gap-2 rounded-app-md bg-app-success px-3 text-sm font-semibold text-white"
                        >
                          <MessageCircle className="h-4 w-4" />
                          {contact.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <AppButton type="submit" size="lg" loading={busy} disabled={busy || !slugIsValid || !passwordIsReady} iconStart={!busy ? <UserPlus className="h-4 w-4" /> : undefined} className="w-full">
                إنشاء الحساب وطلب التفعيل
              </AppButton>

              <p className="text-center text-app-helper text-app-muted">
                لديك حساب؟ <Link href="/owner/login" className="font-semibold text-app-primary hover:underline">ادخل إلى لوحة المالك</Link>
              </p>
            </form>
          </AppSurface>
        </div>
      </section>
    </main>
  );
}

function FormGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-app-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-app-panel-title font-semibold text-app-ink">{title}</h3>
      {children}
    </section>
  );
}
