"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { adminRequest } from "@/lib/api";
import type { AuthUser, BillingCycle, RestaurantPlan } from "@/types/menu";

type SignupResponse = {
  token: string;
  user: AuthUser;
  restaurantId: string;
  subscriptionStatus: string;
};

const signupPlans: Array<{
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

export function useSignupForm() {
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [slug, setSlug] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [plan, setPlan] = useState<RestaurantPlan>("basic");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const selectedPlan = useMemo(() => signupPlans.find((currentPlan) => currentPlan.id === plan) ?? signupPlans[0], [plan]);
  const slugIsValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
  const passwordIsReady = password.length >= 6;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const result = await adminRequest<SignupResponse>("/api/auth/signup", undefined, {
        method: "POST",
        body: JSON.stringify({
          ownerName,
          email,
          password,
          restaurantName,
          slug,
          phone,
          address,
          plan,
          billingCycle
        })
      });

      window.localStorage.setItem("menu-owner-token", result.token);
      setMessage({
        type: "success",
        text: "تم إنشاء الحساب بنجاح. المنيو الآن بانتظار موافقة الإدارة بعد تأكيد الدفع اليدوي."
      });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "تعذر إنشاء الحساب. تأكد من البيانات وحاول مرة أخرى." });
    } finally {
      setBusy(false);
    }
  }

  return {
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
  };
}

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
    .replace(/[\u0600-\u06ff]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
