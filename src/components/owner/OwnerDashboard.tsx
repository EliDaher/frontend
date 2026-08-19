"use client";

import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  Eye,
  FolderOpen,
  LogOut,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Utensils
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { MenuTemplateRenderer } from "@/components/menu/MenuTemplateRenderer";
import { PopupForm } from "@/components/shared";
import { OwnerRecipeEditorModal } from "./OwnerRecipeEditorModal";
import { Chip, ColorField, EmptyState, Field, FormErrors, IconButton, ImageUpload, ItemRow, ListRow, MessageBox, NumberField, Panel, PrimaryButton, ReadOnlyField, SelectField, StatusPill, TextArea, Toggle, Warning } from "./OwnerDashboardParts";
import { adminRequest } from "@/lib/api";
import { formatInteger, formatMoney } from "@/lib/format";
import { normalizeModules } from "@/lib/modules";
import { normalizeTemplate, planLabels, planTemplates, templateLabels, planLimits, subscriptionLabels } from "@/lib/plans";
import type { Category, MenuItem, MenuTemplate, Restaurant, Theme } from "@/types/menu";
import type { InventoryItem, RecipeDraftLine, RecipeIngredient } from "@/types/ops";

type TabId = "items" | "design" | "details" | "categories";
type RestaurantForm = Pick<
  Restaurant,
  "slug" | "name" | "logo" | "coverImage" | "description" | "phone" | "address" | "currency" | "receiptRestaurantName" | "vatNumber" | "receiptLocation" | "receiptPrinterIp" | "receiptPrinterPort" | "isActive" | "template" | "theme"
>;
type CategoryForm = Omit<Category, "id">;
type ItemForm = Omit<MenuItem, "id" | "createdAt" | "updatedAt">;

const defaultTheme: Theme = {
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
  receiptRestaurantName: "",
  vatNumber: "105200001740",
  receiptLocation: "",
  receiptPrinterIp: "",
  receiptPrinterPort: 9100,
  isActive: true,
  template: "classic",
  theme: defaultTheme
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

const tabs: Array<{ id: TabId; label: string; icon: typeof Utensils }> = [
  { id: "items", label: "الأصناف", icon: Utensils },
  { id: "design", label: "التصميم", icon: Palette },
  { id: "details", label: "البيانات", icon: Sparkles },
  { id: "categories", label: "الأقسام", icon: FolderOpen }
];

const badgeOptions: Array<{ value: ItemForm["badges"][number]; label: string }> = [
  { value: "popular", label: "الأكثر طلباً" },
  { value: "new", label: "جديد" },
  { value: "spicy", label: "حار" }
];

const colorPresets = [
  { name: "ذهبي", primaryColor: "#b45309", secondaryColor: "#f59e0b", backgroundColor: "#fffaf0", textColor: "#1f2937" },
  { name: "فاخر", primaryColor: "#d4af37", secondaryColor: "#7c3aed", backgroundColor: "#09090b", textColor: "#ffffff" },
  { name: "كافيه", primaryColor: "#9a3412", secondaryColor: "#f97316", backgroundColor: "#fff7ed", textColor: "#2f1b12" },
  { name: "هادئ", primaryColor: "#0f766e", secondaryColor: "#14b8a6", backgroundColor: "#f8fafc", textColor: "#0f172a" }
];

export function OwnerDashboard({ embedded = false }: { embedded?: boolean } = {}) {
  const [token, setToken] = useState("");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [form, setForm] = useState<RestaurantForm>(emptyRestaurant);
  const [savedForm, setSavedForm] = useState<RestaurantForm>(emptyRestaurant);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [recipes, setRecipes] = useState<RecipeIngredient[]>([]);
  const [recipeItem, setRecipeItem] = useState<MenuItem | null>(null);
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraftLine[]>([]);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategory);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItem);
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [editingItemId, setEditingItemId] = useState("");
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("items");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const allowedTemplates = restaurant ? planTemplates[restaurant.plan] : planTemplates.basic;
  const currentLimits = restaurant ? planLimits[restaurant.plan] : planLimits.basic;
  const modules = restaurant ? normalizeModules(restaurant.plan, restaurant.modules) : null;
  const inventoryRecipesEnabled = modules?.inventory ?? false;
  const atItemLimit = !editingItemId && items.length >= currentLimits.maxItems;
  const atCategoryLimit = !editingCategoryId && categories.length >= currentLimits.maxCategories;
  const activeCategories = categories.filter((category) => category.isActive);
  const normalizedQuery = normalizeSearch(query);
  const hasUnsavedDesign = JSON.stringify(form) !== JSON.stringify(savedForm);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCategory = categoryFilter === "all" || item.categoryId === categoryFilter;
      const matchesQuery =
        !normalizedQuery ||
        normalizeSearch(item.name).includes(normalizedQuery) ||
        normalizeSearch(item.description).includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [items, categoryFilter, normalizedQuery]);

  const itemErrors = getItemErrors(itemForm, categories);
  const categoryErrors = getCategoryErrors(categoryForm);
  const detailsErrors = getDetailsErrors(form);

  useEffect(() => {
    const storedToken = window.localStorage.getItem("menu-owner-token");
    if (!storedToken) {
      window.location.href = "/owner/login";
      return;
    }

    setToken(storedToken);
    void refresh(storedToken);
  }, []);

  async function run(action: () => Promise<void>, success?: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (success) setMessage({ type: "success", text: success });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "حدث خطأ غير متوقع." });
    } finally {
      setBusy(false);
    }
  }

  async function refresh(authToken = token) {
    await run(async () => {
      const [nextRestaurant, nextCategories, nextItems] = await Promise.all([
        adminRequest<Restaurant>("/api/owner/restaurant", authToken),
        adminRequest<Category[]>("/api/owner/categories", authToken),
        adminRequest<MenuItem[]>("/api/owner/items", authToken)
      ]);
      const nextModules = normalizeModules(nextRestaurant.plan, nextRestaurant.modules);
      const [nextInventoryItems, nextRecipes] = nextModules.inventory
        ? await Promise.all([
            adminRequest<InventoryItem[]>("/api/owner/ops/inventory/items", authToken).catch(() => []),
            adminRequest<RecipeIngredient[]>("/api/owner/ops/recipes", authToken).catch(() => [])
          ])
        : [[], []];

      const nextForm = toRestaurantForm(nextRestaurant);
      setRestaurant(nextRestaurant);
      setForm(nextForm);
      setSavedForm(nextForm);
      setCategories(nextCategories);
      setItems(nextItems);
      setInventoryItems(nextInventoryItems);
      setRecipes(nextRecipes);
      resetCategoryForm();
      resetItemForm(nextCategories);
    });
  }

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (detailsErrors.length) return;
    await run(async () => {
      await adminRequest("/api/owner/restaurant", token, {
        method: "PATCH",
        body: JSON.stringify({
          slug: form.slug,
          name: form.name,
          description: form.description,
          phone: form.phone,
          address: form.address,
          currency: form.currency,
          receiptRestaurantName: form.receiptRestaurantName,
          vatNumber: form.vatNumber,
          receiptLocation: form.receiptLocation,
          receiptPrinterIp: form.receiptPrinterIp,
          receiptPrinterPort: form.receiptPrinterPort,
          isActive: form.isActive
        })
      });
      await refresh();
    }, "تم حفظ بيانات المطعم.");
  }

  async function saveDesign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      await adminRequest("/api/owner/restaurant/theme", token, {
        method: "PATCH",
        body: JSON.stringify({
          template: form.template,
          theme: form.theme,
          logo: form.logo,
          coverImage: form.coverImage
        })
      });
      await refresh();
    }, "تم حفظ التصميم.");
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (categoryErrors.length) return;
    const path = editingCategoryId ? `/api/owner/categories/${editingCategoryId}` : "/api/owner/categories";
    await run(async () => {
      await adminRequest(path, token, {
        method: editingCategoryId ? "PATCH" : "POST",
        body: JSON.stringify(categoryForm)
      });
      await refresh();
    }, editingCategoryId ? "تم تحديث القسم." : "تمت إضافة القسم.");
  }

  async function removeCategory(categoryId: string) {
    const hasItems = items.some((item) => item.categoryId === categoryId);
    const warning = hasItems ? "هذا القسم يحتوي أصنافاً. حذف القسم قد يترك هذه الأصناف بلا قسم. هل تريد المتابعة؟" : "هل تريد حذف هذا القسم؟";
    if (!window.confirm(warning)) return;

    await run(async () => {
      await adminRequest(`/api/owner/categories/${categoryId}`, token, { method: "DELETE" });
      await refresh();
    }, "تم حذف القسم.");
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (itemErrors.length) return;
    const path = editingItemId ? `/api/owner/items/${editingItemId}` : "/api/owner/items";
    await run(async () => {
      await adminRequest(path, token, {
        method: editingItemId ? "PATCH" : "POST",
        body: JSON.stringify({
          ...itemForm,
          name: itemForm.name.trim(),
          description: itemForm.description.trim(),
          image: itemForm.image.trim(),
          isFeatured: restaurant?.plan === "premium" ? itemForm.isFeatured : false
        })
      });
      await refresh();
    }, editingItemId ? "تم تحديث الصنف." : "تمت إضافة الصنف.");
  }

  async function removeItem(itemId: string) {
    if (!window.confirm("هل تريد حذف هذا الصنف؟")) return;
    await run(async () => {
      await adminRequest(`/api/owner/items/${itemId}`, token, { method: "DELETE" });
      await refresh();
    }, "تم حذف الصنف.");
  }

  function openRecipeEditor(item: MenuItem) {
    setRecipeItem(item);
    const currentRecipe = recipes.filter((entry) => entry.menuItemId === item.id);
    setRecipeDraft(
      currentRecipe.length
        ? currentRecipe.map((entry) => ({
            inventoryItemId: entry.inventoryItemId,
            quantity: entry.quantity,
            unit: entry.unit || inventoryItems.find((inventoryItem) => inventoryItem.id === entry.inventoryItemId)?.unit || ""
          }))
        : [{ inventoryItemId: inventoryItems[0]?.id || "", quantity: 1, unit: inventoryItems[0]?.unit || "" }]
    );
  }

  function updateRecipeDraft(index: number, patch: Partial<RecipeDraftLine>) {
    setRecipeDraft((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const nextInventoryItemId = patch.inventoryItemId ?? line.inventoryItemId;
        const selectedInventoryItem = inventoryItems.find((item) => item.id === nextInventoryItemId);
        return {
          ...line,
          ...patch,
          inventoryItemId: nextInventoryItemId,
          quantity: Math.max(0.0001, Number(patch.quantity ?? line.quantity)),
          unit: patch.inventoryItemId ? selectedInventoryItem?.unit || line.unit : patch.unit ?? line.unit
        };
      })
    );
  }

  async function saveRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recipeItem) return;
    const ingredients = recipeDraft.filter((line) => line.inventoryItemId && line.quantity > 0);
    await run(async () => {
      await adminRequest(`/api/owner/ops/recipes/menu-items/${recipeItem.id}`, token, {
        method: "PUT",
        body: JSON.stringify({ ingredients })
      });
      setRecipeItem(null);
      setRecipeDraft([]);
      await refresh();
    }, "تم حفظ مكونات الصنف.");
  }

  if (!restaurant) {
    const LoadingRoot = embedded ? "div" : "main";
    return (
      <LoadingRoot className="grid min-h-[320px] place-items-center bg-[#f6f7f9] px-4" dir="rtl">
        <div className="text-center">
          <RefreshCw className="mx-auto h-7 w-7 animate-spin text-amber-600" />
          <p className="mt-3 font-black text-slate-700">جاري تحميل لوحة المطعم...</p>
          {message ? <MessageBox message={message} /> : null}
        </div>
      </LoadingRoot>
    );
  }

  const Root = embedded ? "div" : "main";

  return (
    <Root className={embedded ? "text-slate-950" : "min-h-screen bg-[#f5f6f8] text-slate-950"} dir="rtl">
      {!embedded ? <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black text-amber-700">لوحة صاحب المطعم</p>
            <h1 className="truncate text-xl font-black">{restaurant.name}</h1>
          </div>
          <div className="flex shrink-0 gap-2">
            <a
              href={`/${restaurant.slug}`}
              target="_blank"
              className="hidden h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-black text-white transition hover:-translate-y-0.5 sm:inline-flex"
            >
              <Eye className="h-4 w-4" />
              عرض المنيو
            </a>
            <IconButton label="تحديث" onClick={() => void refresh()}>
              <RefreshCw className="h-4 w-4" />
            </IconButton>
            <IconButton label="خروج" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
      </header> : null}

      <div className={embedded ? "mx-auto max-w-7xl" : "mx-auto max-w-7xl p-4"}>
        <section className="mb-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill active={restaurant.isActive} />
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{planLabels[restaurant.plan]}</span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600 ring-1 ring-slate-200">
                {formatInteger(items.length)} صنف
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600 ring-1 ring-slate-200">
                {formatInteger(categories.length)} / {formatInteger(currentLimits.maxCategories)} sections
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600 ring-1 ring-slate-200">
                {formatInteger(items.length)} / {formatInteger(currentLimits.maxItems)} items
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-7 text-slate-500">
              عدّل المنيو بسرعة. التغييرات تحفظ عند الضغط على زر الحفظ فقط، ومعاينة التصميم تعرض الشكل قبل الحفظ.
            </p>
          </div>
          <a
            href={`/${restaurant.slug}`}
            target="_blank"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-black text-white transition hover:-translate-y-0.5 sm:hidden"
          >
            <Eye className="h-4 w-4" />
            عرض المنيو
          </a>
        </section>

        <nav className="sticky top-[65px] z-20 mb-4 flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex h-11 min-w-fit items-center justify-center gap-2 rounded-md px-4 text-sm font-black transition ${
                  activeTab === tab.id ? "bg-amber-500 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {message ? <MessageBox message={message} /> : null}

        {activeTab === "items" ? (
          <Panel
            title="الأصناف الحالية"
            description="ابحث، فلتر حسب القسم، ثم اضغط تعديل لنسخ البيانات إلى النموذج."
            action={
              <button
                type="button"
                disabled={atItemLimit}
                onClick={openNewItemForm}
                className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Plus className="h-4 w-4" />
                صنف جديد
              </button>
            }
          >
            {atItemLimit ? <Warning text={"وصلت إلى حد الأصناف في باقة " + planLabels[restaurant.plan] + "."} /> : null}
            <div className="grid gap-3">
              <label className="relative block">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="بحث سريع في الأصناف"
                  className="h-11 w-full rounded-md border border-slate-200 bg-white px-10 font-bold outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                />
              </label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <Chip active={categoryFilter === "all"} label="كل الأقسام" onClick={() => setCategoryFilter("all")} />
                {categories.map((category) => (
                  <Chip key={category.id} active={categoryFilter === category.id} label={category.name} onClick={() => setCategoryFilter(category.id)} />
                ))}
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              {filteredItems.length ? (
                filteredItems.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    currency={restaurant.currency}
                    recipeCount={recipes.filter((entry) => entry.menuItemId === item.id).length}
                    canEditRecipe={inventoryRecipesEnabled && inventoryItems.length > 0}
                    onRecipe={() => openRecipeEditor(item)}
                    categoryName={categories.find((category) => category.id === item.categoryId)?.name ?? "بدون قسم"}
                    onEdit={() => editItem(item)}
                    onDelete={() => void removeItem(item.id)}
                  />
                ))
              ) : (
                <EmptyState title="لا توجد أصناف مطابقة" text="جرّب مسح البحث أو تغيير القسم." />
              )}
            </div>
          </Panel>
        ) : null}

        {activeTab === "design" ? (
          <form onSubmit={saveDesign} className="grid gap-4 xl:grid-cols-[minmax(360px,460px)_1fr]">
            <Panel title="إعدادات التصميم" description="اختر القالب والألوان ثم راقب المعاينة قبل الحفظ.">
              {hasUnsavedDesign ? <Warning text="هناك تغييرات غير محفوظة في التصميم. المعاينة تعرض الشكل الجديد قبل الحفظ." /> : null}
              <div className="grid gap-3">
                <SelectField
                  label="القالب"
                  value={normalizeTemplate(restaurant.plan, form.template)}
                  options={allowedTemplates.map((template) => ({ value: template, label: templateLabels[template] }))}
                  onChange={(template) => setForm({ ...form, template: template as MenuTemplate })}
                />
                <ReadOnlyField label="الباقة الحالية" value={planLabels[restaurant.plan]} />
                <Field label="الشعار URL" value={form.logo} onChange={(logo) => setForm({ ...form, logo })} placeholder="اختياري" />
                <Field label="صورة الغلاف URL" value={form.coverImage} onChange={(coverImage) => setForm({ ...form, coverImage })} placeholder="اختياري" />
                <div className="grid gap-2">
                  <p className="text-sm font-black">ألوان جاهزة</p>
                  <div className="grid grid-cols-2 gap-2">
                    {colorPresets.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => applyPreset(preset)}
                        className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm font-black transition hover:border-amber-300"
                      >
                        <span className="h-6 w-6 rounded-full" style={{ backgroundColor: preset.primaryColor }} />
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
                <ColorField label="اللون الأساسي" value={form.theme.primaryColor} onChange={(value) => setTheme("primaryColor", value)} />
                <ColorField label="اللون الثانوي" value={form.theme.secondaryColor} onChange={(value) => setTheme("secondaryColor", value)} />
                <ColorField label="الخلفية" value={form.theme.backgroundColor} onChange={(value) => setTheme("backgroundColor", value)} />
                <ColorField label="لون النص" value={form.theme.textColor} onChange={(value) => setTheme("textColor", value)} />
                <PrimaryButton disabled={busy || !hasUnsavedDesign}>
                  <Save className="h-4 w-4" />
                  حفظ التصميم
                </PrimaryButton>
              </div>
            </Panel>
            <Panel title="معاينة قبل الحفظ" description="هذه المعاينة تستخدم القيم الحالية في النموذج مباشرة.">
              <AccurateMenuPreview form={form} plan={restaurant.plan} categories={activeCategories} items={items} />
            </Panel>
          </form>
        ) : null}

        {activeTab === "details" ? (
          <Panel title="بيانات المطعم" description="تظهر هذه المعلومات في صفحة المنيو العامة. الباقة لا يمكن تعديلها من حساب صاحب المطعم.">
            <form onSubmit={saveDetails} className="grid gap-3 md:grid-cols-2">
              <Field label="اسم المطعم" value={form.name} onChange={(name) => setForm({ ...form, name })} />
              <Field label="Slug" value={form.slug} onChange={(slug) => setForm({ ...form, slug })} />
              <Field label="الهاتف" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
              <Field label="العنوان" value={form.address} onChange={(address) => setForm({ ...form, address })} />
              <Field label="العملة" value={form.currency} onChange={(currency) => setForm({ ...form, currency })} />
              <Field label="اسم المطعم على الفاتورة" value={form.receiptRestaurantName ?? ""} onChange={(receiptRestaurantName) => setForm({ ...form, receiptRestaurantName })} />
              <Field label="VAT" value={form.vatNumber ?? ""} onChange={(vatNumber) => setForm({ ...form, vatNumber })} />
              <Field label="موقع الإيصال" value={form.receiptLocation ?? ""} onChange={(receiptLocation) => setForm({ ...form, receiptLocation })} />
              <Field label="IP الطابعة" value={form.receiptPrinterIp ?? ""} onChange={(receiptPrinterIp) => setForm({ ...form, receiptPrinterIp })} />
              <NumberField label="منفذ الطابعة" value={form.receiptPrinterPort ?? 9100} onChange={(receiptPrinterPort) => setForm({ ...form, receiptPrinterPort })} />
              <ReadOnlyField label="الباقة" value={planLabels[restaurant.plan]} />
              <div className="md:col-span-2">
                <TextArea label="الوصف" value={form.description} onChange={(description) => setForm({ ...form, description })} />
              </div>
              <Toggle checked={form.isActive} label="المطعم فعال" onChange={(isActive) => setForm({ ...form, isActive })} />
              <div className="md:col-span-2">
                <FormErrors errors={detailsErrors} />
                <PrimaryButton disabled={busy || detailsErrors.length > 0}>
                  <Save className="h-4 w-4" />
                  حفظ البيانات
                </PrimaryButton>
              </div>
            </form>
          </Panel>
        ) : null}

        {activeTab === "categories" ? (
          <Panel
            title="الأقسام الحالية"
            description="يمكن إخفاء قسم بدون حذفه عبر تعديل حالته."
            action={
              <button
                type="button"
                disabled={atCategoryLimit}
                onClick={openNewCategoryForm}
                className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Plus className="h-4 w-4" />
                قسم جديد
              </button>
            }
          >
            {atCategoryLimit ? <Warning text={"وصلت إلى حد الأقسام في باقة " + planLabels[restaurant.plan] + "."} /> : null}
            <div className="grid gap-3">
              {categories.length ? (
                categories.map((category) => (
                  <ListRow
                    key={category.id}
                    title={category.name}
                    meta={"ترتيب " + category.order + " - " + (category.isActive ? "ظاهر" : "مخفي")}
                    muted={!category.isActive}
                  >
                    <IconButton label="تعديل" onClick={() => editCategory(category)}>
                      <Save className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="حذف" onClick={() => void removeCategory(category.id)}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </ListRow>
                ))
              ) : (
                <EmptyState title="لا توجد أقسام بعد" text="أضف أول قسم لتبدأ ترتيب المنيو." />
              )}
            </div>
          </Panel>
        ) : null}

        <PopupForm
          open={itemFormOpen}
          onClose={closeItemForm}
          title={editingItemId ? "تعديل صنف" : "إضافة صنف"}
          description="أدخل البيانات الأساسية فقط. لا يمكن حفظ الصنف بدون اسم، سعر صحيح، وقسم."
          maxWidth="xl"
        >
          {categories.length === 0 ? (
            <Warning text="أضف قسماً أولاً قبل إضافة الأصناف." />
          ) : null}
          {atItemLimit ? <Warning text={"وصلت إلى حد الأصناف في باقة " + planLabels[restaurant.plan] + "."} /> : null}
          <form onSubmit={saveItem} className="grid gap-3">
            <Field label="اسم الصنف" value={itemForm.name} onChange={(name) => setItemForm({ ...itemForm, name })} placeholder="مثال: برغر كلاسيك" />
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField label="السعر" value={itemForm.price} onChange={(price) => setItemForm({ ...itemForm, price })} />
              <NumberField label="الترتيب" value={itemForm.order} onChange={(order) => setItemForm({ ...itemForm, order })} />
            </div>
            <SelectField
              label="القسم"
              value={itemForm.categoryId}
              options={[{ value: "", label: "اختر قسماً" }, ...categories.map((category) => ({ value: category.id, label: category.name }))]}
              onChange={(categoryId) => setItemForm({ ...itemForm, categoryId })}
            />
            <Field label="رابط الصورة" value={itemForm.image} onChange={(image) => setItemForm({ ...itemForm, image })} placeholder="https://..." />
            <TextArea label="الوصف" value={itemForm.description} onChange={(description) => setItemForm({ ...itemForm, description })} />
            <ImageUpload label="رفع صورة الصنف" onUpload={(file) => uploadImage(file, (url) => setItemForm((current) => ({ ...current, image: url })))} />
            <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-black">الحالة والوسوم</p>
              <div className="flex flex-wrap gap-2">
                <Toggle checked={itemForm.isAvailable} label="متاح" onChange={(isAvailable) => setItemForm({ ...itemForm, isAvailable })} />
                <Toggle
                  checked={restaurant.plan === "premium" && itemForm.isFeatured}
                  disabled={restaurant.plan !== "premium"}
                  label="مميز"
                  onChange={(isFeatured) => setItemForm({ ...itemForm, isFeatured })}
                />
                {badgeOptions.map((badge) => (
                  <Toggle key={badge.value} checked={itemForm.badges.includes(badge.value)} label={badge.label} onChange={() => toggleBadge(badge.value)} />
                ))}
              </div>
              {restaurant.plan !== "premium" ? <p className="text-xs font-bold text-slate-500">تمييز الأصناف متاح فقط في باقة Premium.</p> : null}
            </div>
            <FormErrors errors={itemErrors} />
            <div className="flex flex-wrap gap-2">
              <PrimaryButton disabled={busy || itemErrors.length > 0 || atItemLimit}>
                <Save className="h-4 w-4" />
                {editingItemId ? "حفظ التعديل" : "إضافة الصنف"}
              </PrimaryButton>
              <button type="button" onClick={closeItemForm} className="h-12 rounded-md border border-slate-200 bg-white px-4 font-black text-slate-700">
                إلغاء
              </button>
            </div>
          </form>
        </PopupForm>

        <PopupForm
          open={categoryFormOpen}
          onClose={closeCategoryForm}
          title={editingCategoryId ? "تعديل قسم" : "إضافة قسم"}
          description="الأقسام تساعد الزبون على الوصول بسرعة للأصناف."
          maxWidth="md"
        >
          {atCategoryLimit ? <Warning text={"وصلت إلى حد الأقسام في باقة " + planLabels[restaurant.plan] + "."} /> : null}
          <form onSubmit={saveCategory} className="grid gap-3">
            <Field label="اسم القسم" value={categoryForm.name} onChange={(name) => setCategoryForm({ ...categoryForm, name })} />
            <NumberField label="الترتيب" value={categoryForm.order} onChange={(order) => setCategoryForm({ ...categoryForm, order })} />
            <Toggle checked={categoryForm.isActive} label="القسم ظاهر" onChange={(isActive) => setCategoryForm({ ...categoryForm, isActive })} />
            <FormErrors errors={categoryErrors} />
            <div className="flex flex-wrap gap-2">
              <PrimaryButton disabled={busy || categoryErrors.length > 0 || atCategoryLimit}>
                <Save className="h-4 w-4" />
                {editingCategoryId ? "حفظ القسم" : "إضافة القسم"}
              </PrimaryButton>
              <button type="button" onClick={closeCategoryForm} className="h-12 rounded-md border border-slate-200 bg-white px-4 font-black text-slate-700">
                إلغاء
              </button>
            </div>
          </form>
        </PopupForm>

        <OwnerRecipeEditorModal
          item={recipeItem}
          inventoryItems={inventoryItems}
          recipeDraft={recipeDraft}
          busy={busy}
          onClose={() => setRecipeItem(null)}
          onSubmit={saveRecipe}
          onUpdateLine={updateRecipeDraft}
          onRemoveLine={(index) => setRecipeDraft((current) => current.filter((_, lineIndex) => lineIndex !== index))}
          onAddLine={() => setRecipeDraft((current) => [...current, { inventoryItemId: inventoryItems[0]?.id || "", quantity: 1, unit: inventoryItems[0]?.unit || "" }])}
        />
      </div>
    </Root>
  );

  function setTheme(key: keyof Theme, value: string) {
    setForm({ ...form, theme: { ...form.theme, [key]: value } });
  }

  function applyPreset(preset: (typeof colorPresets)[number]) {
    setForm({
      ...form,
      theme: {
        ...form.theme,
        primaryColor: preset.primaryColor,
        secondaryColor: preset.secondaryColor,
        backgroundColor: preset.backgroundColor,
        textColor: preset.textColor
      }
    });
  }

  function openNewCategoryForm() {
    resetCategoryForm();
    setActiveTab("categories");
    setCategoryFormOpen(true);
  }

  function closeCategoryForm() {
    setCategoryFormOpen(false);
    resetCategoryForm();
  }

  function editCategory(category: Category) {
    setEditingCategoryId(category.id);
    setCategoryForm({ name: category.name, order: category.order, isActive: category.isActive });
    setActiveTab("categories");
    setCategoryFormOpen(true);
  }

  function resetCategoryForm() {
    setEditingCategoryId("");
    setCategoryForm(emptyCategory);
  }

  function openNewItemForm() {
    resetItemForm(categories);
    setActiveTab("items");
    setItemFormOpen(true);
  }

  function closeItemForm() {
    setItemFormOpen(false);
    resetItemForm(categories);
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
      isFeatured: item.isFeatured,
      badges: item.badges
    });
    setActiveTab("items");
    setItemFormOpen(true);
  }

  function resetItemForm(nextCategories = categories) {
    setEditingItemId("");
    setItemForm({ ...emptyItem, categoryId: nextCategories[0]?.id ?? "" });
  }

  function toggleBadge(badge: ItemForm["badges"][number]) {
    setItemForm({
      ...itemForm,
      badges: itemForm.badges.includes(badge)
        ? itemForm.badges.filter((current) => current !== badge)
        : [...itemForm.badges, badge]
    });
  }

  async function uploadImage(file: File, onDone: (url: string) => void) {
    await run(async () => {
      const dataUrl = await fileToDataUrl(file);
      const result = await adminRequest<{ url: string }>("/api/owner/uploads/image", token, {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, dataUrl })
      });
      onDone(result.url);
    }, "تم رفع الصورة.");
  }

  function logout() {
    window.localStorage.removeItem("menu-owner-token");
    window.location.href = "/owner/login";
  }
}

function toRestaurantForm(restaurant: Restaurant): RestaurantForm {
  return {
    slug: restaurant.slug,
    name: restaurant.name,
    logo: restaurant.logo,
    coverImage: restaurant.coverImage,
    description: restaurant.description,
    phone: restaurant.phone,
    address: restaurant.address,
    currency: restaurant.currency,
    receiptRestaurantName: restaurant.receiptRestaurantName ?? "",
    vatNumber: restaurant.vatNumber ?? "105200001740",
    receiptLocation: restaurant.receiptLocation ?? "",
    receiptPrinterIp: restaurant.receiptPrinterIp ?? "",
    receiptPrinterPort: restaurant.receiptPrinterPort ?? 9100,
    isActive: restaurant.isActive,
    template: normalizeTemplate(restaurant.plan, restaurant.template),
    theme: restaurant.theme ?? defaultTheme
  };
}

function getItemErrors(item: ItemForm, categories: Category[]) {
  const errors: string[] = [];
  if (!item.name.trim()) errors.push("اسم الصنف مطلوب.");
  if (!Number.isFinite(item.price) || item.price <= 0) errors.push("السعر يجب أن يكون أكبر من صفر.");
  if (!item.categoryId) errors.push("اختر قسماً للصنف.");
  if (item.categoryId && !categories.some((category) => category.id === item.categoryId)) errors.push("القسم المحدد غير موجود.");
  return errors;
}

function getCategoryErrors(category: CategoryForm) {
  const errors: string[] = [];
  if (!category.name.trim()) errors.push("اسم القسم مطلوب.");
  if (!Number.isFinite(category.order) || category.order < 0) errors.push("الترتيب يجب أن يكون صفراً أو أكبر.");
  return errors;
}

function getDetailsErrors(form: RestaurantForm) {
  const errors: string[] = [];
  if (!form.name.trim()) errors.push("اسم المطعم مطلوب.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) errors.push("الرابط يجب أن يكون أحرفاً إنجليزية صغيرة وأرقاماً وشرطات فقط.");
  if (!form.currency.trim()) errors.push("العملة مطلوبة.");
  return errors;
}

function normalizeSearch(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("تعذر قراءة الصورة."));
    reader.readAsDataURL(file);
  });
}

function AccurateMenuPreview({
  form,
  plan,
  categories,
  items
}: {
  form: RestaurantForm;
  plan: Restaurant["plan"];
  categories: Category[];
  items: MenuItem[];
}) {
  const previewCategories = categories.length ? categories : [{ id: "demo", name: "الأطباق", order: 1, isActive: true }];
  const previewItems = items.length ? items.slice(0, 8) : demoItemsClean();
  const previewRestaurant: Restaurant = {
    id: "preview",
    slug: form.slug || "preview",
    name: form.name || "اسم المطعم",
    logo: form.logo,
    coverImage: form.coverImage,
    description: form.description || "وصف قصير يظهر في بداية المنيو.",
    phone: form.phone,
    address: form.address,
    currency: form.currency || "SYP",
    receiptRestaurantName: form.receiptRestaurantName ?? "",
    vatNumber: form.vatNumber ?? "105200001740",
    receiptLocation: form.receiptLocation ?? "",
    receiptPrinterIp: form.receiptPrinterIp ?? "",
    receiptPrinterPort: form.receiptPrinterPort ?? 9100,
    isActive: form.isActive,
    plan,
    template: form.template,
    theme: form.theme
  };

  return (
    <div className="mx-auto max-w-[430px]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div>
          <p className="text-xs font-black text-slate-500">القالب الحالي في المعاينة</p>
          <p className="font-black text-slate-950">
            {templateLabels[form.template]} / {planLabels[plan]}
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600 ring-1 ring-slate-200">
          معاينة مباشرة قبل الحفظ
        </span>
      </div>

      <div className="overflow-hidden rounded-[30px] border-[10px] border-slate-950 bg-slate-950 shadow-[0_28px_70px_rgba(15,23,42,0.22)]">
        <div className="h-[680px] overflow-y-auto rounded-[20px] bg-white [&_.fixed]:hidden">
          <MenuTemplateRenderer restaurant={previewRestaurant} categories={previewCategories} items={previewItems} />
        </div>
      </div>
    </div>
  );
}

function MenuPreview({
  form,
  plan,
  categories,
  items
}: {
  form: RestaurantForm;
  plan: Restaurant["plan"];
  categories: Category[];
  items: MenuItem[];
}) {
  const previewItems = items.slice(0, 3);
  const style = {
    "--preview-primary": form.theme.primaryColor,
    "--preview-secondary": form.theme.secondaryColor
  } as CSSProperties;

  return (
    <div className="mx-auto max-w-md overflow-hidden rounded-[28px] border border-slate-200 bg-slate-950 p-2 shadow-[0_28px_70px_rgba(15,23,42,0.18)]">
      <div className="overflow-hidden rounded-[22px]" style={{ backgroundColor: form.theme.backgroundColor, color: form.theme.textColor }}>
        <div className="bg-[linear-gradient(135deg,var(--preview-primary),var(--preview-secondary))] p-5 text-white" style={style}>
          <p className="text-xs font-black opacity-85">
            {planLabels[plan]} / {templateLabels[form.template]}
          </p>
          <h3 className="mt-2 text-2xl font-black">{form.name || "اسم المطعم"}</h3>
          <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 opacity-90">{form.description || "وصف قصير يظهر في بداية المنيو."}</p>
        </div>
        <div className="border-b border-black/10 bg-white/80 p-3">
          <div className="h-10 rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-bold text-slate-400">بحث في المنيو...</div>
          <div className="mt-3 flex gap-2 overflow-hidden">
            {(categories.length ? categories : [{ id: "demo", name: "الأطباق", order: 1, isActive: true }]).slice(0, 3).map((category, index) => (
              <span
                key={category.id}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${index === 0 ? "bg-[var(--preview-primary)] text-white" : "bg-white text-slate-600"}`}
                style={style}
              >
                {category.name}
              </span>
            ))}
          </div>
        </div>
        <div className="grid gap-3 p-3">
          {(previewItems.length ? previewItems : demoItems()).map((item) => (
            <div key={item.id} className="rounded-lg border border-black/10 bg-white/85 p-3 text-slate-950 shadow-sm">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-black">{item.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{item.description || "وصف مختصر للصنف داخل البطاقة."}</p>
                </div>
                <p className="shrink-0 rounded-md bg-[var(--preview-primary)] px-2 py-1 text-xs font-black text-white" style={style}>
                  {formatMoney(item.price, form.currency)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function demoItemsClean(): MenuItem[] {
  return [
    {
      id: "demo-1",
      name: "طبق مميز",
      description: "وصف مختصر للصنف داخل البطاقة.",
      price: 25000,
      image: "",
      categoryId: "demo",
      order: 1,
      isAvailable: true,
      isFeatured: true,
      badges: ["popular"]
    },
    {
      id: "demo-2",
      name: "مشروب خاص",
      description: "وصف مختصر للصنف داخل البطاقة.",
      price: 15000,
      image: "",
      categoryId: "demo",
      order: 2,
      isAvailable: true,
      isFeatured: false,
      badges: ["new"]
    }
  ];
}

function demoItems(): MenuItem[] {
  return [
    {
      id: "demo-1",
      name: "طبق مميز",
      description: "وصف مختصر للصنف داخل البطاقة.",
      price: 25000,
      image: "",
      categoryId: "demo",
      order: 1,
      isAvailable: true,
      isFeatured: true,
      badges: ["popular"]
    },
    {
      id: "demo-2",
      name: "مشروب خاص",
      description: "وصف مختصر للصنف داخل البطاقة.",
      price: 15000,
      image: "",
      categoryId: "demo",
      order: 2,
      isAvailable: true,
      isFeatured: false,
      badges: ["new"]
    }
  ];
}
