"use client";

import Link from "next/link";
import {
  CheckCircle2,
  CreditCard,
  Globe2,
  ImageIcon,
  LayoutDashboard,
  Loader2,
  MessageCircle,
  Palette,
  QrCode,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  UserPlus
} from "lucide-react";
import type { ComponentType } from "react";
import { planLabels } from "@/lib/plans";
import type { BillingCycle, RestaurantPlan } from "@/types/menu";
import { slugify, useSignupForm } from "./useSignupForm";
import { FeatureCard, Field, ProductPreview, Proof } from "./SignupParts";

type Icon = ComponentType<{ className?: string }>;

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

const featureGroups = [
  {
    icon: Palette,
    title: "قوالب جاهزة للهوية",
    text: "Classic وCafe وPremium وPinza، مع ألوان كل مطعم بدون أن تصبح القوالب متشابهة."
  },
  {
    icon: Search,
    title: "بحث وتصنيفات واضحة",
    text: "بحث سريع، تصنيفات sticky، وبطاقات منتجات مصممة لقرار الطلب على الجوال."
  },
  {
    icon: LayoutDashboard,
    title: "لوحة صاحب مطعم",
    text: "تعديل الأصناف، الأقسام، الصور، القالب، والمعاينة قبل الحفظ من مكان واحد."
  },
  {
    icon: CreditCard,
    title: "SaaS جاهز للتفعيل اليدوي",
    text: "اشتراكات، حدود باقات، موافقة سوبر أدمن، وتمديد يدوي بعد الدفع."
  },
  {
    icon: ImageIcon,
    title: "صور بدون تعقيد",
    text: "رفع الصور عبر backend إلى Cloudinary مع إبقاء رابط الصورة كخيار احتياطي."
  },
  {
    icon: Globe2,
    title: "دومين مخصص للباقات العليا",
    text: "ربط custom domain للباقات Premium مع تحقق إداري في نسخة MVP."
  }
];

const previewItems = [
  { name: "برغر دجاج كرسبي", category: "الأكثر طلباً", price: "28,000 SYP", badge: "Popular" },
  { name: "لاتيه فانيلا", category: "مشروبات", price: "14,000 SYP", badge: "New" },
  { name: "بيتزا رانش", category: "عروض اليوم", price: "42,000 SYP", badge: "Pinza" }
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
    <main className="min-h-screen overflow-hidden bg-[#f7f3ec] text-[#17120d]" dir="rtl">
      <section className="relative isolate min-h-screen px-4 py-5 sm:px-6 lg:px-8">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_18%,rgba(245,158,11,0.18),transparent_30%),radial-gradient(circle_at_82%_8%,rgba(15,23,42,0.11),transparent_34%),linear-gradient(180deg,#fffaf2_0%,#f7f3ec_62%,#efe7d7_100%)]" />
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-black text-slate-950" aria-label="منصة المنيو الإلكتروني">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-slate-950 text-amber-300 shadow-[0_14px_30px_rgba(15,23,42,0.18)]">
              <QrCode className="h-5 w-5" />
            </span>
            منصة المنيو
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/owner/login" className="hidden rounded-md border border-slate-200 bg-white/70 px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-white sm:inline-flex">
              دخول المالك
            </Link>
            <Link href="/elidaher" className="inline-flex rounded-md bg-slate-950 px-4 py-2 text-sm font-black text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5">
              مثال مباشر
            </Link>
          </div>
        </div>

        <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-7xl items-center gap-8 py-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-amber-200 bg-white/70 px-3 py-2 text-xs font-black text-amber-800 shadow-sm backdrop-blur">
              <Sparkles className="h-4 w-4" />
              SaaS منيو إلكتروني للمطاعم والكافيهات
            </div>

            <div className="max-w-3xl">
              <h1 className="text-4xl font-black leading-[1.12] tracking-normal text-slate-950 sm:text-5xl lg:text-6xl">
                منيو إلكتروني Premium يظهر قيمة مطعمك من أول مسحة.
              </h1>
              <p className="mt-5 max-w-2xl text-base font-bold leading-8 text-slate-600 sm:text-lg">
                أنشئ منيو سريع للجوال، اختر قالباً مناسباً لهوية مطعمك، أضف الصور والأقسام، ثم فعّل الاشتراك يدوياً من لوحة السوبر أدمن.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Proof value="4+" label="قوالب مختلفة" />
              <Proof value="500" label="صنف في Premium" />
              <Proof value="RTL" label="جاهز للعربية" />
            </div>

            <ProductPreview />
          </div>

          <section id="signup" className="rounded-lg border border-white/70 bg-white/85 p-4 shadow-[0_32px_90px_rgba(80,52,20,0.18)] backdrop-blur sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black text-amber-700">ابدأ الآن</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">سجل مطعمك</h2>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-500">سيتم إنشاء الحساب بحالة انتظار الموافقة.</p>
              </div>
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-amber-300 text-slate-950">
                <UserPlus className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-black text-emerald-900">تفعيل الاشتراك يتم يدوياً</p>
                  <p className="mt-1 text-xs font-bold leading-6 text-emerald-800">
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
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-700"
                    >
                      <MessageCircle className="h-4 w-4" />
                      {contact.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <form onSubmit={submit} className="mt-5 grid gap-3">
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
                <label className="space-y-1 text-sm font-black">
                  <span>دورة الدفع</span>
                  <select
                    value={billingCycle}
                    onChange={(event) => setBillingCycle(event.target.value as BillingCycle)}
                    className="h-12 w-full rounded-md border border-slate-200 bg-white px-3 font-bold text-slate-950 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                  >
                    <option value="monthly">شهري</option>
                    <option value="yearly">سنوي</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 sm:grid-cols-3">
                {plans.map((currentPlan) => (
                  <button
                    key={currentPlan.id}
                    type="button"
                    onClick={() => setPlan(currentPlan.id)}
                    className={`rounded-md border p-3 text-right transition ${
                      plan === currentPlan.id ? "border-slate-950 bg-slate-950 text-white shadow-sm" : "border-transparent bg-white text-slate-700 hover:border-amber-300"
                    }`}
                  >
                    <p className="font-black">{planLabels[currentPlan.id]}</p>
                    <p className={`mt-1 text-xs font-bold leading-5 ${plan === currentPlan.id ? "text-zinc-300" : "text-slate-500"}`}>{currentPlan.limit}</p>
                  </button>
                ))}
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-black text-amber-900">{selectedPlan.title}: {selectedPlan.subtitle}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedPlan.features.map((feature) => (
                    <span key={feature} className="rounded-full bg-white px-3 py-1 text-xs font-black text-amber-800 ring-1 ring-amber-100">
                      {feature}
                    </span>
                  ))}
                </div>
              </div>

              {message ? (
                <div className={`rounded-md border p-3 text-sm font-bold leading-6 ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
                  <div className="flex items-start gap-2">
                    {message.type === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : null}
                    <span>{message.text}</span>
                  </div>
                  {message.type === "success" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href="/owner/dashboard" className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-600 px-4 font-black text-white">
                        <Store className="h-4 w-4" />
                        فتح لوحة المطعم
                      </Link>
                      <Link href="/owner/billing" className="inline-flex h-10 items-center gap-2 rounded-md border border-emerald-200 bg-white px-4 font-black text-emerald-800">
                        حالة الاشتراك
                      </Link>
                      {supportWhatsappContacts.map((contact) => (
                        <a
                          key={contact.url}
                          href={contact.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 font-black text-white"
                        >
                          <MessageCircle className="h-4 w-4" />
                          {contact.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <button
                disabled={busy || !slugIsValid || !passwordIsReady}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-amber-400 px-4 font-black text-slate-950 shadow-[0_18px_40px_rgba(245,158,11,0.25)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                إنشاء الحساب وطلب التفعيل
              </button>

              <p className="text-center text-xs font-bold leading-6 text-slate-500">
                لديك حساب؟ <Link href="/owner/login" className="font-black text-slate-950 underline underline-offset-4">ادخل إلى لوحة المالك</Link>
              </p>
            </form>
          </section>
        </div>
      </section>

      <section className="border-y border-black/5 bg-white px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-xs font-black text-amber-700">ما الذي يحصل عليه صاحب المطعم؟</p>
            <h2 className="mt-2 text-3xl font-black text-slate-950">كل شيء واضح من أول زيارة للزبون.</h2>
          </div>
          <div className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {featureGroups.map((feature) => (
              <FeatureCard key={feature.title} icon={feature.icon} title={feature.title} text={feature.text} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#11100f] px-4 py-12 text-white sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-xs font-black text-amber-300">قوالب المنيو</p>
            <h2 className="mt-2 text-3xl font-black leading-tight">ليست مجرد ألوان. كل قالب له تجربة مختلفة.</h2>
            <p className="mt-4 text-sm font-bold leading-7 text-zinc-300">
              اختر قالباً عملياً للمطعم، دافئاً للكافيه، فاخراً للهوية Premium، أو بصرياً قوياً بطريقة Pinza.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {["Classic", "Cafe", "Premium", "Pinza"].map((template, index) => (
              <div key={template} className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
                <div className={`mb-4 h-24 rounded-md ${index === 0 ? "bg-stone-100" : index === 1 ? "bg-orange-200" : index === 2 ? "bg-gradient-to-br from-zinc-900 to-amber-600" : "bg-gradient-to-br from-white to-amber-300"}`} />
                <p className="font-black">{template}</p>
                <p className="mt-2 text-xs font-bold leading-5 text-zinc-300">
                  {index === 0 ? "قائمة عملية واضحة" : index === 1 ? "إحساس كافيه دافئ" : index === 2 ? "Glass وفخامة" : "معرض منتجات بصري"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
