import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  display: "swap",
  variable: "--font-cairo"
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      "https://restaurantsserver.onrender.com",
  ),
  title: {
    default: "منصة منيو إلكتروني للمطاعم والكافيهات",
    template: "%s | منصة المنيو الإلكتروني",
  },
  description:
    "منصة SaaS لإطلاق منيو إلكتروني سريع وجميل للمطاعم والكافيهات مع قوالب احترافية، لوحة تحكم، باقات، ورفع صور.",
  applicationName: "منصة المنيو الإلكتروني",
  keywords: [
    "منيو إلكتروني",
    "منيو مطاعم",
    "QR menu",
    "منيو كافيه",
    "SaaS restaurants",
    "لوحة تحكم مطاعم",
  ],
  authors: [{ name: "منصة المنيو الإلكتروني" }],
  creator: "منصة المنيو الإلكتروني",
  publisher: "منصة المنيو الإلكتروني",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "ar_SY",
    title: "منصة منيو إلكتروني للمطاعم والكافيهات",
    description:
      "أنشئ منيو إلكتروني احترافي مع قوالب متعددة، بحث سريع، صور، باقات، ولوحة تحكم لصاحب المطعم.",
    siteName: "منصة المنيو الإلكتروني",
  },
  twitter: {
    card: "summary_large_image",
    title: "منصة منيو إلكتروني للمطاعم والكافيهات",
    description: "منصة SaaS خفيفة وسريعة لإدارة منيو المطاعم والكافيهات.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body>{children}</body>
    </html>
  );
}
