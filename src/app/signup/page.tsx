import type { Metadata } from "next";
import { SignupPage } from "@/components/signup/SignupPage";

export const metadata: Metadata = {
  title: "تسجيل مطعم جديد",
  description: "سجل مطعمك في منصة المنيو الإلكتروني وابدأ بإدارة منيو احترافي مع قوالب متعددة، صور، بحث سريع، وباقات SaaS.",
  alternates: {
    canonical: "/signup"
  },
  openGraph: {
    title: "تسجيل مطعم جديد في منصة المنيو الإلكتروني",
    description: "أنشئ حساب صاحب مطعم واطلب تفعيل منيو إلكتروني احترافي خلال دقائق.",
    url: "/signup"
  },
  twitter: {
    card: "summary_large_image",
    title: "تسجيل مطعم جديد",
    description: "ابدأ منيو إلكتروني احترافي للمطاعم والكافيهات."
  }
};

export default function Page() {
  return <SignupPage />;
}
