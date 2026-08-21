"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import {
  AppBadge,
  AppButton,
  AppEmptyState,
  AppFieldShell,
  AppInput,
  AppPageHeader,
  AppSelect,
  AppSurface,
  AppToolbar,
  PopupForm,
  cn
} from "@/components/shared";
import { adminRequest } from "@/lib/api";
import { formatInteger } from "@/lib/format";
import type { MenuItem } from "@/types/menu";
import type { InventoryItem, InventoryTransaction, InventoryTransactionType, RecipeDraftLine, RecipeIngredient } from "@/types/ops";
import { money, OpsShell, useOpsPage } from "./OpsShared";
import { nameById, recipeDraftForMenuItem, run } from "./OpsPageShared";

type InventoryForm = {
  name: string;
  category: string;
  unit: string;
  currentQuantity: number;
  minimumQuantity: number;
  averageCost: number;
  sellPrice: number;
  isActive: boolean;
};

type StockMovementForm = {
  inventoryItemId: string;
  type: InventoryTransactionType;
  quantity: number;
  reason: string;
};

const movementTypes: InventoryTransactionType[] = ["IN", "OUT", "ADJUST", "REVERSE"];

export function InventoryOpsPage() {
  const state = useOpsPage("inventory");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [recipes, setRecipes] = useState<RecipeIngredient[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<InventoryForm>(emptyInventoryForm());
  const [move, setMove] = useState<StockMovementForm>({ inventoryItemId: "", type: "IN", quantity: 0, reason: "" });
  const [recipe, setRecipe] = useState({ menuItemId: "", inventoryItemId: "", quantity: 1, unit: "" });
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraftLine[]>([]);

  useEffect(() => {
    if (state.token && state.modules?.inventory) void load();
  }, [state.token, state.modules?.inventory]);

  async function load() {
    const [nextItems, nextTransactions, nextRecipes, nextMenuItems] = await Promise.all([
      adminRequest<InventoryItem[]>("/api/owner/ops/inventory/items", state.token),
      adminRequest<InventoryTransaction[]>("/api/owner/ops/inventory/transactions", state.token),
      adminRequest<RecipeIngredient[]>("/api/owner/ops/recipes", state.token),
      adminRequest<MenuItem[]>("/api/owner/items", state.token)
    ]);
    setItems(nextItems);
    setTransactions(nextTransactions);
    setRecipes(nextRecipes);
    setMenuItems(nextMenuItems);
    setMove((current) => ({ ...current, inventoryItemId: current.inventoryItemId || nextItems[0]?.id || "" }));
    setRecipe((current) => ({ ...current, menuItemId: current.menuItemId || nextMenuItems[0]?.id || "", inventoryItemId: current.inventoryItemId || nextItems[0]?.id || "" }));
    const selectedMenuItemId = recipe.menuItemId || nextMenuItems[0]?.id || "";
    setRecipeDraft(recipeDraftForMenuItem(nextRecipes, nextItems, selectedMenuItemId));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = editingId ? `/api/owner/ops/inventory/items/${editingId}` : "/api/owner/ops/inventory/items";
    await run(state, async () => {
      await adminRequest(path, state.token, { method: editingId ? "PATCH" : "POST", body: JSON.stringify(form) });
      setEditingId("");
      setForm(emptyInventoryForm());
      setFormOpen(false);
      await load();
    });
  }

  async function addMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(state, async () => {
      await adminRequest("/api/owner/ops/inventory/transactions", state.token, { method: "POST", body: JSON.stringify({ ...move, referenceType: "MANUAL", referenceId: "manual" }) });
      setMove({ ...move, quantity: 0, reason: "" });
      await load();
    });
  }

  async function addRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recipe.menuItemId) return;
    await run(state, async () => {
      await adminRequest(`/api/owner/ops/recipes/menu-items/${recipe.menuItemId}`, state.token, {
        method: "PUT",
        body: JSON.stringify({
          ingredients: recipeDraft.filter((line) => line.inventoryItemId && line.quantity > 0)
        })
      });
      await load();
    });
  }

  function selectRecipeMenuItem(menuItemId: string) {
    setRecipe({ ...recipe, menuItemId });
    setRecipeDraft(recipeDraftForMenuItem(recipes, items, menuItemId));
  }

  function updateRecipeDraft(index: number, patch: Partial<RecipeDraftLine>) {
    setRecipeDraft((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const inventoryItemId = patch.inventoryItemId ?? line.inventoryItemId;
        const inventoryItem = items.find((item) => item.id === inventoryItemId);
        return {
          ...line,
          ...patch,
          inventoryItemId,
          quantity: Math.max(0.0001, Number(patch.quantity ?? line.quantity)),
          unit: patch.inventoryItemId ? inventoryItem?.unit || line.unit : patch.unit ?? line.unit
        };
      })
    );
  }

  async function remove(id: string) {
    await run(state, async () => {
      await adminRequest(`/api/owner/ops/inventory/items/${id}`, state.token, { method: "DELETE" });
      setPendingDeleteItem(null);
      await load();
    });
  }

  function reset() {
    setEditingId("");
    setForm(emptyInventoryForm());
  }

  function openNewForm() {
    reset();
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    reset();
  }

  function edit(item: InventoryItem) {
    setEditingId(item.id);
    setForm({ name: item.name, category: item.category, unit: item.unit, currentQuantity: item.currentQuantity, minimumQuantity: item.minimumQuantity, averageCost: item.averageCost, sellPrice: item.sellPrice, isActive: item.isActive });
    setFormOpen(true);
  }

  const filtered = items.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(query.toLowerCase()));
  const lowStockCount = items.filter(isLowStock).length;
  const activeCount = items.filter((item) => item.isActive).length;

  return (
    <OpsShell title="المخزون" eyebrow="المواد والحركات" module="inventory" state={state} onRefresh={() => void Promise.all([state.loadRestaurant(), load()])}>
      <div className="grid gap-4">
        <AppPageHeader
          title="المخزون"
          description="متابعة المواد والكميات وحركات المخزون."
          primaryAction={<AppButton type="button" onClick={openNewForm}>إضافة مادة</AppButton>}
          secondaryActions={(
            <>
              <AppBadge variant="neutral">{formatInteger(filtered.length)} مادة</AppBadge>
              <AppBadge variant={lowStockCount ? "warning" : "success"}>{formatInteger(lowStockCount)} منخفض</AppBadge>
              <AppBadge variant="primary">{formatInteger(activeCount)} نشط</AppBadge>
            </>
          )}
        />

        <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="grid content-start gap-4">
            <AppSurface title="حركة مخزون">
              <form onSubmit={addMovement} className="grid gap-3">
                <AppFieldShell label="المادة">
                  <AppSelect value={move.inventoryItemId} onChange={(event) => setMove({ ...move, inventoryItemId: event.target.value })}>
                    {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </AppSelect>
                </AppFieldShell>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <AppFieldShell label="النوع">
                    <AppSelect value={move.type} onChange={(event) => setMove({ ...move, type: event.target.value as InventoryTransactionType })}>
                      {movementTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                    </AppSelect>
                  </AppFieldShell>
                  <AppFieldShell label="الكمية/التغيير">
                    <AppInput type="number" value={move.quantity} onChange={(event) => setMove({ ...move, quantity: Number(event.target.value) })} />
                  </AppFieldShell>
                </div>
                <AppFieldShell label="السبب">
                  <AppInput value={move.reason} onChange={(event) => setMove({ ...move, reason: event.target.value })} />
                </AppFieldShell>
                <AppButton type="submit" disabled={!move.inventoryItemId}>تسجيل حركة</AppButton>
              </form>
            </AppSurface>

            <AppSurface title="وصفة صنف المنيو">
              <form onSubmit={addRecipe} className="grid gap-3">
                <AppFieldShell label="صنف المنيو">
                  <AppSelect value={recipe.menuItemId} onChange={(event) => selectRecipeMenuItem(event.target.value)}>
                    {menuItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </AppSelect>
                </AppFieldShell>
                <div className="grid gap-2">
                  {recipeDraft.map((line, index) => (
                    <div key={`${line.inventoryItemId}-${index}`} className="rounded-app-md border border-app-border bg-app-surface-muted p-3">
                      <AppFieldShell label="مادة المخزون">
                        <AppSelect value={line.inventoryItemId} onChange={(event) => updateRecipeDraft(index, { inventoryItemId: event.target.value })}>
                          {items.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.currentQuantity} {item.unit})</option>)}
                        </AppSelect>
                      </AppFieldShell>
                      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_100px]">
                        <AppFieldShell label="الكمية">
                          <AppInput type="number" min="0" value={line.quantity} onChange={(event) => updateRecipeDraft(index, { quantity: Number(event.target.value) })} />
                        </AppFieldShell>
                        <AppFieldShell label="الوحدة">
                          <AppInput value={line.unit} onChange={(event) => updateRecipeDraft(index, { unit: event.target.value })} />
                        </AppFieldShell>
                      </div>
                      <div className="mt-2 flex justify-end">
                        <AppButton type="button" variant="ghost" size="sm" onClick={() => setRecipeDraft((current) => current.filter((_, lineIndex) => lineIndex !== index))} className="text-app-danger hover:bg-app-danger-soft">حذف</AppButton>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <AppButton type="button" variant="secondary" onClick={() => setRecipeDraft((current) => [...current, { inventoryItemId: items[0]?.id || "", quantity: 1, unit: items[0]?.unit || "" }])}>إضافة مكون</AppButton>
                  <AppButton type="submit" disabled={!recipe.menuItemId || !items.length}>حفظ الوصفة</AppButton>
                </div>
              </form>
            </AppSurface>
          </div>

          <div className="grid content-start gap-4">
            <AppSurface title="المواد">
              <AppToolbar
                search={(
                  <AppFieldShell label="بحث">
                    <AppInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="اسم المادة أو الفئة" />
                  </AppFieldShell>
                )}
              />

              {filtered.length ? (
                <>
                  <div className="mt-4 hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[760px] border-separate border-spacing-0 text-right text-app-body">
                      <thead>
                        <tr className="text-app-label text-app-muted">
                          <th className="border-b border-app-border px-3 py-2 font-semibold">المادة</th>
                          <th className="border-b border-app-border px-3 py-2 font-semibold">الكمية</th>
                          <th className="border-b border-app-border px-3 py-2 font-semibold">الوحدة</th>
                          <th className="border-b border-app-border px-3 py-2 font-semibold">التكلفة</th>
                          <th className="border-b border-app-border px-3 py-2 font-semibold">الحالة</th>
                          <th className="border-b border-app-border px-3 py-2 font-semibold">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((item) => (
                          <tr key={item.id} className="align-middle">
                            <td className="border-b border-app-border px-3 py-3">
                              <p className="font-semibold text-app-ink">{item.name}</p>
                              <p className="mt-1 text-app-helper text-app-muted">{item.category}</p>
                            </td>
                            <td className="border-b border-app-border px-3 py-3 text-lg font-semibold text-app-ink">{item.currentQuantity}</td>
                            <td className="border-b border-app-border px-3 py-3 text-app-muted">{item.unit}</td>
                            <td className="border-b border-app-border px-3 py-3 text-app-ink">{money(item.averageCost, state.restaurant?.currency)}</td>
                            <td className="border-b border-app-border px-3 py-3"><InventoryStatusBadge item={item} /></td>
                            <td className="border-b border-app-border px-3 py-3">
                              <InventoryRowActions onEdit={() => edit(item)} onDelete={() => setPendingDeleteItem(item)} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 grid gap-2 md:hidden">
                    {filtered.map((item) => (
                      <InventoryMobileRow key={item.id} item={item} currency={state.restaurant?.currency} onEdit={() => edit(item)} onDelete={() => setPendingDeleteItem(item)} />
                    ))}
                  </div>
                </>
              ) : (
                <AppEmptyState className="mt-4" title="لا توجد مواد" description="أضف مادة مخزون جديدة أو غيّر البحث." action={<AppButton type="button" onClick={openNewForm}>إضافة مادة</AppButton>} />
              )}
            </AppSurface>

            <AppSurface title="آخر الحركات والوصفات">
              <div className="grid gap-2">
                {transactions.slice(0, 8).map((transaction) => (
                  <div key={transaction.id} className="grid gap-1 rounded-app-md border border-app-border bg-app-surface-muted p-3 text-app-body">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <AppBadge variant={movementVariant(transaction.type)}>{transaction.type}</AppBadge>
                      <span className="font-semibold text-app-ink">{transaction.quantity}</span>
                    </div>
                    <p className="text-app-helper text-app-muted">{transaction.reason || transaction.referenceType}</p>
                  </div>
                ))}
                {recipes.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="rounded-app-md border border-app-border bg-app-surface-muted p-3 text-app-body font-medium text-app-ink">
                    وصفة: {nameById(menuItems, entry.menuItemId)} ← {nameById(items, entry.inventoryItemId)} x {entry.quantity}
                  </div>
                ))}
                {!transactions.length && !recipes.length ? <AppEmptyState title="لا توجد حركات" description="ستظهر الحركات والوصفات بعد تسجيلها." /> : null}
              </div>
            </AppSurface>
          </div>
        </div>
      </div>

      <PopupForm open={formOpen} onClose={closeForm} title={editingId ? "تعديل مادة" : "إضافة مادة"} maxWidth="lg">
        <form onSubmit={save} className="grid gap-3">
          <AppFieldShell label="الاسم">
            <AppInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </AppFieldShell>
          <div className="grid gap-3 sm:grid-cols-2">
            <AppFieldShell label="الفئة">
              <AppInput value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
            </AppFieldShell>
            <AppFieldShell label="الوحدة">
              <AppInput value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
            </AppFieldShell>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <AppFieldShell label="الكمية">
              <AppInput type="number" value={form.currentQuantity} onChange={(event) => setForm({ ...form, currentQuantity: Number(event.target.value) })} />
            </AppFieldShell>
            <AppFieldShell label="الحد الأدنى">
              <AppInput type="number" min="0" value={form.minimumQuantity} onChange={(event) => setForm({ ...form, minimumQuantity: Number(event.target.value) })} />
            </AppFieldShell>
            <AppFieldShell label="متوسط التكلفة">
              <AppInput type="number" min="0" value={form.averageCost} onChange={(event) => setForm({ ...form, averageCost: Number(event.target.value) })} />
            </AppFieldShell>
            <AppFieldShell label="سعر البيع">
              <AppInput type="number" min="0" value={form.sellPrice} onChange={(event) => setForm({ ...form, sellPrice: Number(event.target.value) })} />
            </AppFieldShell>
          </div>
          <div className="flex flex-wrap gap-2">
            <AppButton type="submit">{editingId ? "حفظ" : "إضافة"}</AppButton>
            <AppButton type="button" variant="secondary" onClick={closeForm}>إلغاء</AppButton>
          </div>
        </form>
      </PopupForm>

      <PopupForm open={Boolean(pendingDeleteItem)} onClose={() => setPendingDeleteItem(null)} title="حذف مادة المخزون" maxWidth="sm">
        <div className="grid gap-4">
          <p className="text-app-body text-app-muted">سيتم حذف مادة المخزون {pendingDeleteItem?.name}. لا يمكن التراجع عن هذا الإجراء.</p>
          <div className="flex flex-wrap gap-2">
            <AppButton type="button" variant="destructive" onClick={() => pendingDeleteItem ? void remove(pendingDeleteItem.id) : undefined}>حذف</AppButton>
            <AppButton type="button" variant="secondary" onClick={() => setPendingDeleteItem(null)}>إلغاء</AppButton>
          </div>
        </div>
      </PopupForm>
    </OpsShell>
  );
}

function InventoryMobileRow({ item, currency, onEdit, onDelete }: { item: InventoryItem; currency?: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <article className="rounded-app-md border border-app-border bg-app-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-app-ink">{item.name}</h3>
          <p className="mt-1 text-app-helper text-app-muted">{item.category}</p>
        </div>
        <InventoryStatusBadge item={item} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-app-body">
        <InventoryFact label="الكمية" value={`${item.currentQuantity} ${item.unit}`} strong />
        <InventoryFact label="التكلفة" value={money(item.averageCost, currency)} />
      </div>
      <InventoryRowActions onEdit={onEdit} onDelete={onDelete} className="mt-3" />
    </article>
  );
}

function InventoryFact({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-app-sm border border-app-border bg-app-surface-muted px-3 py-2">
      <p className="text-app-helper text-app-muted">{label}</p>
      <p className={cn("mt-1 truncate text-app-ink", strong && "text-base font-semibold")}>{value}</p>
    </div>
  );
}

function InventoryRowActions({ onEdit, onDelete, className }: { onEdit: () => void; onDelete: () => void; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <AppButton type="button" variant="secondary" size="sm" onClick={onEdit}>تعديل</AppButton>
      <AppButton type="button" variant="ghost" size="sm" onClick={onDelete} className="text-app-danger hover:bg-app-danger-soft">حذف</AppButton>
    </div>
  );
}

function InventoryStatusBadge({ item }: { item: InventoryItem }) {
  if (!item.isActive) return <AppBadge variant="neutral">غير فعال</AppBadge>;
  return isLowStock(item) ? <AppBadge variant="danger">منخفض</AppBadge> : <AppBadge variant="success">جيد</AppBadge>;
}

function movementVariant(type: InventoryTransactionType): "neutral" | "primary" | "success" | "warning" | "danger" {
  if (type === "IN") return "success";
  if (type === "OUT") return "warning";
  if (type === "REVERSE") return "danger";
  return "primary";
}

function isLowStock(item: InventoryItem) {
  return item.currentQuantity <= item.minimumQuantity;
}

function emptyInventoryForm(): InventoryForm {
  return { name: "", category: "عام", unit: "kg", currentQuantity: 0, minimumQuantity: 0, averageCost: 0, sellPrice: 0, isActive: true };
}
