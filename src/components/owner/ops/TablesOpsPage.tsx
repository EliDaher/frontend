"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { PopupForm } from "@/components/shared";
import { adminRequest } from "@/lib/api";
import type { OpsTable } from "@/types/ops";
import { DangerButton, Empty, Field, OpsShell, Panel, PrimaryButton, SecondaryButton, SelectField, StatusBadge, useOpsPage } from "./OpsShared";
import { Filters, option, run, tableStatuses } from "./OpsPageShared";

export function TablesOpsPage() {
  const state = useOpsPage("tables");
  const [tables, setTables] = useState<OpsTable[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [editingId, setEditingId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: "", area: "Main", capacity: 4, status: "AVAILABLE", currentOrderId: "", qrCode: "" });

  useEffect(() => {
    if (state.token && state.modules?.tables) void load();
  }, [state.token, state.modules?.tables]);

  async function load() {
    setTables(await adminRequest<OpsTable[]>("/api/owner/ops/tables", state.token));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = editingId ? `/api/owner/ops/tables/${editingId}` : "/api/owner/ops/tables";
    await run(state, async () => {
      await adminRequest(path, state.token, { method: editingId ? "PATCH" : "POST", body: JSON.stringify(form) });
      reset();
      setFormOpen(false);
      await load();
    });
  }

  async function remove(id: string) {
    if (!window.confirm("حذف الطاولة؟")) return;
    await run(state, async () => {
      await adminRequest(`/api/owner/ops/tables/${id}`, state.token, { method: "DELETE" });
      await load();
    });
  }

  function edit(table: OpsTable) {
    setEditingId(table.id);
    setForm({ name: table.name, area: table.area, capacity: table.capacity, status: table.status, currentOrderId: table.currentOrderId || "", qrCode: table.qrCode || "" });
    setFormOpen(true);
  }

  function reset() {
    setEditingId("");
    setForm({ name: "", area: "Main", capacity: 4, status: "AVAILABLE", currentOrderId: "", qrCode: "" });
  }

  function openNewForm() {
    reset();
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    reset();
  }

  const filtered = tables.filter((table) => {
    const text = `${table.name} ${table.area} ${table.currentOrderId}`.toLowerCase();
    return (status === "ALL" || table.status === status) && text.includes(query.toLowerCase());
  });

  return (
    <OpsShell title="الطاولات" eyebrow="إدارة الصالات" module="tables" state={state} onRefresh={() => void Promise.all([state.loadRestaurant(), load()])}>
      <Panel
        title="قائمة الطاولات"
        action={(
          <button type="button" onClick={openNewForm} className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-black text-white">
            إضافة طاولة
          </button>
        )}
      >
        <Filters query={query} setQuery={setQuery} status={status} setStatus={setStatus} statuses={["ALL", ...tableStatuses]} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filtered.length ? filtered.map((table) => (
            <article key={table.id} className="flex min-h-48 flex-col justify-between rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-amber-200 hover:shadow-md">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-5xl font-black leading-tight text-slate-950">{table.name}</h3>
                    <p className="mt-1 text-sm font-bold text-slate-500">{table.area} · {table.capacity} مقاعد</p>
                  </div>
                  <StatusBadge label={table.status} tone={table.status === "AVAILABLE" ? "green" : table.status === "DISABLED" ? "red" : "amber"} />
                </div>
                {table.currentOrderId ? <p className="mt-3 rounded-md bg-amber-50 px-2 py-1 text-xs font-black text-amber-800">طلب مفتوح: {table.currentOrderId}</p> : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/owner/operations/tables/${table.id}`} className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-black text-slate-700">
                  تفاصيل
                </Link>
                <SecondaryButton onClick={() => edit(table)}>تعديل</SecondaryButton>
                <DangerButton onClick={() => void remove(table.id)}>حذف</DangerButton>
              </div>
            </article>
          )) : <Empty title="لا توجد طاولات" text="ابدأ بإضافة طاولة أو غيّر الفلاتر." />}
        </div>
      </Panel>

      <PopupForm open={formOpen} onClose={closeForm} title={editingId ? "تعديل طاولة" : "إضافة طاولة"} maxWidth="md">
        <form onSubmit={save} className="grid gap-3">
          <Field label="الاسم/الرقم" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <Field label="المنطقة" value={form.area} onChange={(area) => setForm({ ...form, area })} />
          <Field label="السعة" type="number" min="1" value={form.capacity} onChange={(capacity) => setForm({ ...form, capacity: Number(capacity) })} />
          <SelectField label="الحالة" value={form.status} options={tableStatuses.map(option)} onChange={(next) => setForm({ ...form, status: next })} />
          <Field label="QR" value={form.qrCode} onChange={(qrCode) => setForm({ ...form, qrCode })} />
          <div className="flex gap-2">
            <PrimaryButton>{editingId ? "حفظ التعديل" : "إضافة"}</PrimaryButton>
            <SecondaryButton onClick={closeForm}>إلغاء</SecondaryButton>
          </div>
        </form>
      </PopupForm>
    </OpsShell>
  );
}
