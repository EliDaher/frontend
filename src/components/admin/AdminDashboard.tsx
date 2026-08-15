"use client";

import { Edit3, Eye, LogOut, Plus, RefreshCw, Save, Trash2, Users } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/api";
import { badgeLabel, ColorField, Field, IconButton, List, ListRow, NumberField, Panel, PrimaryButton, SelectField } from "./AdminDashboardParts";
import { formatMoney } from "@/lib/format";
import { normalizeTemplate, planLabels, planTemplates, templateLabels, subscriptionLabels } from "@/lib/plans";
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
      <main className="flex min-h-screen items-center justify-center bg-[#0f1115] px-4 text-white" dir="rtl">
        <form onSubmit={login} className="w-full max-w-sm rounded-lg border border-white/10 bg-white/[0.07] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur">
          <p className="mb-3 text-xs font-black text-amber-200">لوحة التحكم العامة</p>
          <h1 className="text-3xl font-black leading-tight">تسجيل الدخول</h1>
          <p className="mt-2 text-sm leading-7 text-zinc-300">حساب المسؤول العام يدير المطاعم والباقات وأصحاب المطاعم.</p>
          <Field label="البريد الإلكتروني" value={email} onChange={setEmail} type="email" dark />
          <Field label="كلمة المرور" value={password} onChange={setPassword} type="password" dark />
          {message ? <p className="mt-3 rounded-md bg-red-500/20 p-3 text-sm text-red-100">{message}</p> : null}
          <button disabled={busy} className="mt-5 h-12 w-full rounded-md bg-amber-300 px-4 font-black text-zinc-950 transition hover:-translate-y-0.5 disabled:opacity-60">
            دخول
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-950" dir="rtl">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black text-amber-700">لوحة تحكم المنصة</p>
            <h1 className="truncate text-xl font-black">إدارة المطاعم والباقات والمستخدمين</h1>
          </div>
          <div className="flex gap-2">
            <IconButton label="تحديث" onClick={() => void loadAdminData()}>
              <RefreshCw className="h-4 w-4" />
            </IconButton>
            <IconButton label="خروج" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[300px_1fr]">
        <aside className="h-max rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <button
            className="mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-black text-white transition hover:-translate-y-0.5"
            onClick={() => {
              setSelectedId("");
              setRestaurantForm(emptyRestaurant);
              setCategories([]);
              setItems([]);
            }}
          >
            <Plus className="h-4 w-4" />
            مطعم جديد
          </button>
          <div className="space-y-2">
            {restaurants.map((restaurant) => (
              <button
                key={restaurant.id}
                onClick={() => void run(() => selectRestaurant(restaurant))}
                className={`w-full rounded-md border p-3 text-right transition ${
                  selectedId === restaurant.id ? "border-amber-400 bg-amber-50 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <span className="block truncate font-black">{restaurant.name}</span>
                <span className="text-xs font-bold text-slate-500">/{restaurant.slug}</span>
                <span className="mt-2 flex flex-wrap gap-2">
                  <span className={`rounded-full px-2 py-1 text-xs font-black ${restaurant.isActive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                    {restaurant.isActive ? "فعال" : "متوقف"}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">{planLabels[restaurant.plan ?? "basic"]}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-4">
          {message ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-black text-amber-900">{message}</p> : null}

          <Panel title={selectedId ? "بيانات المطعم" : "إضافة مطعم"} description="المعلومات العامة، الباقة، والقالب المسموح حسب الباقة.">
            <form onSubmit={saveRestaurant} className="grid gap-3 md:grid-cols-2">
              <Field label="الاسم" value={restaurantForm.name} onChange={(name) => setRestaurantForm({ ...restaurantForm, name })} />
              <Field label="Slug" value={restaurantForm.slug} onChange={(slug) => setRestaurantForm({ ...restaurantForm, slug })} />
              <Field label="الشعار URL" value={restaurantForm.logo} onChange={(logo) => setRestaurantForm({ ...restaurantForm, logo })} />
              <Field label="صورة الغلاف URL" value={restaurantForm.coverImage} onChange={(coverImage) => setRestaurantForm({ ...restaurantForm, coverImage })} />
              <Field label="الهاتف" value={restaurantForm.phone} onChange={(phone) => setRestaurantForm({ ...restaurantForm, phone })} />
              <Field label="العنوان" value={restaurantForm.address} onChange={(address) => setRestaurantForm({ ...restaurantForm, address })} />
              <Field label="العملة" value={restaurantForm.currency} onChange={(currency) => setRestaurantForm({ ...restaurantForm, currency })} />
              <SelectField
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
              <SelectField
                label="القالب"
                value={restaurantForm.template}
                options={allowedTemplates.map((template) => ({ value: template, label: templateLabels[template] }))}
                onChange={(template) => setRestaurantForm({ ...restaurantForm, template: template as MenuTemplate })}
              />
              <label className="md:col-span-2">
                <span className="text-sm font-black">الوصف</span>
                <textarea
                  value={restaurantForm.description}
                  onChange={(event) => setRestaurantForm({ ...restaurantForm, description: event.target.value })}
                  className="mt-1 min-h-24 w-full rounded-md border border-slate-200 bg-white p-3 font-bold outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                />
              </label>
              <ColorField label="اللون الأساسي" value={restaurantForm.theme.primaryColor} onChange={(value) => setTheme("primaryColor", value)} />
              <ColorField label="اللون الثانوي" value={restaurantForm.theme.secondaryColor} onChange={(value) => setTheme("secondaryColor", value)} />
              <ColorField label="الخلفية" value={restaurantForm.theme.backgroundColor} onChange={(value) => setTheme("backgroundColor", value)} />
              <ColorField label="النص" value={restaurantForm.theme.textColor} onChange={(value) => setTheme("textColor", value)} />
              <label className="flex items-center gap-2 text-sm font-black">
                <input type="checkbox" checked={restaurantForm.isActive} onChange={(event) => setRestaurantForm({ ...restaurantForm, isActive: event.target.checked })} />
                المطعم فعال
              </label>
              <SelectField
                label="حالة الاشتراك"
                value={restaurantForm.subscriptionStatus ?? "active"}
                options={subscriptionStatuses.map((status) => ({ value: status, label: subscriptionLabels[status] }))}
                onChange={(subscriptionStatus) => setRestaurantForm({ ...restaurantForm, subscriptionStatus: subscriptionStatus as SubscriptionStatus, isActive: subscriptionStatus === "active" })}
              />
              <SelectField
                label="دورة الدفع"
                value={restaurantForm.billingCycle ?? "monthly"}
                options={billingCycles.map((cycle) => ({ value: cycle, label: cycle === "yearly" ? "سنوي" : "شهري" }))}
                onChange={(billingCycle) => setRestaurantForm({ ...restaurantForm, billingCycle: billingCycle as BillingCycle })}
              />
              <Field label="تاريخ انتهاء الاشتراك" value={restaurantForm.subscriptionEndsAt ?? ""} onChange={(subscriptionEndsAt) => setRestaurantForm({ ...restaurantForm, subscriptionEndsAt })} />
              <Field label="الدومين المخصص" value={restaurantForm.customDomain ?? ""} onChange={(customDomain) => setRestaurantForm({ ...restaurantForm, customDomain })} />
              <SelectField
                label="حالة الدومين"
                value={restaurantForm.customDomainStatus ?? "none"}
                options={domainStatuses.map((status) => ({ value: status, label: status }))}
                onChange={(customDomainStatus) => setRestaurantForm({ ...restaurantForm, customDomainStatus: customDomainStatus as CustomDomainStatus })}
              />
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <PrimaryButton disabled={busy}>
                  <Save className="h-4 w-4" />
                  حفظ المطعم
                </PrimaryButton>
                {selectedId ? (
                  <>
                    <a href={`/${restaurantForm.slug}`} target="_blank" className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 font-black text-slate-700 transition hover:bg-slate-50">
                      <Eye className="h-4 w-4" />
                      عرض المنيو
                    </a>
                    <button type="button" onClick={() => void recordPayment()} className="inline-flex h-11 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 font-black text-emerald-800 transition hover:bg-emerald-100">
                      تسجيل دفعة
                    </button>
                    <button type="button" onClick={() => void removeRestaurant(selectedId)} className="inline-flex h-11 items-center gap-2 rounded-md border border-red-200 bg-white px-4 font-black text-red-700 transition hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                      حذف
                    </button>
                  </>
                ) : null}
              </div>
            </form>
          </Panel>

          <Panel title="المستخدمون" description="أنشئ مسؤولاً عاماً أو صاحب مطعم واربطه بمطعم محدد.">
            <form onSubmit={saveUser} className="grid gap-3 md:grid-cols-2">
              <Field label="الاسم" value={userForm.name} onChange={(name) => setUserForm({ ...userForm, name })} />
              <Field label="البريد الإلكتروني" value={userForm.email} onChange={(nextEmail) => setUserForm({ ...userForm, email: nextEmail })} type="email" />
              <Field label={editingUserId ? "كلمة مرور جديدة (اختياري)" : "كلمة المرور"} value={userForm.password} onChange={(nextPassword) => setUserForm({ ...userForm, password: nextPassword })} type="password" />
              <SelectField
                label="الدور"
                value={userForm.role}
                options={[
                  { value: "restaurantOwner", label: "صاحب مطعم" },
                  { value: "superAdmin", label: "مسؤول عام" }
                ]}
                onChange={(role) => setUserForm({ ...userForm, role: role as UserRole })}
              />
              {userForm.role === "restaurantOwner" ? (
                <SelectField
                  label="المطعم"
                  value={userForm.restaurantId}
                  options={[{ value: "", label: "اختر مطعماً" }, ...restaurants.map((restaurant) => ({ value: restaurant.id, label: restaurant.name }))]}
                  onChange={(restaurantId) => setUserForm({ ...userForm, restaurantId })}
                />
              ) : null}
              <label className="flex items-center gap-2 text-sm font-black">
                <input type="checkbox" checked={userForm.isActive} onChange={(event) => setUserForm({ ...userForm, isActive: event.target.checked })} />
                المستخدم فعال
              </label>
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <PrimaryButton disabled={busy}>
                  <Users className="h-4 w-4" />
                  {editingUserId ? "تحديث المستخدم" : "إضافة مستخدم"}
                </PrimaryButton>
                {editingUserId ? (
                  <button type="button" onClick={() => { setEditingUserId(""); setUserForm(emptyUser); }} className="h-11 rounded-md border border-slate-200 bg-white px-4 font-black text-slate-700">
                    إلغاء
                  </button>
                ) : null}
              </div>
            </form>
            <List>
              {users.map((user) => (
                <ListRow key={user.id} title={user.name} meta={`${user.email} - ${user.role === "superAdmin" ? "مسؤول عام" : "صاحب مطعم"}`}>
                  <IconButton label="تعديل" onClick={() => editUser(user)}>
                    <Edit3 className="h-4 w-4" />
                  </IconButton>
                </ListRow>
              ))}
            </List>
          </Panel>

          {selectedId ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="الأقسام" description="رتّب أقسام المنيو وحدد الظاهر منها.">
                <form onSubmit={saveCategory} className="grid gap-3 sm:grid-cols-[1fr_110px_auto_auto]">
                  <Field label="اسم القسم" value={categoryForm.name} onChange={(name) => setCategoryForm({ ...categoryForm, name })} />
                  <NumberField label="الترتيب" value={categoryForm.order} onChange={(order) => setCategoryForm({ ...categoryForm, order })} />
                  <label className="flex items-end gap-2 pb-3 text-sm font-black">
                    <input type="checkbox" checked={categoryForm.isActive} onChange={(event) => setCategoryForm({ ...categoryForm, isActive: event.target.checked })} />
                    فعال
                  </label>
                  <button className="self-end rounded-md bg-slate-950 px-4 py-3 font-black text-white">{editingCategoryId ? "تحديث" : "إضافة"}</button>
                </form>
                <List>
                  {categories.map((category) => (
                    <ListRow key={category.id} title={category.name} meta={`ترتيب ${category.order} - ${category.isActive ? "ظاهر" : "مخفي"}`}>
                      <IconButton label="تعديل" onClick={() => editCategory(category)}>
                        <Edit3 className="h-4 w-4" />
                      </IconButton>
                      <IconButton label="حذف" onClick={() => void deleteCategory(category.id)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </ListRow>
                  ))}
                </List>
              </Panel>

              <Panel title="الأصناف" description="أضف الأسعار والصور والبادجات. التمييز متاح فقط للباقة Premium.">
                <form onSubmit={saveItem} className="grid gap-3 sm:grid-cols-2">
                  <Field label="اسم الصنف" value={itemForm.name} onChange={(name) => setItemForm({ ...itemForm, name })} />
                  <NumberField label="السعر" value={itemForm.price} onChange={(price) => setItemForm({ ...itemForm, price })} />
                  <Field label="الصورة URL" value={itemForm.image} onChange={(image) => setItemForm({ ...itemForm, image })} />
                  <NumberField label="الترتيب" value={itemForm.order} onChange={(order) => setItemForm({ ...itemForm, order })} />
                  <SelectField
                    label="القسم"
                    value={itemForm.categoryId}
                    options={[{ value: "", label: "اختر قسماً" }, ...categories.map((category) => ({ value: category.id, label: category.name }))]}
                    onChange={(categoryId) => setItemForm({ ...itemForm, categoryId })}
                  />
                  <div className="flex flex-wrap items-end gap-3 pb-3 text-sm font-black">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={itemForm.isAvailable} onChange={(event) => setItemForm({ ...itemForm, isAvailable: event.target.checked })} />
                      متاح
                    </label>
                    <label className={`flex items-center gap-2 ${restaurantForm.plan !== "premium" ? "opacity-45" : ""}`}>
                      <input
                        type="checkbox"
                        disabled={restaurantForm.plan !== "premium"}
                        checked={restaurantForm.plan === "premium" && itemForm.isFeatured}
                        onChange={(event) => setItemForm({ ...itemForm, isFeatured: event.target.checked })}
                      />
                      مميز
                    </label>
                  </div>
                  <label className="sm:col-span-2">
                    <span className="text-sm font-black">الوصف</span>
                    <textarea
                      value={itemForm.description}
                      onChange={(event) => setItemForm({ ...itemForm, description: event.target.value })}
                      className="mt-1 min-h-20 w-full rounded-md border border-slate-200 bg-white p-3 font-bold outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    {badgeOptions.map((badge) => (
                      <label key={badge} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-black">
                        <input type="checkbox" checked={itemForm.badges.includes(badge)} onChange={() => toggleBadge(badge)} />
                        {badgeLabel(badge)}
                      </label>
                    ))}
                  </div>
                  <button className="rounded-md bg-slate-950 px-4 py-3 font-black text-white sm:col-span-2">{editingItemId ? "تحديث الصنف" : "إضافة صنف"}</button>
                </form>
                <List>
                  {items.map((item) => (
                    <ListRow key={item.id} title={item.name} meta={`${formatMoney(item.price, restaurantForm.currency)}${item.isFeatured ? " - مميز" : ""}`}>
                      <IconButton label="تعديل" onClick={() => editItem(item)}>
                        <Edit3 className="h-4 w-4" />
                      </IconButton>
                      <IconButton label="حذف" onClick={() => void deleteItem(item.id)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </ListRow>
                  ))}
                </List>
              </Panel>
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
