"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
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
import { useLiveQuery } from "@/offline/hooks/useLiveQuery";
import { deleteLocalTable, hydrateTables, listLocalTables, saveLocalTable, type OfflineContext } from "@/offline/repositories/tables";
import type { OpsTable } from "@/types/ops";
import { OpsShell, useOpsPage } from "./OpsShared";
import { option, run, tableStatuses } from "./OpsPageShared";

export function TablesOpsPage() {
  const state = useOpsPage("tables");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [editingId, setEditingId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDeleteTable, setPendingDeleteTable] = useState<OpsTable | null>(null);
  const [form, setForm] = useState({ name: "", area: "Main", capacity: 4, status: "AVAILABLE", currentOrderId: "", qrCode: "" });
  const tenantId = state.restaurant?.id ?? "";
  const offlineContext = useMemo<OfflineContext | null>(() => {
    if (!state.token || !tenantId) return null;
    return {
      token: state.token,
      tenantId,
      userId: state.restaurant?.ownerUserId ?? "owner"
    };
  }, [state.restaurant?.ownerUserId, state.token, tenantId]);
  const { value: tables } = useLiveQuery(() => tenantId ? listLocalTables(tenantId) : Promise.resolve([]), [] as OpsTable[], [tenantId]);

  useEffect(() => {
    if (offlineContext && state.modules?.tables) void load();
  }, [offlineContext, state.modules?.tables]);

  async function load() {
    if (!offlineContext) return;
    await hydrateTables(offlineContext);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!offlineContext) {
      state.setMessage("تعذر تحديد المطعم الحالي.");
      return;
    }
    await run(state, async () => {
      await saveLocalTable(offlineContext, {
        id: editingId || undefined,
        name: form.name,
        area: form.area,
        capacity: form.capacity,
        status: form.status as OpsTable["status"],
        currentOrderId: form.currentOrderId,
        qrCode: form.qrCode
      });
      reset();
      setFormOpen(false);
    });
  }

  async function remove(id: string) {
    if (!offlineContext) {
      state.setMessage("تعذر تحديد المطعم الحالي.");
      return;
    }
    await run(state, async () => {
      await deleteLocalTable(offlineContext, id);
      setPendingDeleteTable(null);
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
      <AppPageHeader
        className="mb-4"
        title="الطاولات"
        description="إدارة طاولات المطعم ومتابعة حالتها."
        primaryAction={<AppButton type="button" onClick={openNewForm}>إضافة طاولة</AppButton>}
        secondaryActions={
          <div className="flex flex-wrap items-center gap-2">
            <AppBadge variant="neutral">{filtered.length} طاولة</AppBadge>
            <AppBadge variant="success">{tables.filter((table) => table.status === "AVAILABLE").length} فارغة</AppBadge>
            <AppBadge variant="warning">{tables.filter((table) => table.currentOrderId).length} مع طلب</AppBadge>
          </div>
        }
      />

      <AppSurface className="p-4">
        <AppToolbar
          search={
            <AppFieldShell label="بحث">
              <AppInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث باسم الطاولة أو المنطقة أو الطلب" />
            </AppFieldShell>
          }
          filters={
            <AppFieldShell label="الحالة">
              <AppSelect value={status} onChange={(event) => setStatus(event.target.value)} className="min-w-[180px]">
                {["ALL", ...tableStatuses].map((entry) => (
                  <option key={entry} value={entry}>
                    {entry === "ALL" ? "كل الحالات" : option(entry).label}
                  </option>
                ))}
              </AppSelect>
            </AppFieldShell>
          }
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filtered.length ? filtered.map((table) => (
            <article key={table.id} className={cn("flex min-h-44 flex-col justify-between rounded-app-lg border border-app-border bg-app-surface p-3 transition-colors hover:border-app-border-strong", table.status === "DISABLED" && "opacity-65")}>
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-3xl font-semibold leading-tight text-app-ink">{table.name}</h3>
                    <p className="mt-1 text-app-meta text-app-muted">{table.area} · {table.capacity} مقاعد</p>
                  </div>
                  <TableStatusBadge status={table.status} />
                </div>
                {table.currentOrderId ? <p className="mt-3 rounded-app-md border border-app-warning bg-app-warning-soft px-2 py-1 text-app-helper font-semibold text-app-warning">طلب مفتوح: {table.currentOrderId}</p> : null}
                {table.qrCode ? <p className="mt-2 truncate text-app-helper text-app-muted">QR: {table.qrCode}</p> : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/owner/operations/tables/${table.id}`} className="inline-flex h-9 items-center justify-center rounded-app-md border border-app-primary bg-app-primary px-3 text-sm font-semibold text-app-primary-foreground transition-colors hover:bg-app-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft">
                  تفاصيل
                </Link>
                <AppButton type="button" variant="secondary" size="sm" onClick={() => edit(table)}>تعديل</AppButton>
                <AppButton type="button" variant="ghost" size="sm" onClick={() => setPendingDeleteTable(table)} className="text-app-danger hover:bg-app-danger-soft">حذف</AppButton>
              </div>
            </article>
          )) : <AppEmptyState title="لا توجد طاولات بعد" description="ابدأ بإضافة طاولة أو غيّر الفلاتر." action={<AppButton type="button" onClick={openNewForm}>إضافة طاولة</AppButton>} />}
        </div>
      </AppSurface>

      <PopupForm open={formOpen} onClose={closeForm} title={editingId ? "تعديل طاولة" : "إضافة طاولة"} maxWidth="md">
        <form onSubmit={save} className="grid gap-3">
          <AppFieldShell label="الاسم/الرقم">
            <AppInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </AppFieldShell>
          <AppFieldShell label="المنطقة">
            <AppInput value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} />
          </AppFieldShell>
          <AppFieldShell label="السعة">
            <AppInput type="number" min="1" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: Number(event.target.value) })} />
          </AppFieldShell>
          <AppFieldShell label="الحالة">
            <AppSelect value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              {tableStatuses.map((next) => <option key={next} value={next}>{option(next).label}</option>)}
            </AppSelect>
          </AppFieldShell>
          <AppFieldShell label="QR">
            <AppInput value={form.qrCode} onChange={(event) => setForm({ ...form, qrCode: event.target.value })} />
          </AppFieldShell>
          <div className="flex gap-2">
            <AppButton type="submit">{editingId ? "حفظ التعديل" : "إضافة"}</AppButton>
            <AppButton type="button" variant="secondary" onClick={closeForm}>إلغاء</AppButton>
          </div>
        </form>
      </PopupForm>

      <PopupForm
        open={Boolean(pendingDeleteTable)}
        onClose={() => setPendingDeleteTable(null)}
        title="حذف الطاولة؟"
        description={pendingDeleteTable ? `سيتم حذف الطاولة ${pendingDeleteTable.name}.` : undefined}
        maxWidth="sm"
      >
        <div className="flex flex-wrap justify-end gap-2">
          <AppButton type="button" variant="secondary" onClick={() => setPendingDeleteTable(null)}>إلغاء</AppButton>
          <AppButton
            type="button"
            variant="destructive"
            disabled={!pendingDeleteTable}
            onClick={() => {
              if (pendingDeleteTable) void remove(pendingDeleteTable.id);
            }}
          >
            حذف الطاولة
          </AppButton>
        </div>
      </PopupForm>
    </OpsShell>
  );
}

function TableStatusBadge({ status }: { status: OpsTable["status"] }) {
  const variant = status === "AVAILABLE" ? "success" : status === "DISABLED" ? "danger" : "warning";
  return <AppBadge variant={variant}>{option(status).label}</AppBadge>;
}
