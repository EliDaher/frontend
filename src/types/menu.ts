export type MenuTemplate = "minimal" | "classic" | "premium" | "cafe" | "pinza";
export type RestaurantPlan = "basic" | "standard" | "premium";
export type StaffRole = "OWNER" | "ADMIN" | "MANAGER" | "CASHIER" | "WAITER" | "KITCHEN" | "ACCOUNTANT" | "INVENTORY_MANAGER";
export type UserRole = "superAdmin" | "restaurantOwner" | StaffRole;
export type SubscriptionStatus = "pendingApproval" | "active" | "pastDue" | "suspended" | "cancelled";
export type BillingCycle = "monthly" | "yearly";
export type CustomDomainStatus = "none" | "pending" | "verified" | "rejected";
export type RestaurantModule =
  | "menu"
  | "orders"
  | "tables"
  | "pos"
  | "accounting"
  | "inventory"
  | "purchasing"
  | "kitchen"
  | "reports"
  | "expenses"
  | "payments"
  | "staff";
export type RestaurantModules = Record<RestaurantModule, boolean>;
export type Permission =
  | "orders.view"
  | "orders.create"
  | "orders.update"
  | "orders.cancel"
  | "pos.access"
  | "payments.create"
  | "expenses.create"
  | "accounting.view"
  | "accounting.manage"
  | "inventory.view"
  | "inventory.adjust"
  | "purchasing.manage"
  | "tables.manage"
  | "reports.view"
  | "staff.manage";

export type Theme = {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontStyle: string;
  cardStyle: string;
};

export type Restaurant = {
  id: string;
  slug: string;
  name: string;
  logo: string;
  coverImage: string;
  description: string;
  phone: string;
  address: string;
  currency: string;
  receiptRestaurantName?: string;
  vatNumber?: string;
  receiptLocation?: string;
  receiptPrinterIp?: string;
  receiptPrinterPort?: number;
  isActive: boolean;
  plan: RestaurantPlan;
  template: MenuTemplate;
  theme: Theme;
  ownerUserId?: string;
  subscriptionStatus?: SubscriptionStatus;
  billingCycle?: BillingCycle;
  subscriptionStartsAt?: string;
  subscriptionEndsAt?: string;
  lastPaymentAt?: string;
  subscriptionNotes?: string;
  customDomain?: string;
  customDomainStatus?: CustomDomainStatus;
  customDomainVerifiedAt?: string;
  modules?: Partial<RestaurantModules>;
  timezone?: string;
  taxRate?: number;
  serviceChargeRate?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type Category = {
  id: string;
  name: string;
  order: number;
  isActive: boolean;
};

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  categoryId: string;
  order: number;
  isAvailable: boolean;
  isFeatured: boolean;
  badges: Array<"popular" | "new" | "spicy">;
  createdAt?: string;
  updatedAt?: string;
};

export type MenuPayload = {
  restaurantId: string;
  categories: Category[];
  items: MenuItem[];
};

export type ApiEnvelope<T> = {
  data: T;
};

export type AuthUser = {
  id?: string;
  name?: string;
  email: string;
  role: UserRole;
  restaurantId?: string;
  permissions?: Permission[];
};

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  restaurantId?: string;
  permissions?: Permission[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type PlanLimits = {
  maxCategories: number;
  maxItems: number;
  allowFeatured: boolean;
  allowBadges: boolean;
  allowCustomDomain: boolean;
};

export type OwnerSubscription = {
  plan: RestaurantPlan;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  endsAt: string;
  lastPaymentAt: string;
  limits: PlanLimits;
  usage: {
    categories: number;
    items: number;
  };
  customDomain: string;
  customDomainStatus: CustomDomainStatus;
};

export type OpsSummary = {
  range: { from: string; to: string };
  totals: {
    sales: number;
    purchases: number;
    expenses: number;
    net: number;
  };
  orders: {
    total: number;
    open: number;
    completed: number;
    cancelled: number;
  };
  inventory: {
    totalItems: number;
    lowStockCount: number;
    lowStockItems: Array<{ id: string; name: string; currentQuantity: number; minimumQuantity: number; unit: string }>;
  };
  paymentsByMethod: Record<string, number>;
};
