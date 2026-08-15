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

export function SuppliersOpsPage() {
  const state = useOpsPage("purchasing");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", balance: 0, notes: "", isActive: true });

  useEffect(() => {
    if (state.token && state.modules?.purchasing) void load();
  }, [state.token, state.modules?.purchasing]);

  async function load() {
    setSuppliers(await adminRequest<Supplier[]>("/api/owner/ops/suppliers", state.token));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(state, async () => {
      await adminRequest(editingId ? `/api/owner/ops/suppliers/${editingId}` : "/api/owner/ops/suppliers", state.token, { method: editingId ? "PATCH" : "POST", body: JSON.stringify(form) });
      setEditingId("");
      setForm({ name: "", phone: "", balance: 0, notes: "", isActive: true });
      setFormOpen(false);
      await load();
    });
  }

  async function remove(id: string) {
    if (!window.confirm("حذف المورد؟")) return;
    await run(state, async () => {
      await adminRequest(`/api/owner/ops/suppliers/${id}`, state.token, { method: "DELETE" });
      await load();
    });
  }

  function reset() {
    setEditingId("");
    setForm({ name: "", phone: "", balance: 0, notes: "", isActive: true });
  }

  function openNewForm() {
    reset();
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    reset();
  }

  function edit(supplier: Supplier) {
    setEditingId(supplier.id);
    setForm({ name: supplier.name, phone: supplier.phone, balance: supplier.balance, notes: supplier.notes, isActive: supplier.isActive });
    setFormOpen(true);
  }
  const filtered = suppliers.filter((supplier) => `${supplier.name} ${supplier.phone}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <OpsShell title="الموردون" eyebrow="المشتريات" module="purchasing" state={state} onRefresh={() => void Promise.all([state.loadRestaurant(), load()])}>
      <Panel
        title="قائمة الموردين"
        action={(
          <button type="button" onClick={openNewForm} className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-black text-white">
            إضافة مورد
          </button>
        )}
      >
        <Field label="بحث" value={query} onChange={setQuery} />
        <div className="mt-4 grid gap-3">
          {filtered.length ? filtered.map((supplier) => (
            <article key={supplier.id} className="rounded-lg border border-slate-200 p-3">
              <h3 className="font-black">{supplier.name}</h3>
              <p className="mt-1 text-sm font-bold text-slate-500">{supplier.phone || "بدون هاتف"} · رصيد {money(supplier.balance, state.restaurant?.currency)}</p>
              <p className="mt-1 text-sm font-bold text-slate-500">{supplier.notes}</p>
              <RowActions onEdit={() => edit(supplier)} onDelete={() => void remove(supplier.id)} />
            </article>
          )) : <Empty title="لا يوجد موردون" text="أضف أول مورد." />}
        </div>
      </Panel>

      <PopupForm open={formOpen} onClose={closeForm} title={editingId ? "تعديل مورد" : "إضافة مورد"} maxWidth="md">
        <form onSubmit={save} className="grid gap-3">
          <Field label="الاسم" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <Field label="الهاتف" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
          <Field label="الرصيد" type="number" value={form.balance} onChange={(balance) => setForm({ ...form, balance: Number(balance) })} />
          <TextArea label="ملاحظات" value={form.notes} onChange={(notes) => setForm({ ...form, notes })} />
          <div className="flex gap-2">
            <PrimaryButton>{editingId ? "حفظ" : "إضافة"}</PrimaryButton>
            <SecondaryButton onClick={closeForm}>إلغاء</SecondaryButton>
          </div>
        </form>
      </PopupForm>
    </OpsShell>

  );
}
