import {
  Globe2,
  ImageIcon,
  Palette,
  QrCode,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Users
} from "lucide-react";
import type { ComponentType } from "react";
import { planLabels, planLimits, planTemplates, templateLabels } from "@/lib/plans";
import type { MenuTemplate, RestaurantPlan } from "@/types/menu";

type Icon = ComponentType<{ className?: string }>;

export const landingRoutes = {
  home: "#top",
  signup: "/signup",
  login: "/owner/login",
  demo: "/elidaher",
  features: "#features",
  templates: "#templates",
  pricing: "#pricing"
};

export const landingImages = {
  hero: "/landing/hero/hero-dashboard.jpg",
  product: "/landing/product/product-sync.jpg",
  templates: {
    premium: "/landing/templates/template-premium.jpg",
    cafe: "/landing/templates/template-cafe.jpg",
    pinza: "/landing/templates/template-pinza.jpg"
  }
};

export const productSteps = [
  "أنشئ مطعمك",
  "أضف المنيو الخاص بك",
  "شارك الرابط أو QR"
];

export const capabilities: Array<{ icon: Icon; title: string; text: string }> = [
  {
    icon: Store,
    title: "إدارة المنيو",
    text: "أضف الأقسام والأصناف، حدّث الأسعار، وأخفِ المنتجات غير المتوفرة من لوحة صاحب المطعم."
  },
  {
    icon: Palette,
    title: "الهوية والتصميم",
    text: "اختر القالب المتاح ضمن باقتك واضبط ألوان المطعم وصوره بدون المساس ببيانات التشغيل."
  },
  {
    icon: Search,
    title: "تجربة العميل",
    text: "بحث سريع، تصنيفات واضحة، وتجربة RTL مصممة لتصفح المنيو على الجوال أولاً."
  },
  {
    icon: QrCode,
    title: "المشاركة و QR",
    text: "رابط منيو مباشر يصلح للطباعة على الطاولات والمشاركة مع العملاء فور تفعيل الاشتراك."
  },
  {
    icon: ShieldCheck,
    title: "اشتراكات وتفعيل يدوي",
    text: "إنشاء الحساب يضع المطعم بانتظار الموافقة، ثم يتم التفعيل بعد تأكيد الدفع مع الإدارة."
  },
  {
    icon: Globe2,
    title: "دومين مخصص",
    text: "الدومين المخصص متاح للباقات التي تسمح به، مع تحقق إداري قبل عرض المنيو على النطاق."
  }
];

export const templateShowcase: Array<{
  id: MenuTemplate;
  label: string;
  description: string;
  image: string;
  size: "large" | "medium" | "small";
}> = [
  {
    id: "premium",
    label: templateLabels.premium,
    description: "هوية فاخرة وقسم منتجات مميزة",
    image: landingImages.templates.premium,
    size: "large"
  },
  {
    id: "cafe",
    label: templateLabels.cafe,
    description: "إحساس كافيه دافئ وواضح",
    image: landingImages.templates.cafe,
    size: "medium"
  },
  {
    id: "pinza",
    label: templateLabels.pinza,
    description: "معرض منتجات بصري وجريء",
    image: landingImages.templates.pinza,
    size: "small"
  }
];

const planOrder: RestaurantPlan[] = ["basic", "standard", "premium"];

export const pricingPlans = planOrder.map((plan) => {
  const limits = planLimits[plan];
  const templates = planTemplates[plan].map((template) => templateLabels[template]).join("، ");

  return {
    id: plan,
    name: planLabels[plan],
    eyebrow: plan === "standard" ? "الأكثر توازناً" : "",
    description:
      plan === "basic"
        ? "للمطاعم والمقاهي التي تبدأ بمنيو رقمي واضح."
        : plan === "standard"
          ? "للمطاعم النشطة التي تحتاج تجربة أوسع وميزات تشغيل."
          : "للهويات الأقوى والفرق التي تحتاج تخصيصاً وتشغيلاً متقدماً.",
    priceLabel: "تفعيل يدوي",
    cadence: "شهري أو سنوي حسب الاتفاق",
    features: [
      `${limits.maxCategories} قسم / ${limits.maxItems} صنف`,
      `القوالب: ${templates}`,
      limits.allowFeatured
        ? "منتجات مميزة وبادجات ودومين مخصص"
        : limits.allowBadges
          ? "بادجات المنتجات وميزات تشغيل أوسع"
          : "منيو أساسي على دومين المنصة"
    ],
    cta: plan === "premium" ? "اطلب Premium" : plan === "standard" ? "اختر Standard" : "ابدأ Basic",
    highlighted: plan === "standard"
  };
});

const supportWhatsappMessage = "مرحبا، أريد معرفة المزيد عن DMenu.";
const supportWhatsappNumber = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_NUMBER ?? "963947089514").replace(/\D/g, "");

export const footerLinks = [
  { label: "المميزات", href: landingRoutes.features },
  { label: "القوالب", href: landingRoutes.templates },
  { label: "الأسعار", href: landingRoutes.pricing },
  { label: "مثال مباشر", href: landingRoutes.demo },
  { label: "تسجيل الدخول", href: landingRoutes.login },
  { label: "ابدأ الآن", href: landingRoutes.signup },
  {
    label: "تواصل معنا",
    href: `https://wa.me/${supportWhatsappNumber}?text=${encodeURIComponent(supportWhatsappMessage)}`,
    external: true
  }
];

export const supportNotes = [
  { icon: Sparkles, label: "جاهز للعربية" },
  { icon: ImageIcon, label: "صور وقوالب" },
  { icon: Users, label: "تفعيل بإشراف الإدارة" }
];
