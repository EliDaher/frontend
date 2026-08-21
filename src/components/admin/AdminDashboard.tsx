"use client";

import { Edit3, Eye, LogOut, Plus, RefreshCw, Save, Trash2, Users } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AppBadge,
  AppButton,
  AppEmptyState,
  AppFieldShell,
  AppInput,
  AppPageHeader,
  AppSelect,
  AppSurface,
  AppTextarea,
  cn
} from "@/components/shared";
import { adminRequest } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { normalizeTemplate, planLabels, planTemplates, subscriptionLabels, templateLabels } from "@/lib/plans";
import type { AppUser, BillingCycle, Category, CustomDomainStatus, MenuItem, MenuTemplate, Restaurant, RestaurantPlan, SubscriptionStatus, Theme, UserRole } from "@/types/menu";

type RestaurantForm = Omit<Restaurant, "id" | "createdAt" | "updatedAt">;
type CategoryForm = Omit<Category, "id">;
type ItemForm = Omit<MenuItem, "id" | "createdAt" | "updatedAt">;
type UserForm = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  restaurantId: string;
  isActive: boolean;
};

const emptyTheme: Theme = {
  primaryColor: "#b45309",
  secondaryColor: "#f59e0b",
  backgroundColor: "#fffaf0",
  textColor: "#1f2937",
  fontStyle: "cairo",
  cardStyle: "soft"
};

const emptyRestaurant: RestaurantForm = {
  slug: "",
  name: "",
  logo: "",
  coverImage: "",
  description: "",
  phone: "",
  address: "",
  currency: "SYP",
  isActive: true,
  plan: "basic",
  template: "minimal",
  theme: emptyTheme,
  ownerUserId: "",
  subscriptionStatus: "active",
  billingCycle: "monthly",
  subscriptionStartsAt: "",
  subscriptionEndsAt: "",
  lastPaymentAt: "",
  subscriptionNotes: "",
  customDomain: "",
  customDomainStatus: "none",
  customDomainVerifiedAt: ""
};

const emptyCategory: CategoryForm = { name: "", order: 0, isActive: true };
const emptyItem: ItemForm = {
  name: "",
  description: "",
  price: 0,
  image: "",
  categoryId: "",
  order: 0,
  isAvailable: true,
  isFeatured: false,
  badges: []
};
const emptyUser: UserForm = {
  name: "",
  email: "",
  password: "",
  role: "restaurantOwner",
  restaurantId: "",
  isActive: true
};

const plans: RestaurantPlan[] = ["basic", "standard", "premium"];
const subscriptionStatuses: SubscriptionStatus[] = ["pendingApproval", "active", "pastDue", "suspended", "cancelled"];
const billingCycles: BillingCycle[] = ["monthly", "yearly"];
const domainStatuses: CustomDomainStatus[] = ["none", "pending", "verified", "rejected"];
const badgeOptions: ItemForm["badges"] = ["popular", "new", "spicy"];

export function AdminDashboard() {
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [restaurantForm, setRestaurantForm] = useState<RestaurantForm>(emptyRestaurant);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategory);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItem);
  const [userForm, setUserForm] = useState<UserForm>(emptyUser);
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [editingItemId, setEditingItemId] = useState("");
  const [editingUserId, setEditingUserId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedRestaurant = useMemo(() => restaurants.find((restaurant) => restaurant.id === selectedId), [restaurants, selectedId]);
  const allowedTemplates = planTemplates[restaurantForm.plan];
  const activeRestaurants = restaurants.filter((restaurant) => restaurant.isActive).length;
  const pendingSubscriptions = restaurants.filter((restaurant) => restaurant.subscriptionStatus === "pendingApproval").length;

  useEffect(() => {
    const storedToken = window.localStorage.getItem("menu-admin-token");
    if (storedToken) setToken(storedToken);
  }, []);

  useEffect(() => {
    if (token) void loadAdminData(token);
  }, [token]);

  async function run(action: () => Promise<void>, success?: string) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      if (success) setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "حدث خطأ غير متوقع.");
    } finally {
      setBusy(false);
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      const result = await adminRequest<{ token: string }>("/api/admin/login", undefined, {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      window.localStorage.setItem("menu-admin-token", result.token);
      setToken(result.token);
    }, "تم تسجيل الدخول بنجاح.");
  }

  async function loadAdminData(authToken = token) {
    await run(async () => {
      const [nextRestaurants, nextUsers] = await Promise.all([
        adminRequest<Restaurant[]>("/api/admin/restaurants", authToken),
        adminRequest<AppUser[]>("/api/admin/users", authToken)
      ]);
      setRestaurants(nextRestaurants);
      setUsers(nextUsers);
      if (!selectedId && nextRestaurants[0]) {
        await selectRestaurant(nextRestaurants[0], authToken);
      }
    });
  }

  async function selectRestaurant(restaurant: Restaurant, authToken = token) {
    setSelectedId(restaurant.id);
    setRestaurantForm(toRestaurantForm(restaurant));
    const [nextCategories, nextItems] = await Promise.all([
      adminRequest<Category[]>(`/api/admin/restaurants/${restaurant.id}/categories`, authToken),
      adminRequest<MenuItem[]>(`/api/admin/restaurants/${restaurant.id}/items`, authToken)
    ]);
    setCategories(nextCategories);
    setItems(nextItems);
    setCategoryForm(emptyCategory);
    setItemForm({ ...emptyItem, categoryId: nextCategories[0]?.id ?? "" });
    setEditingCategoryId("");
    setEditingItemId("");
  }

  async function saveRestaurant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      const payload = {
        ...restaurantForm,
        template: normalizeTemplate(restaurantForm.plan, restaurantForm.template)
      };
      if (selectedId) {
        await adminRequest(`/api/admin/restaurants/${selectedId}`, token, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await adminRequest<{ id: string }>("/api/admin/restaurants", token, { method: "POST", body: JSON.stringify(payload) });
      }
      const nextRestaurants = await adminRequest<Restaurant[]>("/api/admin/restaurants", token);
      setRestaurants(nextRestaurants);
      const saved = nextRestaurants.find((restaurant) => restaurant.slug === restaurantForm.slug) ?? nextRestaurants[0];
      if (saved) await selectRestaurant(saved);
    }, "تم حفظ المطعم.");
  }

  async function removeRestaurant(id: string) {
    await run(async () => {
      await adminRequest(`/api/admin/restaurants/${id}`, token, { method: "DELETE" });
      setSelectedId("");
      setRestaurantForm(emptyRestaurant);
      setCategories([]);
      setItems([]);
      await loadAdminData();
    }, "تم حذف المطعم.");
  }

  async function recordPayment() {
    if (!selectedId || !selectedRestaurant) return;
    const amount = Number(window.prompt("Payment amount", "0") ?? "0");
    const extendMonths = Number(window.prompt("Extend months", restaurantForm.billingCycle === "yearly" ? "12" : "1") ?? "1");
    if (!Number.isFinite(amount) || !Number.isFinite(extendMonths)) return;

    await run(async () => {
      await adminRequest(`/api/admin/restaurants/${selectedId}/payments`, token, {
        method: "POST",
        body: JSON.stringify({
          amount,
          currency: restaurantForm.currency || "USD",
          billingCycle: restaurantForm.billingCycle ?? "monthly",
          extendMonths,
          notes: "Manual payment from admin dashboard"
        })
      });
      await loadAdminData();
      await selectRestaurant(selectedRestaurant);
    }, "تم تسجيل الدفعة وتمديد الاشتراك.");
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      const payload = {
        name: userForm.name,
        email: userForm.email,
        role: userForm.role,
        restaurantId: userForm.role === "restaurantOwner" ? userForm.restaurantId : "",
        isActive: userForm.isActive,
        ...(userForm.password ? { password: userForm.password } : {})
      };
      await adminRequest(editingUserId ? `/api/admin/users/${editingUserId}` : "/api/admin/users", token, {
        method: editingUserId ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      setUserForm(emptyUser);
      setEditingUserId("");
      await loadAdminData();
    }, "تم حفظ المستخدم.");
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !selectedRestaurant) return;
    await run(async () => {
      const path = editingCategoryId
        ? `/api/admin/restaurants/${selectedId}/categories/${editingCategoryId}`
        : `/api/admin/restaurants/${selectedId}/categories`;
      await adminRequest(path, token, { method: editingCategoryId ? "PATCH" : "POST", body: JSON.stringify(categoryForm) });
      await selectRestaurant(selectedRestaurant);
    }, "تم حفظ القسم.");
  }

  async function deleteCategory(categoryId: string) {
    if (!selectedId || !selectedRestaurant) return;
    await run(async () => {
      await adminRequest(`/api/admin/restaurants/${selectedId}/categories/${categoryId}`, token, { method: "DELETE" });
      await selectRestaurant(selectedRestaurant);
    }, "تم حذف القسم.");
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !selectedRestaurant) return;
    await run(async () => {
      const path = editingItemId ? `/api/admin/restaurants/${selectedId}/items/${editingItemId}` : `/api/admin/restaurants/${selectedId}/items`;
      await adminRequest(path, token, {
        method: editingItemId ? "PATCH" : "POST",
        body: JSON.stringify({
          ...itemForm,
          isFeatured: restaurantForm.plan === "premium" ? itemForm.isFeatured : false
        })
      });
      await selectRestaurant(selectedRestaurant);
    }, "تم حفظ الصنف.");
  }

  async function deleteItem(itemId: string) {
    if (!selectedId || !selectedRestaurant) return;
    await run(async () => {
      await adminRequest(`/api/admin/restaurants/${selectedId}/items/${itemId}`, token, { method: "DELETE" });
      await selectRestaurant(selectedRestaurant);
    }, "تم حذف الصنف.");
  }

  if (!token) {
    return (
      <main className="grid min-h-screen place-items-center bg-app-bg px-4 py-8 font-app text-app-ink" dir="rtl">
        <AppSurface className="w-full max-w-sm p-5">
          <form onSubmit={login} className="grid gap-4">
            <div>
              <p className="text-app-meta text-app-primary">لوحة التحكم العامة</p>
              <h1 className="mt-1 text-2xl font-semibold text-app-ink">تسجيل الدخول</h1>
              <p className="mt-2 text-app-body leading-7 text-app-muted">حساب المسؤول العام يدير المطاعم والباقات وأصحاب المطاعم.</p>
            </div>
            <AppFieldShell label="البريد الإلكتروني">
              <AppInput value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
            </AppFieldShell>
            <AppFieldShell label="كلمة المرور">
              <AppInput value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
            </AppFieldShell>
            {message ? <PageMessage text={message} /> : null}
            <AppButton type="submit" size="lg" loading={busy} className="w-full">دخول</AppButton>
          </form>
        </AppSurface>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-app-bg font-app text-app-ink" dir="rtl">
      <header className="sticky top-0 z-30 border-b border-app-border bg-app-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-app-meta text-app-primary">لوحة تحكم المنصة</p>
            <h1 className="truncate text-app-section-title font-semibold text-app-ink">إدارة المطاعم والباقات والمستخدمين</h1>
          </div>
          <div className="flex gap-2">
            <AdminIconButton label="تحديث" onClick={() => void loadAdminData()}>
              <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
            </AdminIconButton>
            <AdminIconButton label="خروج" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </AdminIconButton>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="h-max">
          <AppSurface>
            <div className="grid gap-3">
              <AppButton
                type="button"
                onClick={() => {
                  setSelectedId("");
                  setRestaurantForm(emptyRestaurant);
                  setCategories([]);
                  setItems([]);
                }}
                iconStart={<Plus className="h-4 w-4" />}
              >
                مطعم جديد
              </AppButton>

              <div className="grid gap-2">
                {restaurants.length ? restaurants.map((restaurant) => (
                  <button
                    key={restaurant.id}
                    type="button"
                    onClick={() => void run(() => selectRestaurant(restaurant))}
                    className={cn(
                      "rounded-app-md border p-3 text-right transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft",
                      selectedId === restaurant.id ? "border-app-primary bg-app-primary-soft" : "border-app-border bg-app-surface hover:bg-app-surface-muted"
                    )}
                  >
                    <span className="block truncate font-semibold text-app-ink">{restaurant.name}</span>
                    <span className="text-app-helper text-app-muted">/{restaurant.slug}</span>
                    <span className="mt-2 flex flex-wrap gap-2">
                      <RestaurantStatusBadge active={restaurant.isActive} />
                      <PlanBadge plan={restaurant.plan ?? "basic"} />
                      <SubscriptionStatusBadge status={restaurant.subscriptionStatus ?? "active"} />
                    </span>
                  </button>
                )) : <AppEmptyState title="لا توجد مطاعم" description="أضف أول مطعم للمنصة." />}
              </div>
            </div>
          </AppSurface>
        </aside>

        <section className="grid min-w-0 gap-4">
          <AppPageHeader
            title="الإدارة"
            description="إدارة المطاعم والاشتراكات وإعدادات المنصة."
            secondaryActions={(
              <>
                <AppBadge variant="neutral">{restaurants.length} مطعم</AppBadge>
                <AppBadge variant="success">{activeRestaurants} فعال</AppBadge>
                <AppBadge variant={pendingSubscriptions ? "warning" : "neutral"}>{pendingSubscriptions} بانتظار الموافقة</AppBadge>
              </>
            )}
          />

          {message ? <PageMessage text={message} /> : null}

          <AppSurface title={selectedId ? "بيانات المطعم" : "إضافة مطعم"}>
            <p className="mb-4 text-app-body leading-6 text-app-muted">المعلومات العامة، الباقة، والقالب المسموح حسب الباقة.</p>
            <form onSubmit={saveRestaurant} className="grid gap-3 md:grid-cols-2">
              <TextField label="الاسم" value={restaurantForm.name} onChange={(name) => setRestaurantForm({ ...restaurantForm, name })} />
              <TextField label="Slug" value={restaurantForm.slug} onChange={(slug) => setRestaurantForm({ ...restaurantForm, slug })} dir="ltr" />
              <TextField label="الشعار URL" value={restaurantForm.logo} onChange={(logo) => setRestaurantForm({ ...restaurantForm, logo })} dir="ltr" />
              <TextField label="صورة الغلاف URL" value={restaurantForm.coverImage} onChange={(coverImage) => setRestaurantForm({ ...restaurantForm, coverImage })} dir="ltr" />
              <TextField label="الهاتف" value={restaurantForm.phone} onChange={(phone) => setRestaurantForm({ ...restaurantForm, phone })} />
              <TextField label="العنوان" value={restaurantForm.address} onChange={(address) => setRestaurantForm({ ...restaurantForm, address })} />
              <TextField label="العملة" value={restaurantForm.currency} onChange={(currency) => setRestaurantForm({ ...restaurantForm, currency })} />
              <SelectControl
                label="الباقة"
                value={restaurantForm.plan}
                options={plans.map((plan) => ({ value: plan, label: planLabels[plan] }))}
                onChange={(plan) =>
                  setRestaurantForm({
                    ...restaurantForm,
                    plan: plan as RestaurantPlan,
                    template: normalizeTemplate(plan as RestaurantPlan, restaurantForm.template)
                  })
                }
              />
              <SelectControl
                label="القالب"
                value={restaurantForm.template}
                options={allowedTemplates.map((template) => ({ value: template, label: templateLabels[template] }))}
                onChange={(template) => setRestaurantForm({ ...restaurantForm, template: template as MenuTemplate })}
              />
              <AppFieldShell label="الوصف" className="md:col-span-2">
                <AppTextarea value={restaurantForm.description} onChange={(event) => setRestaurantForm({ ...restaurantForm, description: event.target.value })} />
              </AppFieldShell>
              <ColorControl label="اللون الأساسي" value={restaurantForm.theme.primaryColor} onChange={(value) => setTheme("primaryColor", value)} />
              <ColorControl label="اللون الثانوي" value={restaurantForm.theme.secondaryColor} onChange={(value) => setTheme("secondaryColor", value)} />
              <ColorControl label="الخلفية" value={restaurantForm.theme.backgroundColor} onChange={(value) => setTheme("backgroundColor", value)} />
              <ColorControl label="النص" value={restaurantForm.theme.textColor} onChange={(value) => setTheme("textColor", value)} />
              <CheckControl label="المطعم فعال" checked={restaurantForm.isActive} onChange={(checked) => setRestaurantForm({ ...restaurantForm, isActive: checked })} />
              <SelectControl
                label="حالة الاشتراك"
                value={restaurantForm.subscriptionStatus ?? "active"}
                options={subscriptionStatuses.map((status) => ({ value: status, label: subscriptionLabels[status] }))}
                onChange={(subscriptionStatus) => setRestaurantForm({ ...restaurantForm, subscriptionStatus: subscriptionStatus as SubscriptionStatus, isActive: subscriptionStatus === "active" })}
              />
              <SelectControl
                label="دورة الدفع"
                value={restaurantForm.billingCycle ?? "monthly"}
                options={billingCycles.map((cycle) => ({ value: cycle, label: cycle === "yearly" ? "سنوي" : "شهري" }))}
                onChange={(billingCycle) => setRestaurantForm({ ...restaurantForm, billingCycle: billingCycle as BillingCycle })}
              />
              <TextField label="تاريخ انتهاء الاشتراك" value={restaurantForm.subscriptionEndsAt ?? ""} onChange={(subscriptionEndsAt) => setRestaurantForm({ ...restaurantForm, subscriptionEndsAt })} />
              <TextField label="الدومين المخصص" value={restaurantForm.customDomain ?? ""} onChange={(customDomain) => setRestaurantForm({ ...restaurantForm, customDomain })} dir="ltr" />
              <SelectControl
                label="حالة الدومين"
                value={restaurantForm.customDomainStatus ?? "none"}
                options={domainStatuses.map((status) => ({ value: status, label: status }))}
                onChange={(customDomainStatus) => setRestaurantForm({ ...restaurantForm, customDomainStatus: customDomainStatus as CustomDomainStatus })}
              />
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <AppButton type="submit" loading={busy} iconStart={<Save className="h-4 w-4" />}>حفظ المطعم</AppButton>
                {selectedId ? (
                  <>
                    <a href={`/${restaurantForm.slug}`} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-app-md border border-app-border bg-app-surface px-4 text-sm font-semibold text-app-ink transition-colors hover:bg-app-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft">
                      <Eye className="h-4 w-4" />
                      عرض المنيو
                    </a>
                    <AppButton type="button" variant="secondary" onClick={() => void recordPayment()}>تسجيل دفعة</AppButton>
                    <AppButton type="button" variant="ghost" onClick={() => void removeRestaurant(selectedId)} className="text-app-danger hover:bg-app-danger-soft" iconStart={<Trash2 className="h-4 w-4" />}>حذف</AppButton>
                  </>
                ) : null}
              </div>
            </form>
          </AppSurface>

          <AppSurface title="المستخدمون">
            <p className="mb-4 text-app-body leading-6 text-app-muted">أنشئ مسؤولاً عاماً أو صاحب مطعم واربطه بمطعم محدد.</p>
            <form onSubmit={saveUser} className="grid gap-3 md:grid-cols-2">
              <TextField label="الاسم" value={userForm.name} onChange={(name) => setUserForm({ ...userForm, name })} />
              <TextField label="البريد الإلكتروني" value={userForm.email} onChange={(nextEmail) => setUserForm({ ...userForm, email: nextEmail })} type="email" />
              <TextField label={editingUserId ? "كلمة مرور جديدة (اختياري)" : "كلمة المرور"} value={userForm.password} onChange={(nextPassword) => setUserForm({ ...userForm, password: nextPassword })} type="password" />
              <SelectControl
                label="الدور"
                value={userForm.role}
                options={[
                  { value: "restaurantOwner", label: "صاحب مطعم" },
                  { value: "superAdmin", label: "مسؤول عام" }
                ]}
                onChange={(role) => setUserForm({ ...userForm, role: role as UserRole })}
              />
              {userForm.role === "restaurantOwner" ? (
                <SelectControl
                  label="المطعم"
                  value={userForm.restaurantId}
                  options={[{ value: "", label: "اختر مطعماً" }, ...restaurants.map((restaurant) => ({ value: restaurant.id, label: restaurant.name }))]}
                  onChange={(restaurantId) => setUserForm({ ...userForm, restaurantId })}
                />
              ) : null}
              <CheckControl label="المستخدم فعال" checked={userForm.isActive} onChange={(checked) => setUserForm({ ...userForm, isActive: checked })} />
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <AppButton type="submit" loading={busy} iconStart={<Users className="h-4 w-4" />}>{editingUserId ? "تحديث المستخدم" : "إضافة مستخدم"}</AppButton>
                {editingUserId ? (
                  <AppButton type="button" variant="secondary" onClick={() => { setEditingUserId(""); setUserForm(emptyUser); }}>
                    إلغاء
                  </AppButton>
                ) : null}
              </div>
            </form>
            <AdminList emptyTitle="لا يوجد مستخدمون" emptyDescription="سيظهر المستخدمون بعد إضافتهم.">
              {users.map((user) => (
                <AdminListRow key={user.id} title={user.name} meta={`${user.email} - ${user.role === "superAdmin" ? "مسؤول عام" : "صاحب مطعم"}`}>
                  <AdminIconButton label="تعديل" onClick={() => editUser(user)}>
                    <Edit3 className="h-4 w-4" />
                  </AdminIconButton>
                </AdminListRow>
              ))}
            </AdminList>
          </AppSurface>

          {selectedId ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <AppSurface title="الأقسام">
                <p className="mb-4 text-app-body leading-6 text-app-muted">رتّب أقسام المنيو وحدد الظاهر منها.</p>
                <form onSubmit={saveCategory} className="grid gap-3 sm:grid-cols-[1fr_110px_auto]">
                  <TextField label="اسم القسم" value={categoryForm.name} onChange={(name) => setCategoryForm({ ...categoryForm, name })} />
                  <NumberControl label="الترتيب" value={categoryForm.order} onChange={(order) => setCategoryForm({ ...categoryForm, order })} />
                  <CheckControl label="فعال" checked={categoryForm.isActive} onChange={(checked) => setCategoryForm({ ...categoryForm, isActive: checked })} alignEnd />
                  <AppButton type="submit" className="sm:col-span-3">{editingCategoryId ? "تحديث" : "إضافة"}</AppButton>
                </form>
                <AdminList emptyTitle="لا توجد أقسام" emptyDescription="أضف أقسام المنيو لهذا المطعم.">
                  {categories.map((category) => (
                    <AdminListRow key={category.id} title={category.name} meta={`ترتيب ${category.order} - ${category.isActive ? "ظاهر" : "مخفي"}`}>
                      <AdminIconButton label="تعديل" onClick={() => editCategory(category)}>
                        <Edit3 className="h-4 w-4" />
                      </AdminIconButton>
                      <AdminIconButton label="حذف" onClick={() => void deleteCategory(category.id)} danger>
                        <Trash2 className="h-4 w-4" />
                      </AdminIconButton>
                    </AdminListRow>
                  ))}
                </AdminList>
              </AppSurface>

              <AppSurface title="الأصناف">
                <p className="mb-4 text-app-body leading-6 text-app-muted">أضف الأسعار والصور والبادجات. التمييز متاح فقط للباقة Premium.</p>
                <form onSubmit={saveItem} className="grid gap-3 sm:grid-cols-2">
                  <TextField label="اسم الصنف" value={itemForm.name} onChange={(name) => setItemForm({ ...itemForm, name })} />
                  <NumberControl label="السعر" value={itemForm.price} onChange={(price) => setItemForm({ ...itemForm, price })} />
                  <TextField label="الصورة URL" value={itemForm.image} onChange={(image) => setItemForm({ ...itemForm, image })} dir="ltr" />
                  <NumberControl label="الترتيب" value={itemForm.order} onChange={(order) => setItemForm({ ...itemForm, order })} />
                  <SelectControl
                    label="القسم"
                    value={itemForm.categoryId}
                    options={[{ value: "", label: "اختر قسماً" }, ...categories.map((category) => ({ value: category.id, label: category.name }))]}
                    onChange={(categoryId) => setItemForm({ ...itemForm, categoryId })}
                  />
                  <div className="flex flex-wrap items-end gap-3 pb-2 text-app-label font-semibold">
                    <CheckBox label="متاح" checked={itemForm.isAvailable} onChange={(checked) => setItemForm({ ...itemForm, isAvailable: checked })} />
                    <CheckBox
                      label="مميز"
                      checked={restaurantForm.plan === "premium" && itemForm.isFeatured}
                      disabled={restaurantForm.plan !== "premium"}
                      onChange={(checked) => setItemForm({ ...itemForm, isFeatured: checked })}
                    />
                  </div>
                  <AppFieldShell label="الوصف" className="sm:col-span-2">
                    <AppTextarea value={itemForm.description} onChange={(event) => setItemForm({ ...itemForm, description: event.target.value })} />
                  </AppFieldShell>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    {badgeOptions.map((badge) => (
                      <CheckPill key={badge} label={badgeLabel(badge)} checked={itemForm.badges.includes(badge)} onChange={() => toggleBadge(badge)} />
                    ))}
                  </div>
                  <AppButton type="submit" className="sm:col-span-2">{editingItemId ? "تحديث الصنف" : "إضافة صنف"}</AppButton>
                </form>
                <AdminList emptyTitle="لا توجد أصناف" emptyDescription="أضف أصناف المنيو لهذا المطعم.">
                  {items.map((item) => (
                    <AdminListRow key={item.id} title={item.name} meta={`${formatMoney(item.price, restaurantForm.currency)}${item.isFeatured ? " - مميز" : ""}`}>
                      <AdminIconButton label="تعديل" onClick={() => editItem(item)}>
                        <Edit3 className="h-4 w-4" />
                      </AdminIconButton>
                      <AdminIconButton label="حذف" onClick={() => void deleteItem(item.id)} danger>
                        <Trash2 className="h-4 w-4" />
                      </AdminIconButton>
                    </AdminListRow>
                  ))}
                </AdminList>
              </AppSurface>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );

  function setTheme(key: keyof Theme, value: string) {
    setRestaurantForm({ ...restaurantForm, theme: { ...restaurantForm.theme, [key]: value } });
  }

  function editCategory(category: Category) {
    setEditingCategoryId(category.id);
    setCategoryForm({ name: category.name, order: category.order, isActive: category.isActive });
  }

  function editItem(item: MenuItem) {
    setEditingItemId(item.id);
    setItemForm({
      name: item.name,
      description: item.description,
      price: item.price,
      image: item.image,
      categoryId: item.categoryId,
      order: item.order,
      isAvailable: item.isAvailable,
      isFeatured: item.isFeatured ?? false,
      badges: item.badges
    });
  }

  function editUser(user: AppUser) {
    setEditingUserId(user.id);
    setUserForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      restaurantId: user.restaurantId ?? "",
      isActive: user.isActive
    });
  }

  function toggleBadge(badge: ItemForm["badges"][number]) {
    setItemForm({
      ...itemForm,
      badges: itemForm.badges.includes(badge)
        ? itemForm.badges.filter((current) => current !== badge)
        : [...itemForm.badges, badge]
    });
  }

  function logout() {
    window.localStorage.removeItem("menu-admin-token");
    setToken("");
  }
}

function TextField({ label, value, onChange, type = "text", dir }: { label: string; value: string; onChange: (value: string) => void; type?: string; dir?: "rtl" | "ltr" }) {
  return (
    <AppFieldShell label={label}>
      <AppInput value={value} type={type} dir={dir} onChange={(event) => onChange(event.target.value)} className={dir === "ltr" ? "text-left" : undefined} />
    </AppFieldShell>
  );
}

function NumberControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <AppFieldShell label={label}>
      <AppInput value={value} onChange={(event) => onChange(Number(event.target.value))} type="number" min="0" />
    </AppFieldShell>
  );
}

function SelectControl({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <AppFieldShell label={label}>
      <AppSelect value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </AppSelect>
    </AppFieldShell>
  );
}

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <AppFieldShell label={label}>
      <div className="flex gap-2">
        <AppInput value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 text-left" dir="ltr" />
        <input value={value} onChange={(event) => onChange(event.target.value)} type="color" className="h-10 w-14 rounded-app-md border border-app-border bg-app-surface" />
      </div>
    </AppFieldShell>
  );
}

function CheckControl({ label, checked, onChange, alignEnd = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; alignEnd?: boolean }) {
  return (
    <label className={cn("flex items-center gap-2 text-app-label font-semibold text-app-ink", alignEnd && "pb-2 sm:self-end")}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-app-primary" />
      {label}
    </label>
  );
}

function CheckBox({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cn("flex items-center gap-2", disabled && "opacity-45")}>
      <input type="checkbox" disabled={disabled} checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-app-primary" />
      {label}
    </label>
  );
}

function CheckPill({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className={cn("flex items-center gap-2 rounded-app-md border px-3 py-2 text-app-label font-semibold", checked ? "border-app-primary bg-app-primary-soft text-app-primary" : "border-app-border bg-app-surface text-app-ink")}>
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 accent-app-primary" />
      {label}
    </label>
  );
}

function AdminList({ children, emptyTitle, emptyDescription }: { children: ReactNode; emptyTitle: string; emptyDescription: string }) {
  const content = Array.isArray(children) ? children.filter(Boolean) : children;
  if (Array.isArray(content) && content.length === 0) {
    return <AppEmptyState className="mt-4" title={emptyTitle} description={emptyDescription} />;
  }
  return <div className="mt-4 divide-y divide-app-border rounded-app-md border border-app-border bg-app-surface">{children}</div>;
}

function AdminListRow({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <p className="truncate font-semibold text-app-ink">{title}</p>
        <p className="truncate text-app-helper text-app-muted">{meta}</p>
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </div>
  );
}

function AdminIconButton({ label, children, onClick, danger = false }: { label: string; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "grid h-10 w-10 place-items-center rounded-app-md border transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft",
        danger
          ? "border-app-danger-soft bg-app-danger-soft text-app-danger hover:bg-red-100"
          : "border-app-border bg-app-surface text-app-muted hover:bg-app-surface-muted hover:text-app-ink"
      )}
    >
      {children}
    </button>
  );
}

function RestaurantStatusBadge({ active }: { active: boolean }) {
  return active ? <AppBadge variant="success">فعال</AppBadge> : <AppBadge variant="danger">متوقف</AppBadge>;
}

function PlanBadge({ plan }: { plan: RestaurantPlan }) {
  return <AppBadge variant="primary">{planLabels[plan]}</AppBadge>;
}

function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  return <AppBadge variant={subscriptionStatusVariant(status)}>{subscriptionLabels[status]}</AppBadge>;
}

function subscriptionStatusVariant(status: SubscriptionStatus): "neutral" | "success" | "warning" | "danger" {
  if (status === "active") return "success";
  if (status === "pendingApproval" || status === "pastDue") return "warning";
  if (status === "suspended" || status === "cancelled") return "danger";
  return "neutral";
}

function PageMessage({ text }: { text: string }) {
  return <p className="rounded-app-md border border-app-warning-soft bg-app-warning-soft p-3 text-app-body font-semibold text-app-warning">{text}</p>;
}

function badgeLabel(badge: "popular" | "new" | "spicy") {
  return {
    popular: "الأكثر طلباً",
    new: "جديد",
    spicy: "حار"
  }[badge];
}

function toRestaurantForm(restaurant: Restaurant): RestaurantForm {
  const plan = restaurant.plan ?? "basic";
  return {
    slug: restaurant.slug,
    name: restaurant.name,
    logo: restaurant.logo,
    coverImage: restaurant.coverImage,
    description: restaurant.description,
    phone: restaurant.phone,
    address: restaurant.address,
    currency: restaurant.currency,
    isActive: restaurant.isActive,
    plan,
    template: normalizeTemplate(plan, restaurant.template),
    theme: restaurant.theme ?? emptyTheme,
    ownerUserId: restaurant.ownerUserId ?? "",
    subscriptionStatus: restaurant.subscriptionStatus ?? "active",
    billingCycle: restaurant.billingCycle ?? "monthly",
    subscriptionStartsAt: restaurant.subscriptionStartsAt ?? "",
    subscriptionEndsAt: restaurant.subscriptionEndsAt ?? "",
    lastPaymentAt: restaurant.lastPaymentAt ?? "",
    subscriptionNotes: restaurant.subscriptionNotes ?? "",
    customDomain: restaurant.customDomain ?? "",
    customDomainStatus: restaurant.customDomainStatus ?? "none",
    customDomainVerifiedAt: restaurant.customDomainVerifiedAt ?? ""
  };
}
