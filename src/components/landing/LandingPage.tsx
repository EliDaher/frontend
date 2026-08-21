import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, ExternalLink, LogIn, QrCode } from "lucide-react";
import {
  capabilities,
  footerLinks,
  landingImages,
  landingRoutes,
  pricingPlans,
  productSteps,
  supportNotes,
  templateShowcase
} from "./landingData";

export function LandingPage() {
  return (
    <main id="top" className="min-h-screen overflow-x-hidden bg-landing-background font-landing text-landing-ink selection:bg-landing-indigo selection:text-white" dir="rtl">
      <LandingNavbar />
      <HeroSection />
      <EditorialStatement />
      <ProductExperience />
      <TemplateShowcase />
      <CapabilitiesSection />
      <PricingSection />
      <FinalCTA />
    </main>
  );
}

function LandingNavbar() {
  return (
    <nav className="sticky top-0 z-50 w-full bg-landing-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between border-b border-landing-border px-5 sm:px-6 lg:px-8">
        <Link href="/" aria-label="DMenu" className="text-lg font-bold leading-none tracking-normal text-landing-ink">
          DMenu
        </Link>

        <div className="hidden items-center gap-10 md:flex">
          <a className="text-sm font-medium text-landing-ink transition hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-landing-indigo" href={landingRoutes.home}>
            الرئيسية
          </a>
          <a className="text-sm font-medium text-landing-muted transition hover:text-landing-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-landing-indigo" href={landingRoutes.features}>
            المميزات
          </a>
          <a className="text-sm font-medium text-landing-muted transition hover:text-landing-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-landing-indigo" href={landingRoutes.templates}>
            القوالب
          </a>
          <a className="text-sm font-medium text-landing-muted transition hover:text-landing-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-landing-indigo" href={landingRoutes.pricing}>
            الأسعار
          </a>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={landingRoutes.login}
            className="hidden h-10 items-center gap-2 border border-landing-border bg-white px-4 text-sm font-semibold text-landing-ink transition hover:bg-landing-surface sm:inline-flex"
          >
            <LogIn className="h-4 w-4" />
            دخول
          </Link>
          <Link
            href={landingRoutes.signup}
            className="inline-flex h-10 items-center justify-center bg-landing-ink px-4 text-sm font-semibold text-white transition hover:bg-landing-ink/90 sm:px-5"
          >
            ابدأ الآن
          </Link>
        </div>
      </div>
    </nav>
  );
}

function HeroSection() {
  return (
    <section className="mx-auto grid min-h-[75vh] max-w-7xl grid-cols-1 items-center gap-10 px-5 pb-14 pt-10 sm:px-6 md:grid-cols-12 md:gap-12 md:pb-16 md:pt-12 lg:px-8">
      <div className="order-2 md:order-2 md:col-span-5">
        <div className="flex items-center gap-4">
          <span className="text-[13px] font-semibold uppercase leading-none tracking-normal text-landing-muted">
            DMenu - منيو إلكتروني للمطاعم
          </span>
          <span className="h-px w-10 bg-landing-muted/30" />
        </div>

        <h1 className="mt-5 max-w-[11ch] text-[40px] font-semibold leading-[1.14] tracking-normal text-landing-ink sm:text-5xl md:text-[64px] md:leading-[1.08]">
          منيو مطعمك، بطريقة تليق بعلامتك.
        </h1>

        <p className="mt-6 max-w-md text-base font-normal leading-8 text-landing-secondary sm:text-lg">
          تخلص من قوائم PDF التقليدية. أنشئ قائمة طعام تفاعلية، سريعة، ومصممة بأناقة تعكس هوية مطعمك في دقائق معدودة.
        </p>

        <div className="mt-10 flex flex-col gap-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Link
              href={landingRoutes.signup}
              className="inline-flex min-h-12 items-center justify-center bg-landing-indigo px-8 py-3 text-base font-medium text-white transition hover:bg-landing-indigo/90"
            >
              أنشئ منيو مطعمك
            </Link>
            <Link
              href={landingRoutes.demo}
              className="group inline-flex min-h-12 items-center gap-2 text-base font-medium text-landing-ink transition hover:opacity-70"
            >
              شاهد مثالاً مباشراً
              <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-1" />
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-normal text-landing-muted">
            {supportNotes.map((note, index) => {
              const Icon = note.icon;
              return (
                <span key={note.label} className="inline-flex items-center gap-2">
                  {index > 0 ? <span className="text-landing-border">·</span> : null}
                  <Icon className="h-4 w-4 text-landing-indigo" />
                  {note.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="order-1 md:order-1 md:col-span-7">
        <div className="relative mx-auto aspect-[1.42] w-full max-w-[760px] overflow-hidden bg-white shadow-landing-soft md:translate-x-6">
          <Image
            src={landingImages.hero}
            alt="واجهة DMenu لإدارة وعرض منيو مطعم عربي"
            fill
            priority
            fetchPriority="high"
            sizes="(max-width: 768px) 100vw, 760px"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}

function EditorialStatement() {
  return (
    <section className="mx-auto max-w-4xl border-y border-landing-border px-5 py-14 text-center sm:px-6 md:py-16">
      <h2 className="text-3xl font-semibold leading-tight text-landing-ink">المنيو الخاص بك ليس ملف PDF ثابت.</h2>
      <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-landing-secondary sm:text-lg">
        غيّر السعر أو الصورة أو الصنف، وسيظهر التحديث مباشرة لزبائنك دون إعادة طباعة.
      </p>
    </section>
  );
}

function ProductExperience() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
      <div className="text-center">
        <h2 className="mx-auto max-w-4xl text-[40px] font-semibold leading-[1.16] tracking-normal text-landing-ink md:text-[64px] md:leading-[1.08]">
          عدّل مرة واحدة.
          <br />
          وشاهده مباشرة في المنيو الخاص بك.
        </h2>
      </div>

      <div className="relative mt-14 w-full overflow-hidden rounded-landing-lg bg-white shadow-landing-soft">
        <Image
          src={landingImages.product}
          alt="مزامنة لوحة DMenu مع منيو الجوال"
          width={1420}
          height={740}
          loading="lazy"
          sizes="(max-width: 768px) 100vw, 1280px"
          className="h-auto w-full object-cover"
        />
      </div>

      <div className="mt-12 flex flex-col gap-5 border-t border-landing-border pt-10 text-center md:flex-row md:items-center md:justify-between md:text-right">
        {productSteps.map((step, index) => (
          <div key={step} className="flex min-w-0 flex-1 items-center justify-center gap-4 md:justify-start">
            <span className="text-[13px] font-semibold leading-none tracking-normal text-landing-indigo">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="text-lg font-medium text-landing-ink">{step}</span>
            {index < productSteps.length - 1 ? <span className="hidden h-px flex-1 bg-landing-border md:block" /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function TemplateShowcase() {
  return (
    <section id="templates" className="relative w-full scroll-mt-20 overflow-hidden bg-landing-ink py-20 text-white md:py-24">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-6 lg:px-8">
        <div className="mb-12 flex flex-col items-start justify-between gap-8 md:mb-16 md:flex-row md:items-end">
          <h2 className="max-w-2xl text-[40px] font-semibold leading-[1.15] tracking-normal md:text-[64px] md:leading-[1.08]">
            مطعمك له شخصية.
            <br />
            المنيو الخاص بك أيضاً.
          </h2>
          <Link
            href={landingRoutes.signup}
            className="group inline-flex items-center gap-2 border-b border-white pb-1 text-sm font-semibold leading-none text-white transition hover:text-white/70"
          >
            استكشف القوالب المتاحة
            <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-1" />
          </Link>
        </div>

        <div className="hide-scrollbar flex h-[420px] w-full max-w-full snap-x snap-mandatory items-center gap-6 overflow-x-auto pb-2 md:h-[500px] md:gap-8" dir="ltr">
          {templateShowcase.map((template) => (
            <article
              key={template.id}
              dir="rtl"
              className={`relative h-full shrink-0 snap-center ${
                template.size === "large"
                  ? "w-[78vw] md:w-[60%]"
                  : template.size === "medium"
                    ? "h-[82%] w-[62vw] opacity-75 transition hover:opacity-100 md:w-[35%]"
                    : "h-[72%] w-[54vw] opacity-55 transition hover:opacity-100 md:w-[25%]"
              }`}
            >
              <div className="relative h-full overflow-hidden rounded-[2rem] border-4 border-[#2a2a30] bg-black shadow-landing-dark">
                <Image
                  src={template.image}
                  alt={`قالب ${template.label} في DMenu`}
                  fill
                  loading="lazy"
                  sizes="(max-width: 768px) 80vw, 760px"
                  className="object-cover opacity-90"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6 text-center md:bottom-8 md:left-8 md:right-8">
                  <h3 className="text-xl font-semibold uppercase tracking-normal md:text-2xl">{template.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/70">{template.description}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CapabilitiesSection() {
  return (
    <section id="features" className="mx-auto max-w-7xl scroll-mt-20 bg-landing-background px-5 py-20 sm:px-6 md:py-24 lg:px-8">
      <div className="mb-14 flex flex-col items-start gap-4">
        <h2 className="max-w-4xl text-[40px] font-semibold leading-[1.15] tracking-normal text-landing-ink md:text-[64px] md:leading-[1.08]">
          كل ما تحتاجه لإدارة المنيو الخاص بك.
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-x-24 gap-y-0 border-t border-landing-border md:grid-cols-2">
        {capabilities.map((capability) => {
          const Icon = capability.icon;
          return (
            <article key={capability.title} className="grid grid-cols-[40px_1fr] gap-4 border-b border-landing-border py-7">
              <div className="grid h-10 w-10 place-items-center border border-landing-border bg-white text-landing-indigo">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-medium text-landing-ink">{capability.title}</h3>
                <p className="mt-3 text-sm leading-7 text-landing-secondary sm:text-base">{capability.text}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section id="pricing" className="mx-auto max-w-7xl scroll-mt-20 bg-landing-background px-5 py-20 sm:px-6 md:py-24 lg:px-8">
      <div className="mb-14">
        <h2 className="max-w-4xl text-[40px] font-semibold leading-[1.15] tracking-normal text-landing-ink md:text-[64px] md:leading-[1.08]">
          اختر ما يناسب حجم مطعمك.
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-8 text-landing-secondary">
          الأسعار لا تُعرض كأرقام ثابتة داخل التطبيق حالياً. اختر الباقة المناسبة وسيتم التفعيل يدوياً بعد التواصل مع الإدارة.
        </p>
      </div>

      <div className="grid grid-cols-1 border-y border-landing-border md:grid-cols-3">
        {pricingPlans.map((plan) => (
          <article
            key={plan.id}
            className={`relative flex flex-col py-10 md:min-h-[520px] md:px-8 ${
              plan.highlighted ? "border-t-4 border-t-landing-indigo md:border-x md:border-x-landing-border" : ""
            } ${!plan.highlighted ? "md:border-l md:border-l-landing-border last:md:border-l-0" : ""}`}
          >
            {plan.eyebrow ? (
              <span className="absolute right-0 top-4 text-[13px] font-semibold leading-none tracking-normal text-landing-indigo md:right-8">
                {plan.eyebrow}
              </span>
            ) : null}

            <div className="mb-8 pt-5">
              <h3 className="text-2xl font-medium text-landing-ink">{plan.name}</h3>
              <div className="mt-4 text-4xl font-semibold leading-tight text-landing-ink">{plan.priceLabel}</div>
              <p className="mt-2 text-sm leading-7 text-landing-secondary">{plan.cadence}</p>
              <p className="mt-4 text-sm leading-7 text-landing-secondary">{plan.description}</p>
            </div>

            <ul className="mb-10 flex flex-1 flex-col gap-4 text-sm text-landing-ink">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 border-b border-landing-border pb-3">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-landing-indigo" />
                  <span className="leading-7">{feature}</span>
                </li>
              ))}
            </ul>

            <Link
              href={landingRoutes.signup}
              className={`inline-flex h-12 w-full items-center justify-center text-sm font-semibold transition ${
                plan.highlighted
                  ? "bg-landing-indigo text-white hover:bg-landing-indigo/90"
                  : "border border-landing-ink text-landing-ink hover:bg-landing-ink hover:text-white"
              }`}
            >
              {plan.cta}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="w-full bg-landing-indigo pt-24 text-center text-white md:pt-32">
      <div className="mx-auto mb-20 max-w-4xl px-5 sm:px-6 md:mb-24">
        <h2 className="text-[40px] font-semibold leading-[1.14] tracking-normal md:text-[72px] md:leading-[1.08]">
          منيو أفضل يبدأ من هنا.
        </h2>
        <div className="mt-10 flex flex-col items-center gap-5">
          <Link href={landingRoutes.signup} className="inline-flex h-12 items-center justify-center bg-white px-10 text-lg font-medium text-landing-indigo transition hover:bg-landing-surface">
            أنشئ حسابك مجاناً
          </Link>
          <Link href={landingRoutes.login} className="group inline-flex min-h-10 items-center gap-2 text-base text-white/80 transition hover:text-white">
            دخول أصحاب المطاعم
            <ExternalLink className="h-4 w-4 transition group-hover:-translate-x-1" />
          </Link>
        </div>
      </div>

      <LandingFooter />
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="w-full border-t border-white/20 py-8 text-right">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-5 sm:px-6 md:grid-cols-12 lg:px-8">
        <div className="md:col-span-4">
          <div className="flex items-center gap-3 text-2xl font-bold">
            <QrCode className="h-6 w-6" />
            DMenu
          </div>
          <p className="mt-4 text-sm leading-7 text-white/70">
            DMenu. All rights reserved.
            <br />
            Built for the modern restaurateur.
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-x-8 gap-y-4 text-sm text-white/80 md:col-span-8 md:justify-end">
          {footerLinks.map((link) =>
            link.external ? (
              <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className="transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                {link.label}
              </a>
            ) : (
              <Link key={link.label} href={link.href} className="transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                {link.label}
              </Link>
            )
          )}
        </div>
      </div>
    </footer>
  );
}
