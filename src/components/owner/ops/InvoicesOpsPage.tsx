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
  AppTextarea,
  AppToolbar,
  PopupForm,
  cn
} from "@/components/shared";
import { adminRequest } from "@/lib/api";
import { formatInteger } from "@/lib/format";
import type { Invoice, InvoiceStatus, InvoiceType, PaymentMethod, Supplier } from "@/types/ops";
import { money, OpsShell, useOpsPage } from "./OpsShared";
import { buildCurrentMonthRange, dateRangeLabel, formatFinancialDate, invoiceStatuses, invoiceTypes, isWithinDateRange, numberValue, option, paymentMethodLabel, paymentMethods, run } from "./OpsPageShared";

type InvoiceForm = {
  type: string;
  status: string;
  orderId: string;
  supplierId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  serviceCharge: number;
  paidAmount: number;
  paymentMethod: string;
  dueDate: string;
  notes: string;
};

export function InvoicesOpsPage() {
  const state = useOpsPage("accounting");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [status, setStatus] = useState("ALL");
  const [dateRange, setDateRange] = useState(buildCurrentMonthRange);
  const [editingId, setEditingId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDeleteInvoice, setPendingDeleteInvoice] = useState<Invoice | null>(null);
  const [form, setForm] = useState<InvoiceForm>(emptyInvoiceForm());

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
    await run(state, async () => {
      await adminRequest(`/api/owner/ops/invoices/${id}`, state.token, { method: "DELETE" });
      setPendingDeleteInvoice(null);
      await load();
    });
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
    setForm({
      ...form,
      type: invoice.type,
      status: invoice.status,
      orderId: invoice.orderId,
      supplierId: invoice.supplierId,
      itemName: invoice.items[0]?.name || "",
      quantity: invoice.items[0]?.quantity || 1,
      unitPrice: invoice.items[0]?.unitPrice || 0,
      discount: invoice.discount,
      tax: invoice.tax,
      serviceCharge: invoice.serviceCharge,
      paidAmount: invoice.paidAmount,
      paymentMethod: invoice.paymentMethod,
      dueDate: invoice.dueDate,
      notes: invoice.notes
    });
    setFormOpen(true);
  }

  const filtered = invoices
    .filter((invoice) => status === "ALL" || invoice.status === status)
    .filter((invoice) => isWithinDateRange(invoice.createdAt || invoice.dueDate, dateRange.from, dateRange.to))
    .sort((first, second) => String(second.createdAt || second.dueDate || "").localeCompare(String(first.createdAt || first.dueDate || "")));
  const invoiceTotal = filtered.reduce((sum, invoice) => sum + numberValue(invoice.total), 0);
  const paidTotal = filtered.reduce((sum, invoice) => sum + numberValue(invoice.paidAmount), 0);
  const remainingTotal = filtered.reduce((sum, invoice) => sum + numberValue(invoice.remainingAmount), 0);

  return (
    <OpsShell title="الفواتير" eyebrow="المحاسبة" module="accounting" state={state} onRefresh={() => void Promise.all([state.loadRestaurant(), load()])}>
      <div className="grid gap-4">
        <AppPageHeader
          title="الفواتير"
          description="إدارة فواتير البيع والشراء والاسترداد."
          primaryAction={<AppButton type="button" onClick={openNewForm}>إنشاء فاتورة</AppButton>}
          secondaryActions={(
            <>
              <AppBadge variant="neutral">{formatInteger(filtered.length)} فاتورة</AppBadge>
              <AppBadge variant="primary">{money(invoiceTotal, state.restaurant?.currency)}</AppBadge>
              <AppBadge variant={remainingTotal > 0 ? "danger" : "success"}>{money(remainingTotal, state.restaurant?.currency)} متبقٍ</AppBadge>
            </>
          )}
        />

        <AppSurface title="قائمة الفواتير">
          <AppToolbar
            search={(
              <div className="grid gap-3 sm:grid-cols-2">
                <AppFieldShell label="من">
                  <AppInput type="date" value={dateRange.from} onChange={(event) => setDateRange((current) => ({ ...current, from: event.target.value }))} />
                </AppFieldShell>
                <AppFieldShell label="إلى">
                  <AppInput type="date" value={dateRange.to} onChange={(event) => setDateRange((current) => ({ ...current, to: event.target.value }))} />
                </AppFieldShell>
              </div>
            )}
            filters={(
              <AppFieldShell label="الحالة" className="min-w-44">
                <AppSelect value={status} onChange={(event) => setStatus(event.target.value)}>
                  {["ALL", ...invoiceStatuses].map((nextStatus) => <option key={nextStatus} value={nextStatus}>{invoiceStatusFilterLabel(nextStatus)}</option>)}
                </AppSelect>
              </AppFieldShell>
            )}
            actions={<AppButton type="button" variant="secondary" onClick={() => setDateRange(buildCurrentMonthRange())}>الشهر الحالي</AppButton>}
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FinancialMetric title="عدد الفواتير" value={formatInteger(filtered.length)} />
            <FinancialMetric title="الإجمالي" value={money(invoiceTotal, state.restaurant?.currency)} />
            <FinancialMetric title="المدفوع" value={money(paidTotal, state.restaurant?.currency)} tone="success" />
            <FinancialMetric title="المتبقي" value={money(remainingTotal, state.restaurant?.currency)} tone={remainingTotal > 0 ? "danger" : "success"} />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-app-md border border-app-border bg-app-surface-muted px-3 py-2 text-app-body">
            <span className="font-medium text-app-muted">الفترة: {dateRangeLabel(dateRange)}</span>
            <span className="font-semibold text-app-ink">الحالة: {invoiceStatusFilterLabel(status)}</span>
          </div>

          {filtered.length ? (
            <>
              <div className="mt-4 hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[980px] border-separate border-spacing-0 text-right text-app-body">
                  <thead>
                    <tr className="text-app-label text-app-muted">
                      <th className="border-b border-app-border px-3 py-2 font-semibold">التاريخ</th>
                      <th className="border-b border-app-border px-3 py-2 font-semibold">النوع</th>
                      <th className="border-b border-app-border px-3 py-2 font-semibold">الطرف</th>
                      <th className="border-b border-app-border px-3 py-2 font-semibold">البنود</th>
                      <th className="border-b border-app-border px-3 py-2 font-semibold">الإجمالي</th>
                      <th className="border-b border-app-border px-3 py-2 font-semibold">المدفوع</th>
                      <th className="border-b border-app-border px-3 py-2 font-semibold">المتبقي</th>
                      <th className="border-b border-app-border px-3 py-2 font-semibold">الحالة</th>
                      <th className="border-b border-app-border px-3 py-2 font-semibold">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((invoice) => (
                      <tr key={invoice.id} className="align-middle">
                        <td className="whitespace-nowrap border-b border-app-border px-3 py-3">{formatFinancialDate(invoice.createdAt || invoice.dueDate)}</td>
                        <td className="whitespace-nowrap border-b border-app-border px-3 py-3"><AppBadge variant="neutral">{invoiceTypeLabel(invoice.type)}</AppBadge></td>
                        <td className="border-b border-app-border px-3 py-3 text-app-muted">{invoicePartyLabel(invoice, suppliers)}</td>
                        <td className="max-w-xs border-b border-app-border px-3 py-3 font-semibold text-app-ink"><span className="block truncate">{invoice.items.map((item) => item.name).join("، ") || "-"}</span></td>
                        <td className="whitespace-nowrap border-b border-app-border px-3 py-3 font-semibold text-app-ink">{money(invoice.total, state.restaurant?.currency)}</td>
                        <td className="whitespace-nowrap border-b border-app-border px-3 py-3 font-semibold text-app-success">{money(invoice.paidAmount, state.restaurant?.currency)}</td>
                        <td className="whitespace-nowrap border-b border-app-border px-3 py-3 font-semibold text-app-danger">{money(invoice.remainingAmount, state.restaurant?.currency)}</td>
                        <td className="whitespace-nowrap border-b border-app-border px-3 py-3"><InvoiceStatusBadge status={invoice.status} /></td>
                        <td className="border-b border-app-border px-3 py-3">
                          <InvoiceRowActions onEdit={() => edit(invoice)} onDelete={() => setPendingDeleteInvoice(invoice)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid gap-2 lg:hidden">
                {filtered.map((invoice) => (
                  <InvoiceMobileRow key={invoice.id} invoice={invoice} suppliers={suppliers} currency={state.restaurant?.currency} onEdit={() => edit(invoice)} onDelete={() => setPendingDeleteInvoice(invoice)} />
                ))}
              </div>
            </>
          ) : (
            <AppEmptyState className="mt-4" title="لا توجد فواتير" description="أنشئ فاتورة جديدة أو غيّر الفترة." action={<AppButton type="button" onClick={openNewForm}>إنشاء فاتورة</AppButton>} />
          )}
        </AppSurface>
      </div>

      <PopupForm open={formOpen} onClose={closeForm} title={editingId ? "تعديل فاتورة" : "إنشاء فاتورة"} maxWidth="lg">
        <form onSubmit={save} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <AppFieldShell label="النوع">
              <AppSelect value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as InvoiceType })}>
                {invoiceTypes.map((type) => <option key={type} value={type}>{invoiceTypeLabel(type)}</option>)}
              </AppSelect>
            </AppFieldShell>
            <AppFieldShell label="الحالة">
              <AppSelect value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as InvoiceStatus })}>
                {invoiceStatuses.map((nextStatus) => <option key={nextStatus} value={nextStatus}>{invoiceStatusLabel(nextStatus)}</option>)}
              </AppSelect>
            </AppFieldShell>
          </div>
          <AppFieldShell label="المورد">
            <AppSelect value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}>
              <option value="">بدون مورد</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </AppSelect>
          </AppFieldShell>
          <AppFieldShell label="اسم البند">
            <AppInput value={form.itemName} onChange={(event) => setForm({ ...form, itemName: event.target.value })} />
          </AppFieldShell>
          <div className="grid gap-3 sm:grid-cols-2">
            <AppFieldShell label="الكمية">
              <AppInput type="number" min="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} />
            </AppFieldShell>
            <AppFieldShell label="سعر الوحدة">
              <AppInput type="number" min="0" value={form.unitPrice} onChange={(event) => setForm({ ...form, unitPrice: Number(event.target.value) })} />
            </AppFieldShell>
            <AppFieldShell label="خصم">
              <AppInput type="number" min="0" value={form.discount} onChange={(event) => setForm({ ...form, discount: Number(event.target.value) })} />
            </AppFieldShell>
            <AppFieldShell label="مدفوع">
              <AppInput type="number" min="0" value={form.paidAmount} onChange={(event) => setForm({ ...form, paidAmount: Number(event.target.value) })} />
            </AppFieldShell>
          </div>
          <AppFieldShell label="طريقة الدفع">
            <AppSelect value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as PaymentMethod })}>
              {paymentMethods.map((method) => <option key={method} value={method}>{option(method).label}</option>)}
            </AppSelect>
          </AppFieldShell>
          <AppFieldShell label="ملاحظات">
            <AppTextarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </AppFieldShell>
          <div className="flex flex-wrap gap-2">
            <AppButton type="submit">{editingId ? "حفظ" : "إنشاء"}</AppButton>
            <AppButton type="button" variant="secondary" onClick={closeForm}>إلغاء</AppButton>
          </div>
        </form>
      </PopupForm>

      <PopupForm open={Boolean(pendingDeleteInvoice)} onClose={() => setPendingDeleteInvoice(null)} title="حذف الفاتورة" maxWidth="sm">
        <div className="grid gap-4">
          <p className="text-app-body text-app-muted">سيتم حذف الفاتورة بقيمة {money(pendingDeleteInvoice?.total ?? 0, state.restaurant?.currency)}. لا يمكن التراجع عن هذا الإجراء.</p>
          <div className="flex flex-wrap gap-2">
            <AppButton type="button" variant="destructive" onClick={() => pendingDeleteInvoice ? void remove(pendingDeleteInvoice.id) : undefined}>حذف</AppButton>
            <AppButton type="button" variant="secondary" onClick={() => setPendingDeleteInvoice(null)}>إلغاء</AppButton>
          </div>
        </div>
      </PopupForm>
    </OpsShell>
  );
}

function InvoiceMobileRow({ invoice, suppliers, currency, onEdit, onDelete }: { invoice: Invoice; suppliers: Supplier[]; currency?: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <article className="rounded-app-md border border-app-border bg-app-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <AppBadge variant="neutral">{invoiceTypeLabel(invoice.type)}</AppBadge>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
          <p className="mt-2 truncate font-semibold text-app-ink">{invoice.items.map((item) => item.name).join("، ") || "-"}</p>
          <p className="mt-1 text-app-helper text-app-muted">{invoicePartyLabel(invoice, suppliers)} · {formatFinancialDate(invoice.createdAt || invoice.dueDate)}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-app-body">
        <InvoiceFact label="الإجمالي" value={money(invoice.total, currency)} strong />
        <InvoiceFact label="المدفوع" value={money(invoice.paidAmount, currency)} tone="success" />
        <InvoiceFact label="المتبقي" value={money(invoice.remainingAmount, currency)} tone="danger" />
      </div>
      <InvoiceRowActions onEdit={onEdit} onDelete={onDelete} className="mt-3" />
    </article>
  );
}

function FinancialMetric({ title, value, tone = "neutral" }: { title: string; value: string; tone?: "neutral" | "success" | "danger" }) {
  return (
    <div className="rounded-app-md border border-app-border bg-app-surface-muted p-3">
      <p className="text-app-helper font-medium text-app-muted">{title}</p>
      <p className={cn("mt-1 truncate font-semibold", tone === "success" ? "text-app-success" : tone === "danger" ? "text-app-danger" : "text-app-ink")}>{value}</p>
    </div>
  );
}

function InvoiceFact({ label, value, tone = "neutral", strong = false }: { label: string; value: string; tone?: "neutral" | "success" | "danger"; strong?: boolean }) {
  return (
    <div className="rounded-app-sm border border-app-border bg-app-surface-muted px-3 py-2">
      <p className="text-app-helper text-app-muted">{label}</p>
      <p className={cn("mt-1 truncate font-semibold", strong && "text-base", tone === "success" ? "text-app-success" : tone === "danger" ? "text-app-danger" : "text-app-ink")}>{value}</p>
    </div>
  );
}

function InvoiceRowActions({ onEdit, onDelete, className }: { onEdit: () => void; onDelete: () => void; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <AppButton type="button" variant="secondary" size="sm" onClick={onEdit}>تعديل</AppButton>
      <AppButton type="button" variant="ghost" size="sm" onClick={onDelete} className="text-app-danger hover:bg-app-danger-soft">حذف</AppButton>
    </div>
  );
}

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <AppBadge variant={invoiceStatusVariant(status)}>{invoiceStatusLabel(status)}</AppBadge>;
}

function invoiceStatusVariant(status: InvoiceStatus): "neutral" | "success" | "warning" | "danger" {
  if (status === "PAID") return "success";
  if (status === "VOID") return "danger";
  if (status === "PARTIAL") return "warning";
  return "neutral";
}

function invoiceStatusFilterLabel(status: string) {
  return status === "ALL" ? "كل الحالات" : invoiceStatusLabel(status as InvoiceStatus);
}

function invoiceStatusLabel(status: InvoiceStatus) {
  const labels: Record<InvoiceStatus, string> = {
    UNPAID: "غير مدفوعة",
    PARTIAL: "مدفوعة جزئياً",
    PAID: "مدفوعة",
    VOID: "ملغاة"
  };
  return labels[status];
}

function invoiceTypeLabel(type: InvoiceType) {
  const labels: Record<InvoiceType, string> = {
    SALE: "بيع",
    PURCHASE: "شراء",
    REFUND: "استرداد"
  };
  return labels[type];
}

function invoicePartyLabel(invoice: Invoice, suppliers: Supplier[]) {
  if (invoice.supplierId) return suppliers.find((supplier) => supplier.id === invoice.supplierId)?.name ?? invoice.supplierId;
  if (invoice.orderId) return invoice.orderId;
  return "-";
}

function emptyInvoiceForm(): InvoiceForm {
  return { type: "SALE", status: "UNPAID", orderId: "", supplierId: "", itemName: "", quantity: 1, unitPrice: 0, discount: 0, tax: 0, serviceCharge: 0, paidAmount: 0, paymentMethod: "CASH", dueDate: "", notes: "" };
}
