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

export function InvoicesOpsPage() {
  const state = useOpsPage("accounting");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [status, setStatus] = useState("ALL");
  const [editingId, setEditingId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ type: "SALE", status: "UNPAID", orderId: "", supplierId: "", itemName: "", quantity: 1, unitPrice: 0, discount: 0, tax: 0, serviceCharge: 0, paidAmount: 0, paymentMethod: "CASH", dueDate: "", notes: "" });

  useEffect(() => {
    if (state.token && state.modules?.accounting) void load();
  }, [state.token, state.modules?.accounting]);

  async function load() {
    const [nextInvoices, nextSuppliers] = await Promise.all([
      adminRequest<Invoice[]>("/api/owner/ops/invoices", state.token),
      state.modules?.purchasing ? adminRequest<Supplier[]>("/api/owner/ops/suppliers", state.token).catch(() => []) : Promise.resolve([])
    ]);
    setInvoices(nextInvoices);
    setSuppliers(nextSuppliers);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      type: form.type,
      status: form.status,
      orderId: form.orderId,
      supplierId: form.supplierId,
      items: [{ itemId: "", name: form.itemName, quantity: form.quantity, unitPrice: form.unitPrice }],
      discount: form.discount,
      tax: form.tax,
      serviceCharge: form.serviceCharge,
      paidAmount: form.paidAmount,
      paymentMethod: form.paymentMethod,
      dueDate: form.dueDate,
      notes: form.notes
    };
    await run(state, async () => {
      await adminRequest(editingId ? `/api/owner/ops/invoices/${editingId}` : "/api/owner/ops/invoices", state.token, { method: editingId ? "PATCH" : "POST", body: JSON.stringify(body) });
      setEditingId("");
      setForm(emptyInvoiceForm());
      setFormOpen(false);
      await load();
    });
  }

  async function remove(id: string) {
    if (!window.confirm("حذف الفاتورة؟")) return;
    await run(state, async () => {
      await adminRequest(`/api/owner/ops/invoices/${id}`, state.token, { method: "DELETE" });
      await load();
    });
  }

  function emptyInvoiceForm() {
    return { type: "SALE", status: "UNPAID", orderId: "", supplierId: "", itemName: "", quantity: 1, unitPrice: 0, discount: 0, tax: 0, serviceCharge: 0, paidAmount: 0, paymentMethod: "CASH", dueDate: "", notes: "" };
  }

  function openNewForm() {
    setEditingId("");
    setForm(emptyInvoiceForm());
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId("");
    setForm(emptyInvoiceForm());
  }

  function edit(invoice: Invoice) {
    setEditingId(invoice.id);
    setForm({ ...form, type: invoice.type, status: invoice.status, orderId: invoice.orderId, supplierId: invoice.supplierId, itemName: invoice.items[0]?.name || "", quantity: invoice.items[0]?.quantity || 1, unitPrice: invoice.items[0]?.unitPrice || 0, discount: invoice.discount, tax: invoice.tax, serviceCharge: invoice.serviceCharge, paidAmount: invoice.paidAmount, paymentMethod: invoice.paymentMethod, dueDate: invoice.dueDate, notes: invoice.notes });
    setFormOpen(true);
  }
  const filtered = invoices.filter((invoice) => status === "ALL" || invoice.status === status);

  return (
    <OpsShell title="الفواتير" eyebrow="المحاسبة" module="accounting" state={state} onRefresh={() => void Promise.all([state.loadRestaurant(), load()])}>
      <Panel
        title="قائمة الفواتير"
        action={(
          <button type="button" onClick={openNewForm} className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-black text-white">
            إنشاء فاتورة
          </button>
        )}
      >
        <Filters query="" setQuery={() => undefined} status={status} setStatus={setStatus} statuses={["ALL", ...invoiceStatuses]} />
        <div className="mt-4 grid gap-3">
          {filtered.length ? filtered.map((invoice) => (
            <article key={invoice.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-black">{invoice.type} ?? {invoice.items.map((item) => item.name).join("?? ")}</h3>
                  <p className="mt-1 text-sm font-bold text-slate-500">الإجمالي {money(invoice.total, state.restaurant?.currency)} · المتبقي {money(invoice.remainingAmount, state.restaurant?.currency)}</p>
                </div>
                <StatusBadge label={invoice.status} tone={invoice.status === "PAID" ? "green" : invoice.status === "VOID" ? "red" : "amber"} />
              </div>
              <RowActions onEdit={() => edit(invoice)} onDelete={() => void remove(invoice.id)} />
            </article>
          )) : <Empty title="لا توجد فواتير" text="أنشئ فاتورة جديدة." />}
        </div>
      </Panel>

      <PopupForm open={formOpen} onClose={closeForm} title={editingId ? "تعديل فاتورة" : "إنشاء فاتورة"} maxWidth="lg">
        <form onSubmit={save} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="النوع" value={form.type} options={invoiceTypes.map(option)} onChange={(type) => setForm({ ...form, type })} />
            <SelectField label="الحالة" value={form.status} options={invoiceStatuses.map(option)} onChange={(next) => setForm({ ...form, status: next })} />
          </div>
          <SelectField label="المورد" value={form.supplierId} options={[{ value: "", label: "بدون مورد" }, ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))]} onChange={(supplierId) => setForm({ ...form, supplierId })} />
          <Field label="اسم البند" value={form.itemName} onChange={(itemName) => setForm({ ...form, itemName })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="الكمية" type="number" min="1" value={form.quantity} onChange={(quantity) => setForm({ ...form, quantity: Number(quantity) })} />
            <Field label="سعر الوحدة" type="number" min="0" value={form.unitPrice} onChange={(unitPrice) => setForm({ ...form, unitPrice: Number(unitPrice) })} />
            <Field label="خصم" type="number" min="0" value={form.discount} onChange={(discount) => setForm({ ...form, discount: Number(discount) })} />
            <Field label="مدفوع" type="number" min="0" value={form.paidAmount} onChange={(paidAmount) => setForm({ ...form, paidAmount: Number(paidAmount) })} />
          </div>
          <SelectField label="طريقة الدفع" value={form.paymentMethod} options={paymentMethods.map(option)} onChange={(paymentMethod) => setForm({ ...form, paymentMethod })} />
          <TextArea label="ملاحظات" value={form.notes} onChange={(notes) => setForm({ ...form, notes })} />
          <div className="flex gap-2">
            <PrimaryButton>{editingId ? "حفظ" : "إنشاء"}</PrimaryButton>
            <SecondaryButton onClick={closeForm}>إلغاء</SecondaryButton>
          </div>
        </form>
      </PopupForm>
    </OpsShell>

  );
}
