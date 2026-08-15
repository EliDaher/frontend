import type { MenuTemplate, PlanLimits, RestaurantPlan, SubscriptionStatus } from "@/types/menu";

export const planLabels: Record<RestaurantPlan, string> = {
  basic: "Basic",
  standard: "Standard",
  premium: "Premium"
};

export const templateLabels: Record<MenuTemplate, string> = {
  minimal: "Minimal",
  classic: "Classic",
  cafe: "Cafe",
  premium: "Premium",
  pinza: "Pinza"
};

export const planTemplates: Record<RestaurantPlan, MenuTemplate[]> = {
  basic: ["minimal", "classic"],
  standard: ["classic", "cafe"],
  premium: ["premium", "pinza", "cafe", "classic"]
};

export const fallbackTemplate: Record<RestaurantPlan, MenuTemplate> = {
  basic: "minimal",
  standard: "classic",
  premium: "premium"
};

export const planLimits: Record<RestaurantPlan, PlanLimits> = {
  basic: {
    maxCategories: 5,
    maxItems: 50,
    allowFeatured: false,
    allowBadges: false,
    allowCustomDomain: false
  },
  standard: {
    maxCategories: 15,
    maxItems: 150,
    allowFeatured: false,
    allowBadges: true,
    allowCustomDomain: false
  },
  premium: {
    maxCategories: 50,
    maxItems: 500,
    allowFeatured: true,
    allowBadges: true,
    allowCustomDomain: true
  }
};

export const subscriptionLabels: Record<SubscriptionStatus, string> = {
  pendingApproval: "بانتظار الموافقة",
  active: "فعال",
  pastDue: "متأخر الدفع",
  suspended: "موقوف",
  cancelled: "ملغي"
};

export function normalizeTemplate(plan: RestaurantPlan, template: MenuTemplate) {
  return planTemplates[plan].includes(template) ? template : fallbackTemplate[plan];
}
