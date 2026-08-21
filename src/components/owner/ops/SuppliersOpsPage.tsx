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
  AppSurface,
  AppTextarea,
  AppToolbar,
  PopupForm,
  cn
} from "@/components/shared";
import { adminRequest } from "@/lib/api";
import { formatInteger } from "@/lib/format";
import type { Supplier } from "@/types/ops";
import { money, OpsShell, useOpsPage } from "./OpsShared";
import { run } from "./OpsPageShared";

type SupplierForm = {
  name: string;
  phone: string;
  balance: number;
  notes: string;
  isActive: boolean;
};

export function SuppliersOpsPage() {
  const state = useOpsPage("purchasing");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDeleteSupplier, setPendingDeleteSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptySupplierForm());

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
      setForm(emptySupplierForm());
      setFormOpen(false);
      await load();
    });
  }

  async function remove(id: string) {
    await run(state, async () => {
      await adminRequest(`/api/owner/ops/suppliers/${id}`, state.token, { method: "DELETE" });
      setPendingDeleteSupplier(null);
      await load();
    });
  }

  function reset() {
    setEditingId("");
    setForm(emptySupplierForm());
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
  const activeCount = suppliers.filter((supplier) => supplier.isActive).length;

  return (
    <OpsShell title="الموردون" eyebrow="المشتريات" module="purchasing" state={state} onRefresh={() => void Promise.all([state.loadRestaurant(), load()])}>
      <div className="grid gap-4">
        <AppPageHeader
          title="الموردون"
          description="إدارة الموردين والحسابات المرتبطة بهم."
          primaryAction={<AppButton type="button" onClick={openNewForm}>إضافة مورد</AppButton>}
          secondaryActions={(
            <>
              <AppBadge variant="neutral">{formatInteger(filtered.length)} مورد</AppBadge>
              <AppBadge variant="primary">{formatInteger(activeCount)} نشط</AppBadge>
            </>
          )}
        />

        <AppSurface title="قائمة الموردين">
          <AppToolbar
            search={(
              <AppFieldShell label="بحث">
                <AppInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="اسم المورد أو الهاتف" />
              </AppFieldShell>
            )}
          />

          {filtered.length ? (
            <>
              <div className="mt-4 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[720px] border-separate border-spacing-0 text-right text-app-body">
                  <thead>
                    <tr className="text-app-label text-app-muted">
                      <th className="border-b border-app-border px-3 py-2 font-semibold">اسم المورد</th>
                      <th className="border-b border-app-border px-3 py-2 font-semibold">الهاتف</th>
                      <th className="border-b border-app-border px-3 py-2 font-semibold">الرصيد</th>
                      <th className="border-b border-app-border px-3 py-2 font-semibold">الحالة</th>
                      <th className="border-b border-app-border px-3 py-2 font-semibold">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((supplier) => (
                      <tr key={supplier.id} className="align-middle">
                        <td className="border-b border-app-border px-3 py-3">
                          <p className="font-semibold text-app-ink">{supplier.name}</p>
                          {supplier.notes ? <p className="mt-1 max-w-md truncate text-app-helper text-app-muted">{supplier.notes}</p> : null}
                        </td>
                        <td className="border-b border-app-border px-3 py-3 text-app-muted">{supplier.phone || "بدون هاتف"}</td>
                        <td className="border-b border-app-border px-3 py-3 font-semibold text-app-ink">{money(supplier.balance, state.restaurant?.currency)}</td>
                        <td className="border-b border-app-border px-3 py-3"><SupplierStatusBadge supplier={supplier} /></td>
                        <td className="border-b border-app-border px-3 py-3">
                          <SupplierRowActions onEdit={() => edit(supplier)} onDelete={() => setPendingDeleteSupplier(supplier)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid gap-2 md:hidden">
                {filtered.map((supplier) => (
                  <SupplierMobileRow key={supplier.id} supplier={supplier} currency={state.restaurant?.currency} onEdit={() => edit(supplier)} onDelete={() => setPendingDeleteSupplier(supplier)} />
                ))}
              </div>
            </>
          ) : (
            <AppEmptyState className="mt-4" title="لا يوجد موردون" description="أضف أول مورد أو غيّر البحث." action={<AppButton type="button" onClick={openNewForm}>إضافة مورد</AppButton>} />
          )}
        </AppSurface>
      </div>

      <PopupForm open={formOpen} onClose={closeForm} title={editingId ? "تعديل مورد" : "إضافة مورد"} maxWidth="md">
        <form onSubmit={save} className="grid gap-3">
          <AppFieldShell label="الاسم">
            <AppInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </AppFieldShell>
          <AppFieldShell label="الهاتف">
            <AppInput value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </AppFieldShell>
          <AppFieldShell label="الرصيد">
            <AppInput type="number" value={form.balance} onChange={(event) => setForm({ ...form, balance: Number(event.target.value) })} />
          </AppFieldShell>
          <AppFieldShell label="ملاحظات">
            <AppTextarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </AppFieldShell>
          <div className="flex flex-wrap gap-2">
            <AppButton type="submit">{editingId ? "حفظ" : "إضافة"}</AppButton>
            <AppButton type="button" variant="secondary" onClick={closeForm}>إلغاء</AppButton>
          </div>
        </form>
      </PopupForm>

      <PopupForm open={Boolean(pendingDeleteSupplier)} onClose={() => setPendingDeleteSupplier(null)} title="حذف المورد" maxWidth="sm">
        <div className="grid gap-4">
          <p className="text-app-body text-app-muted">سيتم حذف المورد {pendingDeleteSupplier?.name}. لا يمكن التراجع عن هذا الإجراء.</p>
          <div className="flex flex-wrap gap-2">
            <AppButton type="button" variant="destructive" onClick={() => pendingDeleteSupplier ? void remove(pendingDeleteSupplier.id) : undefined}>حذف</AppButton>
            <AppButton type="button" variant="secondary" onClick={() => setPendingDeleteSupplier(null)}>إلغاء</AppButton>
          </div>
        </div>
      </PopupForm>
    </OpsShell>
  );
}

function SupplierMobileRow({ supplier, currency, onEdit, onDelete }: { supplier: Supplier; currency?: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <article className="rounded-app-md border border-app-border bg-app-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-app-ink">{supplier.name}</h3>
          <p className="mt-1 text-app-helper text-app-muted">{supplier.phone || "بدون هاتف"}</p>
        </div>
        <SupplierStatusBadge supplier={supplier} />
      </div>
      <div className="mt-3 rounded-app-sm border border-app-border bg-app-surface-muted px-3 py-2">
        <p className="text-app-helper text-app-muted">الرصيد</p>
        <p className="mt-1 font-semibold text-app-ink">{money(supplier.balance, currency)}</p>
      </div>
      {supplier.notes ? <p className="mt-3 line-clamp-2 text-app-helper text-app-muted">{supplier.notes}</p> : null}
      <SupplierRowActions onEdit={onEdit} onDelete={onDelete} className="mt-3" />
    </article>
  );
}

function SupplierRowActions({ onEdit, onDelete, className }: { onEdit: () => void; onDelete: () => void; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <AppButton type="button" variant="secondary" size="sm" onClick={onEdit}>تعديل</AppButton>
      <AppButton type="button" variant="ghost" size="sm" onClick={onDelete} className="text-app-danger hover:bg-app-danger-soft">حذف</AppButton>
    </div>
  );
}

function SupplierStatusBadge({ supplier }: { supplier: Supplier }) {
  return supplier.isActive ? <AppBadge variant="success">نشط</AppBadge> : <AppBadge variant="neutral">غير فعال</AppBadge>;
}

function emptySupplierForm(): SupplierForm {
  return { name: "", phone: "", balance: 0, notes: "", isActive: true };
}
