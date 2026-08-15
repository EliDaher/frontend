import type { RestaurantModule, RestaurantModules, RestaurantPlan } from "@/types/menu";

export const moduleLabels: Record<RestaurantModule, string> = {
  menu: "المنيو",
  orders: "الطلبات",
  tables: "الطاولات",
  pos: "نقطة البيع",
  accounting: "المحاسبة",
  inventory: "المخزون",
  purchasing: "المشتريات",
  kitchen: "المطبخ",
  reports: "التقارير",
  expenses: "المصروفات",
  payments: "المدفوعات",
  staff: "الموظفون"
};

export const defaultModules: RestaurantModules = {
  menu: true,
  orders: false,
  tables: false,
  pos: false,
  accounting: false,
  inventory: false,
  purchasing: false,
  kitchen: false,
  reports: false,
  expenses: false,
  payments: false,
  staff: false
};

export const planModules: Record<RestaurantPlan, Partial<RestaurantModules>> = {
  basic: { menu: true },
  standard: { menu: true, orders: true, tables: true, pos: true, payments: true, reports: true },
  premium: {
    menu: true,
    orders: true,
    tables: true,
    pos: true,
    accounting: true,
    inventory: true,
    purchasing: true,
    kitchen: true,
    reports: true,
    expenses: true,
    payments: true,
    staff: true
  }
};

export function normalizeModules(plan: RestaurantPlan, modules?: Partial<RestaurantModules>) {
  return {
    ...defaultModules,
    ...planModules[plan],
    ...modules
  };
}
