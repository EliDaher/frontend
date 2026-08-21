import type { Metadata } from "next";
import { headers } from "next/headers";
import { LandingPage } from "@/components/landing/LandingPage";
import { MenuTemplateRenderer } from "@/components/menu/MenuTemplateRenderer";
import { getRestaurantByDomain } from "@/lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "DMenu - القائمة الذكية لمطعمك",
  description: "حوّل منيو مطعمك إلى تجربة رقمية تفاعلية وأنيقة مع قوالب DMenu، لوحة تحكم، بحث سريع، وروابط جاهزة للمشاركة.",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "DMenu - القائمة الذكية لمطعمك",
    description: "أنشئ منيو إلكتروني سريع وجميل يعمل على الجوال ويدعم القوالب والباقات والدومين المخصص.",
    url: "/"
  }
};

export default async function HomePage() {
  const headerList = await headers();
  const host = headerList.get("host")?.split(":")[0] ?? "";
  const platformDomain = (process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "localhost").split(":")[0];
  const isPlatformHost =
    !host ||
    host === "localhost" ||
    host === "https://dmenu2.netlify.app/" ||
    host === "dmenu2.netlify.app" ||
    host === "127.0.0.1" ||
    host === platformDomain;

  if (!isPlatformHost) {
    try {
      const payload = await getRestaurantByDomain(host);
      return (
        <MenuTemplateRenderer
          restaurant={payload.restaurant}
          categories={payload.menu.categories}
          items={payload.menu.items}
        />
      );
    } catch {
      return (
        <main className="flex min-h-screen items-center justify-center bg-stone-950 px-5 text-center text-white" dir="rtl">
          <section className="max-w-md">
            <p className="text-sm font-semibold text-amber-300">الدومين غير مرتبط</p>
            <h1 className="mt-3 text-3xl font-black leading-tight">لم نجد منيو فعالاً لهذا الدومين.</h1>
            <p className="mt-4 leading-7 text-stone-300">تأكد من ربط الدومين وتفعيله من لوحة التحكم العامة.</p>
          </section>
        </main>
      );
    }
  }

  return <LandingPage />;
}
