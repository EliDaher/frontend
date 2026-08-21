"use client";

import {
  Boxes,
  Eye,
  FolderOpen,
  Image as ImageIcon,
  LogOut,
  Pencil,
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
import type { CSSProperties, ReactNode } from "react";
import { MenuTemplateRenderer } from "@/components/menu/MenuTemplateRenderer";
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
  AppToolbar,
  PopupForm,
  cn
} from "@/components/shared";
import { OwnerRecipeEditorModal } from "./OwnerRecipeEditorModal";
import { FormErrors, IconButton, MessageBox, Warning } from "./OwnerDashboardParts";
import { adminRequest } from "@/lib/api";
import { formatInteger, formatMoney } from "@/lib/format";
import { normalizeModules } from "@/lib/modules";
import { normalizeTemplate, planLabels, planTemplates, templateLabels, planLimits } from "@/lib/plans";
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
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<Category | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<MenuItem | null>(null);
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
  const activePageHeader = {
    items: { title: "المنتجات", description: "إدارة أصناف المنيو والأسعار والتوفر." },
    design: { title: "التصميم", description: "إعداد القالب والألوان ومعاينة المنيو قبل الحفظ." },
    details: { title: "بيانات المطعم", description: "إدارة المعلومات التي تظهر في صفحة المنيو العامة." },
    categories: { title: "الأقسام", description: "ترتيب أقسام المنيو والتحكم بظهورها." }
  }[activeTab];

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
    await run(async () => {
      await adminRequest(`/api/owner/categories/${categoryId}`, token, { method: "DELETE" });
      setPendingDeleteCategory(null);
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
    await run(async () => {
      await adminRequest(`/api/owner/items/${itemId}`, token, { method: "DELETE" });
      setPendingDeleteItem(null);
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
      <LoadingRoot className="grid min-h-[320px] place-items-center bg-app-bg px-4" dir="rtl">
        <div className="text-center">
          <RefreshCw className="mx-auto h-7 w-7 animate-spin text-app-primary" />
          <p className="mt-3 font-semibold text-app-ink">جاري تحميل لوحة المطعم...</p>
          {message ? <MessageBox message={message} /> : null}
        </div>
      </LoadingRoot>
    );
  }

  const Root = embedded ? "div" : "main";

  return (
    <Root className={embedded ? "text-app-ink" : "min-h-screen bg-app-bg text-app-ink"} dir="rtl">
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
        <AppPageHeader
          className="mb-4"
          title={activePageHeader.title}
          description={activePageHeader.description}
          primaryAction={
            activeTab === "items" ? (
              <AppButton type="button" disabled={atItemLimit} onClick={openNewItemForm} iconStart={<Plus className="h-4 w-4" />}>
                إضافة منتج
              </AppButton>
            ) : activeTab === "categories" ? (
              <AppButton type="button" disabled={atCategoryLimit} onClick={openNewCategoryForm} iconStart={<Plus className="h-4 w-4" />}>
                إضافة قسم
              </AppButton>
            ) : activeTab === "design" ? (
              <a
                href={`/${restaurant.slug}`}
                target="_blank"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-app-md border border-app-border bg-app-surface px-4 text-sm font-semibold text-app-ink transition-colors hover:border-app-border-strong hover:bg-app-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft"
              >
                <Eye className="h-4 w-4" />
                معاينة المنيو
              </a>
            ) : null
          }
          secondaryActions={
            <div className="flex flex-wrap items-center gap-2">
              <AppBadge variant={restaurant.isActive ? "success" : "danger"}>{restaurant.isActive ? "المنيو فعال" : "المنيو متوقف"}</AppBadge>
              <AppBadge variant="neutral">{planLabels[restaurant.plan]}</AppBadge>
              {activeTab === "categories" ? (
                <>
                  <AppBadge variant="neutral">{formatInteger(categories.length)} قسم</AppBadge>
                  <AppBadge variant="neutral">
                    {formatInteger(categories.length)} / {formatInteger(currentLimits.maxCategories)} قسم
                  </AppBadge>
                </>
              ) : activeTab === "design" ? (
                <>
                  <AppBadge variant="neutral">{templateLabels[normalizeTemplate(restaurant.plan, form.template)]}</AppBadge>
                  {hasUnsavedDesign ? <AppBadge variant="warning">غير محفوظ</AppBadge> : null}
                </>
              ) : activeTab === "details" ? (
                <>
                  <AppBadge variant="neutral">{restaurant.slug}</AppBadge>
                  <AppBadge variant="neutral">{form.currency}</AppBadge>
                </>
              ) : (
                <>
                  <AppBadge variant="neutral">{formatInteger(items.length)} صنف</AppBadge>
                  <AppBadge variant="neutral">
                    {formatInteger(items.length)} / {formatInteger(currentLimits.maxItems)} عنصر
                  </AppBadge>
                </>
              )}
            </div>
          }
        />

        <nav className="sticky top-[65px] z-20 mb-4 flex gap-2 overflow-x-auto rounded-app-lg border border-app-border bg-app-surface p-2" aria-label="أقسام إدارة المنيو">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex h-10 min-w-fit items-center justify-center gap-2 rounded-app-md px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft",
                  activeTab === tab.id ? "bg-app-primary-soft text-app-primary" : "text-app-muted hover:bg-app-surface-muted hover:text-app-ink"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {message ? <MessageBox message={message} /> : null}

        {activeTab === "items" ? (
          <AppSurface className="p-4">
            {atItemLimit ? <Warning text={"وصلت إلى حد الأصناف في باقة " + planLabels[restaurant.plan] + "."} /> : null}
            <div className="grid gap-4">
              <AppToolbar
                search={
                  <label className="relative block">
                    <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
                    <AppInput
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="بحث سريع في المنتجات"
                      className="h-10 pe-3 ps-10"
                    />
                  </label>
                }
                filters={
                  <AppSelect value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="min-w-[180px]">
                    <option value="all">كل الأقسام</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </AppSelect>
                }
                actions={
                  <div className="flex items-center gap-2 text-app-meta text-app-muted">
                    <span>{formatInteger(filteredItems.length)} نتيجة</span>
                  </div>
                }
              />

              {filteredItems.length ? (
                <>
                  <ProductTable
                    items={filteredItems}
                    categories={categories}
                    currency={restaurant.currency}
                    recipes={recipes}
                    canEditRecipe={inventoryRecipesEnabled && inventoryItems.length > 0}
                    onRecipe={openRecipeEditor}
                    onEdit={editItem}
                    onDelete={setPendingDeleteItem}
                  />
                  <ProductMobileList
                    items={filteredItems}
                    categories={categories}
                    currency={restaurant.currency}
                    recipes={recipes}
                    canEditRecipe={inventoryRecipesEnabled && inventoryItems.length > 0}
                    onRecipe={openRecipeEditor}
                    onEdit={editItem}
                    onDelete={setPendingDeleteItem}
                  />
                </>
              ) : (
                <AppEmptyState
                  title={items.length ? "لا توجد منتجات مطابقة" : "لا توجد منتجات بعد"}
                  description={items.length ? "جرّب مسح البحث أو تغيير القسم." : "ابدأ بإضافة أول منتج إلى منيو مطعمك."}
                  action={
                    !items.length ? (
                      <AppButton type="button" disabled={atItemLimit} onClick={openNewItemForm} iconStart={<Plus className="h-4 w-4" />}>
                        إضافة منتج
                      </AppButton>
                    ) : null
                  }
                />
              )}
            </div>
          </AppSurface>
        ) : null}

        {activeTab === "design" ? (
          <form onSubmit={saveDesign} className="grid gap-4 xl:grid-cols-[minmax(360px,520px)_1fr]">
            <AppSurface className="p-4">
              {hasUnsavedDesign ? <Warning text="هناك تغييرات غير محفوظة في التصميم. المعاينة تعرض الشكل الجديد قبل الحفظ." /> : null}
              <div className="grid gap-4">
                <ProductFormSection title="القالب">
                  <TemplateSelector
                    value={normalizeTemplate(restaurant.plan, form.template)}
                    templates={allowedTemplates}
                    onChange={(template) => setForm({ ...form, template })}
                  />
                  <AppFieldShell label="الباقة الحالية">
                    <AppInput value={planLabels[restaurant.plan]} readOnly className="bg-app-surface-muted text-app-muted" />
                  </AppFieldShell>
                </ProductFormSection>

                <ProductFormSection title="الهوية والصور">
                  <DesignAssetField
                    label="الشعار URL"
                    value={form.logo}
                    onChange={(logo) => setForm({ ...form, logo })}
                    onUpload={(file) => uploadImage(file, (logo) => setForm((current) => ({ ...current, logo })))}
                  />
                  <DesignAssetField
                    label="صورة الغلاف URL"
                    value={form.coverImage}
                    onChange={(coverImage) => setForm({ ...form, coverImage })}
                    onUpload={(file) => uploadImage(file, (coverImage) => setForm((current) => ({ ...current, coverImage })))}
                  />
                </ProductFormSection>

                <ProductFormSection title="الألوان">
                  <div className="grid gap-2">
                    <p className="text-app-label text-app-ink">ألوان جاهزة</p>
                    <div className="grid grid-cols-2 gap-2">
                      {colorPresets.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => applyPreset(preset)}
                          className="flex h-10 items-center gap-2 rounded-app-md border border-app-border bg-app-surface px-3 text-sm font-semibold text-app-ink transition-colors hover:border-app-primary hover:bg-app-primary-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft"
                        >
                          <span className="h-5 w-5 rounded-app-sm border border-app-border" style={{ backgroundColor: preset.primaryColor }} />
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <AppColorField label="اللون الأساسي" value={form.theme.primaryColor} onChange={(value) => setTheme("primaryColor", value)} />
                  <AppColorField label="اللون الثانوي" value={form.theme.secondaryColor} onChange={(value) => setTheme("secondaryColor", value)} />
                  <AppColorField label="الخلفية" value={form.theme.backgroundColor} onChange={(value) => setTheme("backgroundColor", value)} />
                  <AppColorField label="لون النص" value={form.theme.textColor} onChange={(value) => setTheme("textColor", value)} />
                </ProductFormSection>

                <div className="flex flex-wrap gap-2 border-t border-app-border pt-4">
                  <AppButton type="submit" disabled={busy || !hasUnsavedDesign} loading={busy} iconStart={<Save className="h-4 w-4" />}>
                    حفظ التصميم
                  </AppButton>
                </div>
              </div>
            </AppSurface>
            <AppSurface className="p-4">
              <div className="mb-4">
                <h2 className="text-app-panel-title font-semibold text-app-ink">معاينة قبل الحفظ</h2>
                <p className="mt-1 text-app-helper text-app-muted">هذه المعاينة تستخدم القيم الحالية في النموذج مباشرة.</p>
              </div>
              <AccurateMenuPreview form={form} plan={restaurant.plan} categories={activeCategories} items={items} />
            </AppSurface>
          </form>
        ) : null}

        {activeTab === "details" ? (
          <AppSurface className="p-4">
            <form onSubmit={saveDetails} className="grid gap-4">
              <ProductFormSection title="معلومات المنيو">
                <div className="grid gap-3 md:grid-cols-2">
                  <AppFieldShell label="اسم المطعم">
                    <AppInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} error={detailsErrors.some((error) => error.includes("اسم المطعم"))} />
                  </AppFieldShell>
                  <AppFieldShell label="Slug">
                    <AppInput value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} dir="ltr" error={detailsErrors.some((error) => error.includes("الرابط"))} />
                  </AppFieldShell>
                  <AppFieldShell label="الهاتف">
                    <AppInput value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                  </AppFieldShell>
                  <AppFieldShell label="العنوان">
                    <AppInput value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
                  </AppFieldShell>
                  <AppFieldShell label="العملة">
                    <AppInput value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} error={detailsErrors.some((error) => error.includes("العملة"))} />
                  </AppFieldShell>
                  <AppFieldShell label="الباقة">
                    <AppInput value={planLabels[restaurant.plan]} readOnly className="bg-app-surface-muted text-app-muted" />
                  </AppFieldShell>
                </div>
                <AppFieldShell label="الوصف">
                  <AppTextarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
                </AppFieldShell>
                <ProductToggle checked={form.isActive} label="المطعم فعال" onChange={(isActive) => setForm({ ...form, isActive })} />
              </ProductFormSection>

              <ProductFormSection title="إعدادات الإيصال والطابعة">
                <div className="grid gap-3 md:grid-cols-2">
                  <AppFieldShell label="اسم المطعم على الفاتورة">
                    <AppInput value={form.receiptRestaurantName ?? ""} onChange={(event) => setForm({ ...form, receiptRestaurantName: event.target.value })} />
                  </AppFieldShell>
                  <AppFieldShell label="VAT">
                    <AppInput value={form.vatNumber ?? ""} onChange={(event) => setForm({ ...form, vatNumber: event.target.value })} />
                  </AppFieldShell>
                  <AppFieldShell label="موقع الإيصال">
                    <AppInput value={form.receiptLocation ?? ""} onChange={(event) => setForm({ ...form, receiptLocation: event.target.value })} />
                  </AppFieldShell>
                  <AppFieldShell label="IP الطابعة">
                    <AppInput value={form.receiptPrinterIp ?? ""} onChange={(event) => setForm({ ...form, receiptPrinterIp: event.target.value })} dir="ltr" />
                  </AppFieldShell>
                  <AppFieldShell label="منفذ الطابعة">
                    <AppInput
                      value={form.receiptPrinterPort ?? 9100}
                      onChange={(event) => setForm({ ...form, receiptPrinterPort: Number(event.target.value) })}
                      type="number"
                      min="0"
                      inputMode="numeric"
                    />
                  </AppFieldShell>
                </div>
              </ProductFormSection>

              <FormErrors errors={detailsErrors} />
              <div className="flex flex-wrap gap-2 border-t border-app-border pt-4">
                <AppButton type="submit" disabled={busy || detailsErrors.length > 0} loading={busy} iconStart={<Save className="h-4 w-4" />}>
                  حفظ البيانات
                </AppButton>
              </div>
            </form>
          </AppSurface>
        ) : null}

        {activeTab === "categories" ? (
          <AppSurface className="p-4">
            {atCategoryLimit ? <Warning text={"وصلت إلى حد الأقسام في باقة " + planLabels[restaurant.plan] + "."} /> : null}
            {categories.length ? (
              <CategoryList
                categories={categories}
                items={items}
                onEdit={editCategory}
                onDelete={setPendingDeleteCategory}
              />
            ) : (
              <AppEmptyState
                title="لا توجد أقسام بعد"
                description="ابدأ بإنشاء أول قسم لتنظيم أصناف المنيو."
                action={
                  <AppButton type="button" disabled={atCategoryLimit} onClick={openNewCategoryForm} iconStart={<Plus className="h-4 w-4" />}>
                    إضافة قسم
                  </AppButton>
                }
              />
            )}
          </AppSurface>
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
          <form onSubmit={saveItem} className="grid gap-4">
            <ProductFormSection title="المعلومات الأساسية">
              <AppFieldShell label="اسم المنتج">
                <AppInput
                  value={itemForm.name}
                  onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })}
                  placeholder="مثال: برغر كلاسيك"
                  error={itemErrors.some((error) => error.includes("اسم الصنف"))}
                />
              </AppFieldShell>
              <div className="grid gap-3 sm:grid-cols-2">
                <AppFieldShell label="السعر">
                  <AppInput
                    value={Number.isFinite(itemForm.price) ? itemForm.price : 0}
                    onChange={(event) => setItemForm({ ...itemForm, price: Number(event.target.value) })}
                    type="number"
                    min="0"
                    inputMode="decimal"
                    error={itemErrors.some((error) => error.includes("السعر"))}
                  />
                </AppFieldShell>
                <AppFieldShell label="الترتيب">
                  <AppInput
                    value={Number.isFinite(itemForm.order) ? itemForm.order : 0}
                    onChange={(event) => setItemForm({ ...itemForm, order: Number(event.target.value) })}
                    type="number"
                    min="0"
                    inputMode="numeric"
                  />
                </AppFieldShell>
              </div>
              <AppFieldShell label="القسم">
                <AppSelect
                  value={itemForm.categoryId}
                  onChange={(event) => setItemForm({ ...itemForm, categoryId: event.target.value })}
                  error={itemErrors.some((error) => error.includes("القسم"))}
                >
                  <option value="">اختر قسماً</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </AppSelect>
              </AppFieldShell>
              <AppFieldShell label="الوصف">
                <AppTextarea
                  value={itemForm.description}
                  onChange={(event) => setItemForm({ ...itemForm, description: event.target.value })}
                />
              </AppFieldShell>
            </ProductFormSection>

            <ProductFormSection title="الصورة">
              <div className="grid gap-3 sm:grid-cols-[72px_1fr] sm:items-start">
                <div className="grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-app-lg border border-app-border bg-app-surface-muted text-app-muted">
                  {itemForm.image ? (
                    <img src={itemForm.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-6 w-6" />
                  )}
                </div>
                <div className="grid gap-3">
                  <AppFieldShell label="رابط الصورة">
                    <AppInput
                      value={itemForm.image}
                      onChange={(event) => setItemForm({ ...itemForm, image: event.target.value })}
                      placeholder="https://..."
                      dir="ltr"
                    />
                  </AppFieldShell>
                  <ProductImageUpload
                    onUpload={(file) => uploadImage(file, (url) => setItemForm((current) => ({ ...current, image: url })))}
                  />
                </div>
              </div>
            </ProductFormSection>

            <ProductFormSection title="الحالة والوسوم">
              <div className="flex flex-wrap gap-2">
                <ProductToggle checked={itemForm.isAvailable} label="متاح" onChange={(isAvailable) => setItemForm({ ...itemForm, isAvailable })} />
                <ProductToggle
                  checked={restaurant.plan === "premium" && itemForm.isFeatured}
                  disabled={restaurant.plan !== "premium"}
                  label="مميز"
                  onChange={(isFeatured) => setItemForm({ ...itemForm, isFeatured })}
                />
                {badgeOptions.map((badge) => (
                  <ProductToggle key={badge.value} checked={itemForm.badges.includes(badge.value)} label={badge.label} onChange={() => toggleBadge(badge.value)} />
                ))}
              </div>
              {restaurant.plan !== "premium" ? <p className="text-app-helper text-app-muted">تمييز الأصناف متاح فقط في باقة Premium.</p> : null}
            </ProductFormSection>

            <FormErrors errors={itemErrors} />
            <div className="flex flex-wrap gap-2 border-t border-app-border pt-4">
              <AppButton type="submit" disabled={busy || itemErrors.length > 0 || atItemLimit} loading={busy} iconStart={<Save className="h-4 w-4" />}>
                {editingItemId ? "حفظ التعديل" : "إضافة الصنف"}
              </AppButton>
              <AppButton type="button" variant="secondary" onClick={closeItemForm}>
                إلغاء
              </AppButton>
            </div>
          </form>
        </PopupForm>

        <PopupForm
          open={Boolean(pendingDeleteItem)}
          onClose={() => setPendingDeleteItem(null)}
          title="حذف المنتج؟"
          description={pendingDeleteItem ? `سيتم حذف "${pendingDeleteItem.name}" من المنيو. لا يمكن التراجع عن هذا الإجراء.` : undefined}
          maxWidth="sm"
        >
          <div className="flex flex-wrap justify-end gap-2">
            <AppButton type="button" variant="secondary" onClick={() => setPendingDeleteItem(null)}>
              إلغاء
            </AppButton>
            <AppButton
              type="button"
              variant="destructive"
              disabled={busy || !pendingDeleteItem}
              loading={busy}
              onClick={() => {
                if (pendingDeleteItem) void removeItem(pendingDeleteItem.id);
              }}
              iconStart={<Trash2 className="h-4 w-4" />}
            >
              حذف المنتج
            </AppButton>
          </div>
        </PopupForm>

        <PopupForm
          open={categoryFormOpen}
          onClose={closeCategoryForm}
          title={editingCategoryId ? "تعديل قسم" : "إضافة قسم"}
          description="الأقسام تساعد الزبون على الوصول بسرعة للأصناف."
          maxWidth="md"
        >
          {atCategoryLimit ? <Warning text={"وصلت إلى حد الأقسام في باقة " + planLabels[restaurant.plan] + "."} /> : null}
          <form onSubmit={saveCategory} className="grid gap-4">
            <ProductFormSection title="بيانات القسم">
              <AppFieldShell label="اسم القسم">
                <AppInput
                  value={categoryForm.name}
                  onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })}
                  error={categoryErrors.some((error) => error.includes("اسم القسم"))}
                />
              </AppFieldShell>
              <AppFieldShell label="الترتيب" helperText="الأرقام الأصغر تظهر أولاً في المنيو.">
                <AppInput
                  value={Number.isFinite(categoryForm.order) ? categoryForm.order : 0}
                  onChange={(event) => setCategoryForm({ ...categoryForm, order: Number(event.target.value) })}
                  type="number"
                  min="0"
                  inputMode="numeric"
                  error={categoryErrors.some((error) => error.includes("الترتيب"))}
                />
              </AppFieldShell>
              <ProductToggle checked={categoryForm.isActive} label="القسم ظاهر" onChange={(isActive) => setCategoryForm({ ...categoryForm, isActive })} />
            </ProductFormSection>
            <FormErrors errors={categoryErrors} />
            <div className="flex flex-wrap gap-2 border-t border-app-border pt-4">
              <AppButton type="submit" disabled={busy || categoryErrors.length > 0 || atCategoryLimit} loading={busy} iconStart={<Save className="h-4 w-4" />}>
                {editingCategoryId ? "حفظ القسم" : "إضافة القسم"}
              </AppButton>
              <AppButton type="button" variant="secondary" onClick={closeCategoryForm}>
                إلغاء
              </AppButton>
            </div>
          </form>
        </PopupForm>

        <PopupForm
          open={Boolean(pendingDeleteCategory)}
          onClose={() => setPendingDeleteCategory(null)}
          title="حذف القسم؟"
          description={
            pendingDeleteCategory
              ? getCategoryProductCount(pendingDeleteCategory, items) > 0
                ? `القسم "${pendingDeleteCategory.name}" يحتوي أصنافاً. حذف القسم قد يترك هذه الأصناف بلا قسم.`
                : `سيتم حذف القسم "${pendingDeleteCategory.name}" من المنيو.`
              : undefined
          }
          maxWidth="sm"
        >
          <div className="flex flex-wrap justify-end gap-2">
            <AppButton type="button" variant="secondary" onClick={() => setPendingDeleteCategory(null)}>
              إلغاء
            </AppButton>
            <AppButton
              type="button"
              variant="destructive"
              disabled={busy || !pendingDeleteCategory}
              loading={busy}
              onClick={() => {
                if (pendingDeleteCategory) void removeCategory(pendingDeleteCategory.id);
              }}
              iconStart={<Trash2 className="h-4 w-4" />}
            >
              حذف القسم
            </AppButton>
          </div>
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

function CategoryList({
  categories,
  items,
  onEdit,
  onDelete
}: {
  categories: Category[];
  items: MenuItem[];
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-app-lg border border-app-border bg-app-surface md:block">
        <table className="w-full table-fixed text-app-table">
          <thead className="bg-app-surface-muted text-app-meta text-app-muted">
            <tr className="[&>th]:border-b [&>th]:border-app-border [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-start [&>th]:font-semibold">
              <th className="w-24">الترتيب</th>
              <th>اسم القسم</th>
              <th className="w-36">الأصناف</th>
              <th className="w-36">الحالة</th>
              <th className="w-40">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-border">
            {categories.map((category) => (
              <tr key={category.id} className={cn("transition-colors hover:bg-app-surface-muted", !category.isActive && "opacity-65")}>
                <td className="px-3 py-3 font-semibold text-app-muted">{formatInteger(category.order)}</td>
                <td className="px-3 py-3">
                  <p className="truncate font-semibold text-app-ink">{category.name}</p>
                </td>
                <td className="px-3 py-3 text-app-muted">{formatInteger(getCategoryProductCount(category, items))} صنف</td>
                <td className="px-3 py-3">
                  <AppBadge variant={category.isActive ? "success" : "danger"}>{category.isActive ? "ظاهر" : "مخفي"}</AppBadge>
                </td>
                <td className="px-3 py-3">
                  <CategoryActions category={category} onEdit={onEdit} onDelete={onDelete} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 md:hidden">
        {categories.map((category) => (
          <article
            key={category.id}
            className={cn("rounded-app-lg border border-app-border bg-app-surface p-3", !category.isActive && "opacity-65")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-app-ink">{category.name}</p>
                <p className="mt-1 text-app-meta text-app-muted">
                  ترتيب {formatInteger(category.order)} · {formatInteger(getCategoryProductCount(category, items))} صنف
                </p>
              </div>
              <AppBadge variant={category.isActive ? "success" : "danger"}>{category.isActive ? "ظاهر" : "مخفي"}</AppBadge>
            </div>
            <div className="mt-3">
              <CategoryActions category={category} onEdit={onEdit} onDelete={onDelete} />
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function CategoryActions({
  category,
  onEdit,
  onDelete
}: {
  category: Category;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AppButton type="button" variant="secondary" size="sm" onClick={() => onEdit(category)} iconStart={<Pencil className="h-4 w-4" />}>
        تعديل
      </AppButton>
      <AppButton type="button" variant="ghost" size="sm" onClick={() => onDelete(category)} className="text-app-danger hover:bg-app-danger-soft" iconStart={<Trash2 className="h-4 w-4" />}>
        حذف
      </AppButton>
    </div>
  );
}

function TemplateSelector({
  value,
  templates,
  onChange
}: {
  value: MenuTemplate;
  templates: MenuTemplate[];
  onChange: (template: MenuTemplate) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {templates.map((template) => (
        <button
          key={template}
          type="button"
          onClick={() => onChange(template)}
          className={cn(
            "rounded-app-lg border p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft",
            value === template
              ? "border-app-primary bg-app-primary-soft text-app-primary"
              : "border-app-border bg-app-surface text-app-ink hover:border-app-border-strong hover:bg-app-surface-muted"
          )}
        >
          <span className="block text-sm font-semibold">{templateLabels[template]}</span>
          <span className="mt-1 block text-app-helper text-app-muted">{template}</span>
        </button>
      ))}
    </div>
  );
}

function DesignAssetField({
  label,
  value,
  onChange,
  onUpload
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onUpload: (file: File) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[72px_1fr] sm:items-start">
      <div className="grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-app-lg border border-app-border bg-app-surface-muted text-app-muted">
        {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6" />}
      </div>
      <div className="grid gap-3">
        <AppFieldShell label={label}>
          <AppInput value={value} onChange={(event) => onChange(event.target.value)} placeholder="https://..." dir="ltr" />
        </AppFieldShell>
        <ProductImageUpload label="رفع الصورة" onUpload={onUpload} />
      </div>
    </div>
  );
}

function AppColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <AppFieldShell label={label}>
      <div className="flex gap-2">
        <AppInput value={value} onChange={(event) => onChange(event.target.value)} dir="ltr" className="min-w-0 flex-1" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type="color"
          className="h-10 w-14 shrink-0 rounded-app-md border border-app-border bg-app-surface"
          aria-label={label}
        />
      </div>
    </AppFieldShell>
  );
}

function ProductTable({
  items,
  categories,
  currency,
  recipes,
  canEditRecipe,
  onRecipe,
  onEdit,
  onDelete
}: {
  items: MenuItem[];
  categories: Category[];
  currency: string;
  recipes: RecipeIngredient[];
  canEditRecipe: boolean;
  onRecipe: (item: MenuItem) => void;
  onEdit: (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
}) {
  return (
    <div className="hidden overflow-hidden rounded-app-lg border border-app-border bg-app-surface md:block">
      <table className="w-full table-fixed text-app-table">
        <thead className="bg-app-surface-muted text-app-meta text-app-muted">
          <tr className="[&>th]:border-b [&>th]:border-app-border [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-start [&>th]:font-semibold">
            <th className="w-20">صورة</th>
            <th>اسم المنتج</th>
            <th className="w-40">القسم</th>
            <th className="w-36">السعر</th>
            <th className="w-36">الحالة</th>
            <th className="w-44">الإجراءات</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-app-border">
          {items.map((item) => {
            const recipeCount = getProductRecipeCount(item, recipes);
            return (
              <tr key={item.id} className={cn("transition-colors hover:bg-app-surface-muted", !item.isAvailable && "opacity-65")}>
                <td className="px-3 py-3">
                  <ProductThumbnail item={item} />
                </td>
                <td className="px-3 py-3 align-middle">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate font-semibold text-app-ink">{item.name}</p>
                      {item.isFeatured ? <AppBadge variant="warning">مميز</AppBadge> : null}
                    </div>
                    {item.description ? <p className="mt-1 line-clamp-1 text-app-helper text-app-muted">{item.description}</p> : null}
                    <RecipeMeta recipeCount={recipeCount} />
                  </div>
                </td>
                <td className="px-3 py-3 text-app-muted">{getCategoryName(item, categories)}</td>
                <td className="px-3 py-3 font-semibold text-app-ink">{formatMoney(item.price, currency)}</td>
                <td className="px-3 py-3">
                  <AvailabilityBadge available={item.isAvailable} />
                </td>
                <td className="px-3 py-3">
                  <ProductActions
                    item={item}
                    canEditRecipe={canEditRecipe}
                    onRecipe={onRecipe}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProductMobileList({
  items,
  categories,
  currency,
  recipes,
  canEditRecipe,
  onRecipe,
  onEdit,
  onDelete
}: {
  items: MenuItem[];
  categories: Category[];
  currency: string;
  recipes: RecipeIngredient[];
  canEditRecipe: boolean;
  onRecipe: (item: MenuItem) => void;
  onEdit: (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
}) {
  return (
    <div className="grid gap-2 md:hidden">
      {items.map((item) => {
        const recipeCount = getProductRecipeCount(item, recipes);
        return (
          <article
            key={item.id}
            className={cn("rounded-app-lg border border-app-border bg-app-surface p-3", !item.isAvailable && "opacity-65")}
          >
            <div className="flex items-start gap-3">
              <ProductThumbnail item={item} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-app-ink">{item.name}</p>
                    <p className="mt-0.5 text-app-meta text-app-muted">{getCategoryName(item, categories)}</p>
                  </div>
                  <AvailabilityBadge available={item.isAvailable} />
                </div>
                <p className="mt-2 font-semibold text-app-ink">{formatMoney(item.price, currency)}</p>
                {item.description ? <p className="mt-1 line-clamp-2 text-app-helper text-app-muted">{item.description}</p> : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {item.isFeatured ? <AppBadge variant="warning">مميز</AppBadge> : null}
                  <RecipeMeta recipeCount={recipeCount} />
                </div>
              </div>
            </div>
            <div className="mt-3">
              <ProductActions
                item={item}
                canEditRecipe={canEditRecipe}
                onRecipe={onRecipe}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ProductThumbnail({ item }: { item: MenuItem }) {
  if (!item.image) {
    return (
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-app-md border border-app-border bg-app-surface-muted text-app-muted">
        <ImageIcon className="h-5 w-5" />
      </div>
    );
  }

  return (
    <img
      src={item.image}
      alt=""
      loading="lazy"
      className="h-12 w-12 shrink-0 rounded-app-md border border-app-border object-cover"
    />
  );
}

function AvailabilityBadge({ available }: { available: boolean }) {
  return <AppBadge variant={available ? "success" : "danger"}>{available ? "متوفر" : "غير متوفر"}</AppBadge>;
}

function RecipeMeta({ recipeCount }: { recipeCount: number }) {
  return (
    <span className={cn("text-app-helper font-medium", recipeCount ? "text-app-success" : "text-app-muted")}>
      {recipeCount ? `${formatInteger(recipeCount)} مكونات مرتبطة` : "لا توجد مكونات مخزون"}
    </span>
  );
}

function ProductActions({
  item,
  canEditRecipe,
  onRecipe,
  onEdit,
  onDelete
}: {
  item: MenuItem;
  canEditRecipe: boolean;
  onRecipe: (item: MenuItem) => void;
  onEdit: (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canEditRecipe ? (
        <AppButton type="button" variant="secondary" size="sm" onClick={() => onRecipe(item)} iconStart={<Boxes className="h-4 w-4" />}>
          المكونات
        </AppButton>
      ) : null}
      <AppButton type="button" variant="secondary" size="sm" onClick={() => onEdit(item)} iconStart={<Pencil className="h-4 w-4" />}>
        تعديل
      </AppButton>
      <AppButton type="button" variant="ghost" size="sm" onClick={() => onDelete(item)} className="text-app-danger hover:bg-app-danger-soft" iconStart={<Trash2 className="h-4 w-4" />}>
        حذف
      </AppButton>
    </div>
  );
}

function ProductFormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-b border-app-border pb-4 last:border-b-0 last:pb-0">
      <h3 className="text-app-panel-title font-semibold text-app-ink">{title}</h3>
      {children}
    </section>
  );
}

function ProductImageUpload({ label = "رفع صورة المنتج", onUpload }: { label?: string; onUpload: (file: File) => void }) {
  return (
    <label className="block rounded-app-md border border-app-border bg-app-surface-muted p-3 text-app-label text-app-ink transition-colors hover:border-app-border-strong">
      <span>{label}</span>
      <input
        type="file"
        accept="image/*"
        className="mt-2 block w-full text-app-helper text-app-muted file:me-3 file:rounded-app-md file:border-0 file:bg-app-ink file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );
}

function ProductToggle({
  checked,
  label,
  disabled = false,
  onChange
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-app-md border px-3 text-sm font-semibold transition-colors",
        checked ? "border-app-primary bg-app-primary-soft text-app-primary" : "border-app-border bg-app-surface text-app-muted",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:border-app-primary hover:bg-app-primary-soft hover:text-app-primary"
      )}
    >
      <input
        type="checkbox"
        className="h-4 w-4 accent-[var(--app-primary)]"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function getCategoryName(item: MenuItem, categories: Category[]) {
  return categories.find((category) => category.id === item.categoryId)?.name ?? "بدون قسم";
}

function getCategoryProductCount(category: Category, items: MenuItem[]) {
  return items.filter((item) => item.categoryId === category.id).length;
}

function getProductRecipeCount(item: MenuItem, recipes: RecipeIngredient[]) {
  return recipes.filter((entry) => entry.menuItemId === item.id).length;
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
