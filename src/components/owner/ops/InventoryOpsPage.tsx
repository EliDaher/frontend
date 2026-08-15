"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { PopupForm } from "@/components/shared";
import { adminRequest } from "@/lib/api";
import { formatInteger } from "@/lib/format";
import type { Category, MenuItem } from "@/types/menu";
import type {
  Account,
  CashMovement,
  CashRegister,
  Expense,
  InventoryItem,
  InventoryTransaction,
  Invoice,
  JournalEntry,
  OperationalPayment,
  OrderStatus,
  OpsOrder,
  OpsTable,
  PaymentMethod,
  RecipeDraftLine,
  RecipeIngredient,
  Supplier
} from "@/types/ops";
import {
  DangerButton,
  Empty,
  Field,
  money,
  OrderStatusActions,
  orderStatusLabels,
  OpsShell,
  Panel,
  paymentAmountForMethod,
  PrimaryButton,
  SecondaryButton,
  SelectField,
  StatusBadge,
  TextArea,
  useOpsPage
} from "./OpsShared";
import {
  accountTypes,
  buildCashSeries,
  buildPaymentBreakdown,
  Filters,
  invoiceStatuses,
  invoiceTypes,
  journalStatusLabel,
  localDateKey,
  nameById,
  numberValue,
  option,
  orderStatuses,
  orderTypes,
  paymentMethods,
  recipeDraftForMenuItem,
  RowActions,
  run,
  SimpleCrudLayout,
  sortByCreatedAtDesc,
  sumAmounts,
  tableStatuses,
  AccountingMetric,
  CashMovementChart,
  PaymentMethodChart
} from "./OpsPageShared";

export function InventoryOpsPage() {
  const state = useOpsPage("inventory");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [recipes, setRecipes] = useState<RecipeIngredient[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: "عام", unit: "kg", currentQuantity: 0, minimumQuantity: 0, averageCost: 0, sellPrice: 0, isActive: true });
  const [move, setMove] = useState({ inventoryItemId: "", type: "IN", quantity: 0, reason: "" });
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
      setForm({ name: "", category: "عام", unit: "kg", currentQuantity: 0, minimumQuantity: 0, averageCost: 0, sellPrice: 0, isActive: true });
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
    if (!window.confirm("حذف مادة المخزون؟")) return;
    await run(state, async () => {
      await adminRequest(`/api/owner/ops/inventory/items/${id}`, state.token, { method: "DELETE" });
      await load();
    });
  }

  function reset() {
    setEditingId("");
    setForm({ name: "", category: "عام", unit: "kg", currentQuantity: 0, minimumQuantity: 0, averageCost: 0, sellPrice: 0, isActive: true });
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

  return (
    <OpsShell title="المخزون" eyebrow="المواد والحركات" module="inventory" state={state} onRefresh={() => void Promise.all([state.loadRestaurant(), load()])}>
      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <div className="grid gap-4">
          <Panel title="حركة مخزون">
            <form onSubmit={addMovement} className="grid gap-3">
              <SelectField label="المادة" value={move.inventoryItemId} options={items.map((item) => ({ value: item.id, label: item.name }))} onChange={(inventoryItemId) => setMove({ ...move, inventoryItemId })} />
              <SelectField label="النوع" value={move.type} options={["IN", "OUT", "ADJUST", "REVERSE"].map(option)} onChange={(type) => setMove({ ...move, type })} />
              <Field label="الكمية/التغيير" type="number" value={move.quantity} onChange={(quantity) => setMove({ ...move, quantity: Number(quantity) })} />
              <Field label="السبب" value={move.reason} onChange={(reason) => setMove({ ...move, reason })} />
              <PrimaryButton disabled={!move.inventoryItemId}>تسجيل حركة</PrimaryButton>
            </form>
          </Panel>
          <Panel title="وصفة صنف المنيو">
            <form onSubmit={addRecipe} className="grid gap-3">
              <SelectField label="صنف المنيو" value={recipe.menuItemId} options={menuItems.map((item) => ({ value: item.id, label: item.name }))} onChange={selectRecipeMenuItem} />
              <div className="grid gap-2">
                {recipeDraft.map((line, index) => (
                  <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <SelectField label="مادة المخزون" value={line.inventoryItemId} options={items.map((item) => ({ value: item.id, label: `${item.name} (${item.currentQuantity} ${item.unit})` }))} onChange={(inventoryItemId) => updateRecipeDraft(index, { inventoryItemId })} />
                    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_100px]">
                      <Field label="الكمية" type="number" min="0" value={line.quantity} onChange={(quantity) => updateRecipeDraft(index, { quantity: Number(quantity) })} />
                      <Field label="الوحدة" value={line.unit} onChange={(unit) => updateRecipeDraft(index, { unit })} />
                    </div>
                    <div className="mt-2 flex justify-end">
                      <DangerButton onClick={() => setRecipeDraft((current) => current.filter((_, lineIndex) => lineIndex !== index))}>حذف</DangerButton>
                    </div>
                  </div>
                ))}
              </div>
              <SecondaryButton onClick={() => setRecipeDraft((current) => [...current, { inventoryItemId: items[0]?.id || "", quantity: 1, unit: items[0]?.unit || "" }])}>إضافة مكون</SecondaryButton>
              <PrimaryButton disabled={!recipe.menuItemId || !items.length}>حفظ الوصفة</PrimaryButton>
            </form>
          </Panel>
        </div>
        <div className="grid gap-4">
          <Panel title="المواد">
            <Field label="بحث" value={query} onChange={setQuery} />
            <div className="mt-4 grid gap-3">
              {filtered.length ? filtered.map((item) => (
                <article key={item.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black">{item.name}</h3>
                      <p className="mt-1 text-sm font-bold text-slate-500">{item.category} · {item.currentQuantity} {item.unit}</p>
                    </div>
                    <StatusBadge label={item.currentQuantity <= item.minimumQuantity ? "منخفض" : "جيد"} tone={item.currentQuantity <= item.minimumQuantity ? "red" : "green"} />
                  </div>
                  <RowActions onEdit={() => edit(item)} onDelete={() => void remove(item.id)} />
                </article>
              )) : <Empty title="لا توجد مواد" text="أضف مادة مخزون جديدة." />}
            </div>
          </Panel>
          <Panel title="آخر الحركات والوصفات">
            <div className="grid gap-2">
              {transactions.slice(0, 8).map((transaction) => (
                <p key={transaction.id} className="rounded-md bg-slate-50 p-2 text-sm font-bold text-slate-600">{transaction.type} · {transaction.quantity} · {transaction.reason || transaction.referenceType}</p>
              ))}
              {recipes.slice(0, 8).map((entry) => (
                <p key={entry.id} className="rounded-md bg-amber-50 p-2 text-sm font-bold text-amber-800">وصفة: {nameById(menuItems, entry.menuItemId)} ← {nameById(items, entry.inventoryItemId)} x {entry.quantity}</p>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <PopupForm open={formOpen} onClose={closeForm} title={editingId ? "تعديل مادة" : "إضافة مادة"} maxWidth="lg">
        <form onSubmit={save} className="grid gap-3">
          <Field label="الاسم" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <Field label="الفئة" value={form.category} onChange={(category) => setForm({ ...form, category })} />
          <Field label="الوحدة" value={form.unit} onChange={(unit) => setForm({ ...form, unit })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="الكمية" type="number" value={form.currentQuantity} onChange={(currentQuantity) => setForm({ ...form, currentQuantity: Number(currentQuantity) })} />
            <Field label="الحد الأدنى" type="number" min="0" value={form.minimumQuantity} onChange={(minimumQuantity) => setForm({ ...form, minimumQuantity: Number(minimumQuantity) })} />
            <Field label="متوسط التكلفة" type="number" min="0" value={form.averageCost} onChange={(averageCost) => setForm({ ...form, averageCost: Number(averageCost) })} />
            <Field label="سعر البيع" type="number" min="0" value={form.sellPrice} onChange={(sellPrice) => setForm({ ...form, sellPrice: Number(sellPrice) })} />
          </div>
          <div className="flex gap-2">
            <PrimaryButton>{editingId ? "حفظ" : "إضافة"}</PrimaryButton>
            <SecondaryButton onClick={closeForm}>إلغاء</SecondaryButton>
          </div>
        </form>
      </PopupForm>
    </OpsShell>
  );
}
