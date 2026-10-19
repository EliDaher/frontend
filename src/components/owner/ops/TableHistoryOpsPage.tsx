"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AppBadge,
  AppButton,
  AppEmptyState,
  AppInput,
  AppSurface,
  cn,
} from "@/components/shared";
import { adminRequest } from "@/lib/api";
import {
  historyDay,
  historyZone,
  historyOrderTime,
  ordersForHistoryDay,
  shiftHistoryDay,
  validHistoryDay,
} from "@/lib/table-history";
import { sortTablesByNumber } from "@/lib/table-number";
import { listLocalOrders, refreshOrders } from "@/offline/repositories/orders";
import { listLocalTables, refreshTables } from "@/offline/repositories/tables";
import { useLiveQuery } from "@/offline/hooks/useLiveQuery";
import { offlineDb } from "@/offline/db";
import type { OpsOrder, OpsTable } from "@/types/ops";
import type { Restaurant } from "@/types/menu";
import { OpsShell, money, useOpsPage } from "./OpsShared";
import { option, paymentMethodLabel } from "./OpsPageShared";
import { OrderReceiptPrintButton } from "./OrderReceiptPrintButton";
import type { ReceiptInvoiceSnapshot } from "./receipt";

export function TableHistoryOpsPage() {
  const state = useOpsPage("tables");
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const zone = historyZone(state.restaurant?.timezone);
  const today = historyDay(new Date(), zone);
  const requestedDay = params.get("date") || today;
  const day =
    validHistoryDay(requestedDay) && requestedDay <= today
      ? requestedDay
      : today;
  const selectedId = params.get("table") || "";
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const details = useRef<HTMLElement>(null);
  const tenantId = state.restaurant?.id || "";
  const tablesQuery = useLiveQuery(
    () => (tenantId ? listLocalTables(tenantId) : Promise.resolve([])),
    [] as OpsTable[],
    [tenantId],
  );
  const ordersQuery = useLiveQuery(
    () => (tenantId ? listLocalOrders(tenantId) : Promise.resolve([])),
    [] as OpsOrder[],
    [tenantId],
  );
  const load = useCallback(async () => {
    if (!tenantId || !state.token) return;
    setLoading(true);
    setError("");
    setOffline(!navigator.onLine);
    const context = {
      tenantId,
      token: state.token,
      userId: state.restaurant?.ownerUserId || "owner",
    };
    try {
      await Promise.all([
        refreshTables(context, true),
        refreshOrders(context, true),
      ]);
    } catch {
      setError("تعذر تحديث السجل. البيانات المحفوظة قد تكون غير مكتملة.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, state.token, state.restaurant?.ownerUserId]);
  useEffect(() => {
    if (state.modules?.tables && state.modules?.orders) void load();
  }, [load, state.modules?.tables, state.modules?.orders]);
  useEffect(() => {
    const online = () => {
      setOffline(false);
      void load();
    };
    const offline = () => setOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [load]);
  function navigate(nextDay: string, table = "") {
    const next = new URLSearchParams();
    next.set("date", nextDay);
    if (table) next.set("table", table);
    router.push(`${path}?${next}`, { scroll: false });
  }
  useEffect(() => {
    if (selectedId) {
      details.current?.focus({ preventScroll: true });
      details.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    }
  }, [selectedId, day, state.modules?.orders]);
  const orders = useMemo(
    () => ordersForHistoryDay(ordersQuery.value, day, zone),
    [ordersQuery.value, day, zone],
  );
  const tables = sortTablesByNumber(tablesQuery.value);
  const known = new Set(tables.map((table) => table.id));
  const unavailable = orders.filter((order) => !known.has(order.tableId));
  const selected = tables.find((table) => table.id === selectedId);
  const selectedOrders =
    selectedId === "unavailable"
      ? unavailable
      : orders.filter((order) => order.tableId === selectedId);
  const time = (value: string) =>
    value && Number.isFinite(Date.parse(value))
      ? new Intl.DateTimeFormat("ar-SY", {
          timeZone: zone,
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(value))
      : "الوقت غير متاح";
  const warning =
    error ||
    (tablesQuery.error || ordersQuery.error
      ? "تعذر قراءة بعض البيانات المحفوظة. أعد المحاولة."
      : offline
        ? "أنت دون اتصال. يظهر السجل المحفوظ على هذا الجهاز وقد لا يكون مكتملًا."
        : "");
  return (
    <OpsShell
      title="سجل الطاولات"
      eyebrow="استعراض الأيام السابقة"
      module="tables"
      state={state}
      onRefresh={() => void load()}
    >
      {!state.modules?.orders ? (
        <AppEmptyState
          title="وحدة الطلبات غير مفعلة"
          description="يتطلب سجل الطاولات تفعيل وحدة الطلبات."
        />
      ) : (
        <div className="grid gap-4">
          <header className="flex flex-col justify-between gap-3 rounded-app-lg border border-app-border bg-app-surface p-4 xl:flex-row xl:items-center">
            <div>
              <h1 className="text-app-page-title font-semibold">
                سجل الطاولات
              </h1>
              <p className="text-app-helper text-app-muted">
                للاستعراض وطباعة الفواتير فقط
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-app-label">
                اليوم
                <AppInput
                  aria-label="يوم السجل"
                  type="date"
                  className="w-44"
                  max={today}
                  value={day}
                  onChange={(event) => {
                    if (
                      validHistoryDay(event.target.value) &&
                      event.target.value <= today
                    )
                      navigate(event.target.value);
                  }}
                />
              </label>
              <AppButton
                variant="secondary"
                onClick={() => navigate(shiftHistoryDay(day, -1))}
              >
                اليوم السابق
              </AppButton>
              <AppButton
                variant="secondary"
                disabled={day >= today}
                onClick={() => navigate(shiftHistoryDay(day, 1))}
              >
                اليوم التالي
              </AppButton>
              <AppButton
                variant="secondary"
                disabled={day === today}
                onClick={() => navigate(today)}
              >
                اليوم
              </AppButton>
            </div>
          </header>
          {selectedId ? (
            <div
              role="status"
              aria-live="polite"
              className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-app-md border border-app-primary bg-app-surface px-3 py-2 shadow-sm"
            >
              <p className="text-app-label font-semibold text-app-primary">
                ↓ تم عرض طلبات{" "}
                {selected ? `الطاولة ${selected.name}` : "الطاولات غير المتاحة"}{" "}
                أسفل شبكة الطاولات
              </p>
              <AppButton
                size="sm"
                variant="secondary"
                onClick={() => {
                  details.current?.scrollIntoView({
                    behavior: window.matchMedia(
                      "(prefers-reduced-motion: reduce)",
                    ).matches
                      ? "auto"
                      : "smooth",
                    block: "start",
                  });
                  details.current?.focus({ preventScroll: true });
                }}
              >
                الانتقال إلى الطلبات{" "}
                <span
                  aria-hidden="true"
                  className="inline-block motion-safe:animate-bounce"
                >
                  ↓
                </span>
              </AppButton>
            </div>
          ) : null}
          {warning ? (
            <div
              role="status"
              className="rounded-app-md bg-app-warning-soft p-3 text-app-warning"
            >
              {warning}{" "}
              <AppButton variant="secondary" onClick={() => void load()}>
                إعادة المحاولة
              </AppButton>
            </div>
          ) : null}
          {loading ? (
            <p role="status" className="text-app-helper text-app-muted">
              جارٍ تحميل سجل الطاولات…
            </p>
          ) : null}
          <AppSurface title="طاولات اليوم المحدد">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <AppInput
                aria-label="البحث عن طاولة"
                placeholder="ابحث برقم الطاولة أو اسمها أو المنطقة…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <AppBadge variant="neutral">{orders.length} طلب</AppBadge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {tables
                .filter((table) =>
                  `${table.name} ${table.area}`
                    .toLocaleLowerCase()
                    .includes(query.trim().toLocaleLowerCase()),
                )
                .map((table) => {
                  const tableOrders = orders.filter(
                    (order) => order.tableId === table.id,
                  );
                  const hasOrders = tableOrders.length > 0;
                  const isSelected = selectedId === table.id;
                  return (
                    <button
                      key={table.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => navigate(day, table.id)}
                      className={cn(
                        "flex min-h-44 flex-col rounded-app-lg border p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft",
                        hasOrders
                          ? "border-app-success bg-app-success-soft hover:border-app-success"
                          : "border-app-border bg-app-surface-muted hover:border-app-border-strong",
                        isSelected && "ring-2 ring-app-primary ring-offset-2",
                      )}
                    >
                      <div className="flex w-full items-start justify-between gap-2">
                        <div>
                          <h2
                            className={cn(
                              "text-2xl font-semibold",
                              hasOrders ? "text-app-ink" : "text-app-muted",
                            )}
                          >
                            {table.name}
                          </h2>
                          <p className="mt-1 text-app-helper text-app-muted">
                            {table.area}
                          </p>
                        </div>
                        <AppBadge variant={hasOrders ? "success" : "neutral"}>
                          {hasOrders
                            ? `${tableOrders.length} طلب`
                            : "بلا طلبات"}
                        </AppBadge>
                      </div>
                      <div className="my-3 flex-1">
                        <p
                          className={cn(
                            "text-app-label",
                            hasOrders
                              ? "font-semibold text-app-success"
                              : "text-app-muted",
                          )}
                        >
                          {hasOrders
                            ? "لها طلبات في هذا اليوم"
                            : "لا توجد طلبات في هذا اليوم"}
                        </p>
                        {tableOrders[0] ? (
                          <p className="mt-1 text-app-helper text-app-muted">
                            آخر طلب: {time(historyOrderTime(tableOrders[0]))}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "flex w-full items-center justify-between gap-2 border-t pt-2 text-app-label",
                          hasOrders
                            ? "border-app-success/20 font-semibold text-app-success"
                            : "border-app-border text-app-muted",
                        )}
                      >
                        <span>
                          {hasOrders ? "استعراض الطلبات" : "عرض التفاصيل"}
                        </span>
                        {isSelected ? (
                          <span className="font-semibold text-app-primary">
                            ✓ الطلبات بالأسفل ↓
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              {unavailable.length ? (
                <button
                  type="button"
                  aria-pressed={selectedId === "unavailable"}
                  onClick={() => navigate(day, "unavailable")}
                  className={cn(
                    "rounded-app-lg border border-app-success bg-app-success-soft p-4 text-start focus-visible:ring-4 focus-visible:ring-app-primary-soft",
                    selectedId === "unavailable" &&
                      "ring-2 ring-app-primary ring-offset-2",
                  )}
                >
                  <h2 className="font-semibold">طاولات غير متاحة حاليًا</h2>
                  <p className="mt-2">{unavailable.length} طلب</p>
                  <span className="mt-3 block text-app-primary">
                    استعراض الطلبات
                  </span>
                </button>
              ) : null}
            </div>
            {!tables.length && !unavailable.length && !loading ? (
              <AppEmptyState
                title={
                  warning ? "لا توجد بيانات محفوظة للعرض" : "لا توجد طاولات"
                }
                description={
                  warning
                    ? "اتصل بالإنترنت ثم أعد المحاولة."
                    : "ستظهر الطاولات المتاحة وطلباتها هنا."
                }
              />
            ) : null}
            {tables.length > 0 &&
            !tables.some((table) =>
              `${table.name} ${table.area}`
                .toLocaleLowerCase()
                .includes(query.trim().toLocaleLowerCase()),
            ) ? (
              <p className="mt-3 text-app-muted">لا توجد طاولة مطابقة للبحث.</p>
            ) : null}
          </AppSurface>
          <section
            ref={details}
            tabIndex={-1}
            className="scroll-mt-24 rounded-app-lg focus-visible:outline focus-visible:outline-app-primary"
            aria-label="طلبات الطاولة المحددة"
          >
            {selectedId ? (
              <AppSurface
                title={`${selected?.name ? `طاولة ${selected.name}` : "طاولات غير متاحة حاليًا"} · ${new Intl.DateTimeFormat("ar-SY", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}`}
              >
                {selectedOrders.length ? (
                  <div className="grid gap-3">
                    {selectedOrders.map((order) => (
                      <HistoryOrder
                        key={`${tenantId}-${order.id}`}
                        order={order}
                        table={selected}
                        restaurant={state.restaurant}
                        token={state.token}
                        tenantId={tenantId}
                        time={time(historyOrderTime(order))}
                      />
                    ))}
                  </div>
                ) : (
                  <AppEmptyState
                    title={
                      loading
                        ? "جارٍ تحميل الطلبات…"
                        : warning
                          ? "لا توجد طلبات محفوظة لهذه الطاولة"
                          : "لا توجد طلبات في هذا اليوم"
                    }
                    description={
                      warning
                        ? "قد لا تكون بيانات هذا الجهاز مكتملة؛ أعد المحاولة عند الاتصال."
                        : "اختر طاولة أخرى أو غيّر اليوم."
                    }
                  />
                )}
              </AppSurface>
            ) : (
              <p className="text-center text-app-muted">
                اختر طاولة لعرض طلباتها في اليوم المحدد.
              </p>
            )}
          </section>
        </div>
      )}
    </OpsShell>
  );
}

function HistoryOrder({
  order,
  table,
  restaurant,
  token,
  tenantId,
  time,
}: {
  order: OpsOrder;
  table?: OpsTable;
  restaurant: Restaurant | null;
  token: string;
  tenantId: string;
  time: string;
}) {
  const [open, setOpen] = useState(false);
  const [invoice, setInvoice] = useState<ReceiptInvoiceSnapshot>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canPrint = Boolean(order.invoiceId && order.status === "COMPLETED");
  const requestId = useRef(0);
  const loadInvoice = useCallback(async () => {
    if (!order.invoiceId || !canPrint) return;
    const id = ++requestId.current;
    setInvoice(undefined);
    setBusy(true);
    setError("");
    try {
      const cached = await offlineDb.invoices.get(order.invoiceId);
      let saved: ReceiptInvoiceSnapshot | undefined;
      if (cached?.restaurantId === tenantId && !cached.deletedAt)
        saved = cached;
      else if (navigator.onLine)
        saved = {
          ...(await adminRequest<ReceiptInvoiceSnapshot>(
            `/api/owner/ops/invoices/${encodeURIComponent(order.invoiceId)}`,
            token,
          )),
          syncStatus: "synced",
        };
      if (
        !saved ||
        saved.id !== order.invoiceId ||
        saved.orderId !== order.id ||
        saved.type !== "SALE" ||
        saved.status === "VOID"
      )
        throw new Error();
      if (id === requestId.current) setInvoice(saved);
    } catch {
      if (id === requestId.current)
        setError("تعذر تحميل الفاتورة المحفوظة. لا يمكن الطباعة قبل تحميلها.");
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }, [order.invoiceId, canPrint, tenantId, token]);
  useEffect(() => {
    if (open) void loadInvoice();
    return () => {
      requestId.current++;
    };
  }, [open, loadInvoice]);
  const source = invoice ?? order;
  return (
    <article
      className={cn(
        "rounded-app-md border bg-app-surface",
        open ? "border-app-primary" : "border-app-border",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`history-${order.id}`}
        onClick={() => setOpen(!open)}
        className="flex w-full flex-col gap-1 px-3 py-2 text-start focus-visible:ring-4 focus-visible:ring-app-primary-soft"
      >
        <span className="flex w-full flex-wrap items-center justify-between gap-2">
          <strong>طلب الساعة {time}</strong>
          <AppBadge
            variant={
              order.status === "CANCELLED"
                ? "danger"
                : order.status === "COMPLETED"
                  ? "success"
                  : "neutral"
            }
          >
            {option(order.status).label}
          </AppBadge>
        </span>
        <span className="text-app-helper text-app-muted">
          {order.items
            .map((item) => `${item.quantity} × ${item.name}`)
            .join("، ") || "لا توجد أصناف"}
        </span>
        <span className="flex w-full justify-between gap-2">
          <strong>{money(order.total, restaurant?.currency)}</strong>
          <span className="text-app-primary">
            {open ? "التفاصيل مفتوحة أدناه ↓ · إخفاء" : "عرض التفاصيل ↓"}
          </span>
        </span>
      </button>
      {open ? (
        <div
          id={`history-${order.id}`}
          className="grid items-start gap-4 border-t border-app-border p-4 lg:grid-cols-[minmax(0,1fr)_280px]"
        >
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full text-start text-app-body">
              <thead>
                <tr>
                  {["الصنف", "الكمية", "سعر الوحدة", "الإجمالي"].map(
                    (label) => (
                      <th
                        key={label}
                        className="px-3 py-2 text-start text-app-muted"
                      >
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {source.items.map((item, index) => (
                  <tr key={index} className="border-t border-app-border">
                    <td className="px-3 py-2">
                      {item.name}
                      {"notes" in item && item.notes ? (
                        <p className="text-app-helper text-app-muted">
                          {item.notes}
                        </p>
                      ) : null}
                      {"modifiers" in item && item.modifiers?.length ? (
                        <p className="text-app-helper text-app-muted">
                          {item.modifiers.join("، ")}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{item.quantity}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {money(item.unitPrice, restaurant?.currency)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {money(item.total, restaurant?.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside
            aria-label="ملخص مبالغ الطلب"
            className="grid gap-3 rounded-app-md border border-app-border bg-app-surface-muted p-4 lg:sticky lg:top-24"
          >
            {source.discount || source.tax || source.serviceCharge ? (
              <dl className="grid gap-2 border-b border-app-border pb-3 text-app-body text-app-muted">
                {(
                  [
                    ["قبل الخصم والرسوم", source.subTotal],
                    ["الخصم", source.discount],
                    ["الضريبة", source.tax],
                    ["رسوم الخدمة", source.serviceCharge],
                  ] as const
                )
                  .filter(([, amount]) => amount !== 0)
                  .map(([label, amount]) => (
                    <div key={label} className="flex justify-between gap-3">
                      <dt>{label}:</dt>
                      <dd>{money(amount, restaurant?.currency)}</dd>
                    </div>
                  ))}
              </dl>
            ) : null}
            <dl className="grid divide-y divide-app-border text-app-body">
              {(
                [
                  ["الإجمالي", source.total],
                  ["المدفوع", source.paidAmount],
                  ["المتبقي", Math.max(0, source.total - source.paidAmount)],
                ] as const
              ).map(([label, amount]) => (
                <div
                  key={label}
                  className="flex min-w-0 items-center justify-between gap-3 py-3"
                >
                  <dt className="text-app-muted">{label}</dt>
                  <dd
                    className={cn(
                      "break-words font-semibold",
                      label === "الإجمالي" && "text-lg",
                      label === "المتبقي" && amount > 0 && "text-app-danger",
                    )}
                  >
                    {money(amount, restaurant?.currency)}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-app-helper text-app-muted">
              طريقة الدفع: {paymentMethodLabel(source.paymentMethod)}
            </p>
            {order.notes ? <p>ملاحظات: {order.notes}</p> : null}
            {busy ? <p role="status">جارٍ تحميل الفاتورة…</p> : null}
            {error ? (
              <div role="status" className="text-app-danger">
                {error}{" "}
                <AppButton
                  variant="secondary"
                  onClick={() => void loadInvoice()}
                >
                  إعادة المحاولة
                </AppButton>
              </div>
            ) : null}
            {canPrint && invoice && !busy ? (
              <div className="flex justify-end">
                <OrderReceiptPrintButton
                  order={order}
                  restaurant={restaurant}
                  table={table}
                  token={token}
                  invoiceSnapshot={invoice}
                  requireInvoice
                />
              </div>
            ) : null}
            {!canPrint ? (
              <p className="text-app-helper text-app-muted">
                {order.status === "CANCELLED"
                  ? "طلب ملغى — للاستعراض فقط."
                  : "لا توجد فاتورة صادرة لهذا الطلب — للاستعراض فقط."}
              </p>
            ) : null}
          </aside>
        </div>
      ) : null}
    </article>
  );
}
