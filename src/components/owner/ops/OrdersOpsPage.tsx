"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import {
  AppBadge,
  AppButton,
  AppEmptyState,
  AppFieldShell,
  AppInput,
  AppSelect,
  AppSurface,
  AppTextarea,
  PopupForm,
  cn
} from "@/components/shared";
import { formatInteger } from "@/lib/format";
import { createActionGuard } from "@/offline/action-guard";
import { offlineDb } from "@/offline/db";
import { useLiveQuery } from "@/offline/hooks/useLiveQuery";
import { completeLocalOrder, createLocalOrder, cancelLocalOrder, hydrateOrders, listLocalOrders, updateLocalOrder, type OrderCreateInput } from "@/offline/repositories/orders";
import { hydrateReferenceData, listLocalCashRegisters, listLocalCategories, listLocalMenuItems, listLocalRecipeIngredients } from "@/offline/repositories/reference-data";
import { hydrateTables, listLocalTables, type OfflineContext } from "@/offline/repositories/tables";
import type { LocalCashMovement, LocalInvoice, LocalPayment } from "@/offline/schema";
import type { Category, MenuItem, Restaurant } from "@/types/menu";
import type { CashRegister, OpsOrder, OpsTable, OrderStatus, PaymentMethod, RecipeIngredient } from "@/types/ops";
import {
  money,
  orderStatusLabels,
  OpsShell,
  paymentAmountForMethod,
  useOpsPage
} from "./OpsShared";
import { OrderReceiptPrintButton } from "./OrderReceiptPrintButton";
import { option, orderStatuses, orderTypes, paymentMethods, run } from "./OpsPageShared";

type OrderCartLine = {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes: string;
  modifiers: string[];
};

type OrderForm = {
  tableId: string;
  type: string;
  source: string;
  name: string;
  orderedDate: string;
  orderedTime: string;
  discount: number;
  tax: number;
  serviceCharge: number;
  paymentMethod: string;
  notes: string;
};

type CompleteOrderConfirmation = {
  order: OpsOrder;
  paymentMethod: PaymentMethod;
  paidAmount: number;
  cashRegisterId: string;
  note: string;
};

type OrderDetailsSnapshot = {
  invoice: LocalInvoice | null;
  payment: LocalPayment | null;
  cashMovement: LocalCashMovement | null;
};

export function OrdersOpsPage() {
  const state = useOpsPage("orders");
  const [query, setQuery] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [activeItemCategoryId, setActiveItemCategoryId] = useState("all");
  const [status, setStatus] = useState("ALL");
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [form, setForm] = useState<OrderForm>(() => emptyOrderForm());
  const [orderNameTouched, setOrderNameTouched] = useState(false);
  const [cart, setCart] = useState<OrderCartLine[]>([]);
  const [complete, setComplete] = useState({ orderId: "", paymentMethod: "CASH", paidAmount: 0, cashRegisterId: "", note: "" });
  const [pendingCompleteOrder, setPendingCompleteOrder] = useState<CompleteOrderConfirmation | null>(null);
  const [detailsOrder, setDetailsOrder] = useState<OpsOrder | null>(null);
  const [orderActionBusyId, setOrderActionBusyId] = useState("");
  const [orderFormBusy, setOrderFormBusy] = useState(false);
  const orderFormGuard = useRef(createActionGuard());
  const orderActionGuard = useRef(createActionGuard());
  const tenantId = state.restaurant?.id ?? "";
  const offlineContext = useMemo<OfflineContext | null>(() => {
    if (!state.token || !tenantId) return null;
    return { token: state.token, tenantId, userId: state.restaurant?.ownerUserId ?? "owner" };
  }, [state.restaurant?.ownerUserId, state.token, tenantId]);
  const { value: orders } = useLiveQuery(() => tenantId ? listLocalOrders(tenantId) : Promise.resolve([]), [] as OpsOrder[], [tenantId]);
  const { value: items } = useLiveQuery(() => tenantId ? listLocalMenuItems(tenantId) : Promise.resolve([]), [] as MenuItem[], [tenantId]);
  const { value: categories } = useLiveQuery(() => tenantId ? listLocalCategories(tenantId) : Promise.resolve([]), [] as Category[], [tenantId]);
  const { value: tables } = useLiveQuery(() => tenantId ? listLocalTables(tenantId) : Promise.resolve([]), [] as OpsTable[], [tenantId]);
  const { value: recipes } = useLiveQuery(() => tenantId ? listLocalRecipeIngredients(tenantId) : Promise.resolve([]), [] as RecipeIngredient[], [tenantId]);
  const { value: cashRegisters } = useLiveQuery(() => tenantId ? listLocalCashRegisters(tenantId) : Promise.resolve([]), [] as CashRegister[], [tenantId]);
  const { value: detailsSnapshot } = useLiveQuery(() => loadOrderDetailsSnapshot(tenantId, detailsOrder), null as OrderDetailsSnapshot | null, [tenantId, detailsOrder?.id, detailsOrder?.invoiceId, detailsOrder?.paymentId]);

  useEffect(() => {
    if (offlineContext && state.modules?.orders) void load();
  }, [offlineContext, state.modules?.orders]);

  useEffect(() => {
    setComplete((current) => ({ ...current, cashRegisterId: current.cashRegisterId || cashRegisters[0]?.id || "" }));
  }, [cashRegisters]);

  async function load() {
    if (!offlineContext) return;
    await Promise.all([
      hydrateOrders(offlineContext),
      hydrateReferenceData(offlineContext, { inventory: state.modules?.inventory, accounting: state.modules?.accounting }),
      state.modules?.tables ? hydrateTables(offlineContext) : Promise.resolve()
    ]);
  }

  function openNewOrder() {
    setForm(emptyOrderForm());
    setOrderNameTouched(false);
    setCart([]);
    setItemQuery("");
    setActiveItemCategoryId("all");
    setOrderFormOpen(true);
  }

  function closeOrderForm() {
    setOrderFormOpen(false);
    setForm(emptyOrderForm());
    setOrderNameTouched(false);
    setCart([]);
    setItemQuery("");
    setActiveItemCategoryId("all");
  }

  function addItemToCart(item: MenuItem) {
    setCart((current) => {
      const existing = current.find((line) => line.menuItemId === item.id && !line.notes);
      if (existing) {
        return current.map((line) => (line === existing ? { ...line, quantity: line.quantity + 1 } : line));
      }

      return [
        ...current,
        {
          menuItemId: item.id,
          name: item.name,
          quantity: 1,
          unitPrice: item.price,
          notes: "",
          modifiers: []
        }
      ];
    });
  }

  function updateCartLine(index: number, patch: Partial<OrderCartLine>) {
    setCart((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch, quantity: Math.max(1, patch.quantity ?? line.quantity) } : line)));
  }

  function removeCartLine(index: number) {
    setCart((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  function updateOrderTable(tableId: string) {
    const tableName = tables.find((table) => table.id === tableId)?.name ?? "";
    setForm((current) => ({
      ...current,
      tableId,
      name: orderNameTouched ? current.name : defaultOrderName(tableName, current.orderedTime)
    }));
  }

  function updateOrderTime(orderedTime: string) {
    setForm((current) => ({
      ...current,
      orderedTime,
      name: orderNameTouched ? current.name : defaultOrderName(tables.find((table) => table.id === current.tableId)?.name ?? "", orderedTime)
    }));
  }

  function updateOrderName(name: string) {
    setOrderNameTouched(true);
    setForm((current) => ({ ...current, name }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cart.length) {
      state.setMessage("أضف صنفًا واحدًا على الأقل إلى الطلب.");
      return;
    }

    await runOrderFormAction(async () => {
      if (!offlineContext) throw new Error("تعذر تحديد المطعم الحالي.");
      await createLocalOrder(offlineContext, buildOrderCreateInput(form, cart));
      closeOrderForm();
    }, "تم إنشاء الطلب على الجهاز — بانتظار المزامنة");
  }

  async function changeOrderStatus(orderId: string, nextStatus: OrderStatus) {
    await runOrderAction(orderId, async () => {
      if (!offlineContext) throw new Error("تعذر تحديد المطعم الحالي.");
      await updateLocalOrder(offlineContext, orderId, { status: nextStatus });
    }, "تم تحديث حالة الطلب على الجهاز — بانتظار المزامنة");
  }

  async function completeOrderById(order: OpsOrder) {
    const paymentMethod = (order.paymentMethod || complete.paymentMethod) as PaymentMethod;
    const paidAmount = paymentAmountForMethod(paymentMethod, order.total, paymentMethod === "SPLIT" ? order.total : 0);
    setPendingCompleteOrder({
      order,
      paymentMethod,
      paidAmount,
      cashRegisterId: complete.cashRegisterId || cashRegisters[0]?.id || "",
      note: complete.note
    });
  }

  async function confirmCompleteOrder() {
    if (!pendingCompleteOrder) return;
    const { order, paymentMethod, paidAmount, cashRegisterId, note } = pendingCompleteOrder;
    if (paymentMethod === "SPLIT" && paidAmount <= 0) {
      state.setMessage("أدخل المبلغ المدفوع قبل إنهاء طلب الدفع المقسّم.");
      return;
    }

    await runOrderAction(order.id, async () => {
      if (!offlineContext) throw new Error("تعذر تحديد المطعم الحالي.");
      await completeLocalOrder(offlineContext, order.id, {
        paymentMethod,
        paidAmount,
        cashRegisterId: cashRegisterId || undefined,
        note
      });
      setComplete((current) => ({ ...current, orderId: "", paidAmount: 0, note: "" }));
      setPendingCompleteOrder(null);
    }, "تم إنهاء الطلب وحفظه على الجهاز — بانتظار المزامنة");
  }

  async function cancelOrder(orderId: string) {
    const reason = window.prompt("سبب الإلغاء") || "";
    if (!reason.trim()) return;
    await runOrderAction(orderId, async () => {
      if (!offlineContext) throw new Error("تعذر تحديد المطعم الحالي.");
      await cancelLocalOrder(offlineContext, orderId, reason);
    }, "تم إلغاء الطلب على الجهاز — بانتظار المزامنة");
  }

  async function runOrderAction(orderId: string, action: () => Promise<void>, successMessage?: string) {
    await orderActionGuard.current.run(async () => {
      setOrderActionBusyId(orderId);
      try {
        await run(state, action, successMessage);
      } finally {
        setOrderActionBusyId("");
      }
    });
  }

  async function runOrderFormAction(action: () => Promise<void>, successMessage?: string) {
    await orderFormGuard.current.run(async () => {
      setOrderFormBusy(true);
      try {
        await run(state, action, successMessage);
      } finally {
        setOrderFormBusy(false);
      }
    });
  }

  const openOrdersCount = orders.filter(isOpenOrder).length;
  const completedOrdersCount = orders.filter((order) => order.status === "COMPLETED").length;
  const normalizedOrderQuery = query.trim().toLowerCase();
  const filtered = orders
    .filter((order) => {
      const tableName = tableLabel(tables, order.tableId);
      const text = `${order.id} ${order.name} ${order.notes} ${tableName} ${order.type} ${order.items.map((item) => item.name).join(" ")}`.toLowerCase();
      return matchesOrderStatusFilter(order, status) && (!normalizedOrderQuery || text.includes(normalizedOrderQuery));
    })
    .sort(sortOrdersForCashier);

  const normalizedItemQuery = itemQuery.trim().toLowerCase();
  const filteredMenuItems = items.filter((item) => {
    const text = `${item.name} ${item.description}`.toLowerCase();
    return !normalizedItemQuery || text.includes(normalizedItemQuery);
  });

  const { categoryTabs, visibleMenuItems } = useMemo(() => {
    const sortedCategories = [...categories].sort((first, second) => first.order - second.order);
    const knownCategoryIds = new Set(sortedCategories.map((category) => category.id));
    const uncategorizedItems = filteredMenuItems.filter((item) => !knownCategoryIds.has(item.categoryId));
    const tabs = [
      { id: "all", name: "الكل", count: filteredMenuItems.length },
      ...sortedCategories
        .filter((category) => items.some((item) => item.categoryId === category.id))
        .map((category) => ({
          id: category.id,
          name: category.name,
          count: filteredMenuItems.filter((item) => item.categoryId === category.id).length
        })),
      ...(items.some((item) => !knownCategoryIds.has(item.categoryId)) ? [{ id: "uncategorized", name: "بدون قسم", count: uncategorizedItems.length }] : [])
    ];
    const visibleItems = filteredMenuItems
      .filter((item) => {
        if (activeItemCategoryId === "all") return true;
        if (activeItemCategoryId === "uncategorized") return !knownCategoryIds.has(item.categoryId);
        return item.categoryId === activeItemCategoryId;
      })
      .sort((first, second) => {
        const firstCategoryOrder = sortedCategories.find((category) => category.id === first.categoryId)?.order ?? Number.MAX_SAFE_INTEGER;
        const secondCategoryOrder = sortedCategories.find((category) => category.id === second.categoryId)?.order ?? Number.MAX_SAFE_INTEGER;
        return firstCategoryOrder - secondCategoryOrder || first.order - second.order;
      });

    return { categoryTabs: tabs, visibleMenuItems: visibleItems };
  }, [activeItemCategoryId, categories, filteredMenuItems, items]);

  useEffect(() => {
    if (!categoryTabs.some((tab) => tab.id === activeItemCategoryId)) {
      setActiveItemCategoryId("all");
    }
  }, [activeItemCategoryId, categoryTabs]);

  const cartSubTotal = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

  return (
    <OpsShell title="الطلبات" eyebrow="إدارة الطلبات" module="orders" state={state} onRefresh={() => void Promise.all([state.loadRestaurant(), load()])}>
      <AppSurface className="min-w-0 p-3 sm:p-4">
        <div className="grid min-w-0 gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-app-ink">الطلبات</h1>
              <AppBadge variant="neutral">{formatInteger(filtered.length)} ظاهر</AppBadge>
              <AppBadge variant="warning">{formatInteger(openOrdersCount)} مفتوح</AppBadge>
              <AppBadge variant="success">{formatInteger(completedOrdersCount)} مكتمل</AppBadge>
            </div>
          </div>
          <div className="grid min-w-0 gap-2 lg:grid-cols-[auto_minmax(260px,1fr)_auto] lg:items-center">
            <AppButton type="button" onClick={openNewOrder} iconStart={<Plus className="h-4 w-4" />} className="w-full lg:w-auto">
              إنشاء طلب
            </AppButton>
            <label className="relative min-w-0">
              <span className="sr-only">بحث</span>
              <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
              <AppInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث سريع..." className="pe-9" />
            </label>
            <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
              {cashierStatusTabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setStatus(tab.value)}
                  className={cn(
                    "h-9 shrink-0 rounded-app-md border px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft",
                    status === tab.value
                      ? "border-app-primary bg-app-primary text-app-primary-foreground"
                      : "border-app-border bg-app-surface text-app-muted hover:bg-app-surface-muted hover:text-app-ink"
                  )}
                >
                  {tab.label}
                </button>
              ))}
              <AppSelect value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 w-[168px] shrink-0 text-xs">
                {statusFilterOptions.map((entry) => (
                  <option key={entry} value={entry}>
                    {orderFilterLabel(entry)}
                  </option>
                ))}
              </AppSelect>
            </div>
          </div>
        </div>
        <div className="mt-3 min-w-0">
          {filtered.length ? (
            <OrdersList
              orders={filtered}
              tables={tables}
              currency={state.restaurant?.currency}
              token={state.token}
              restaurant={state.restaurant}
              busyId={orderActionBusyId}
              onStatusChange={changeOrderStatus}
              onComplete={completeOrderById}
              onDetails={setDetailsOrder}
              onCancel={cancelOrder}
            />
          ) : (
            <AppEmptyState title="لا توجد طلبات" description="غيّر البحث أو أنشئ طلبًا جديدًا." action={<AppButton type="button" onClick={openNewOrder}>إنشاء طلب</AppButton>} />
          )}
        </div>
      </AppSurface>

      <PopupForm open={orderFormOpen} onClose={closeOrderForm} title="إنشاء طلب" description="اختر الطاولة والوقت، ثم أضف الأصناف حسب الأقسام." maxWidth="xl">
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <AppFieldShell label="اسم الطلب">
              <AppInput value={form.name} onChange={(event) => updateOrderName(event.target.value)} />
            </AppFieldShell>
            <AppFieldShell label="الطاولة">
              <AppSelect value={form.tableId} onChange={(event) => updateOrderTable(event.target.value)}>
                <option value="">بدون طاولة</option>
                {tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
              </AppSelect>
            </AppFieldShell>
            <AppFieldShell label="نوع الطلب">
              <AppSelect value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
                {orderTypes.map((type) => <option key={type} value={type}>{option(type).label}</option>)}
              </AppSelect>
            </AppFieldShell>
            <AppFieldShell label="التاريخ">
              <AppInput type="date" value={form.orderedDate} onChange={(event) => setForm({ ...form, orderedDate: event.target.value })} />
            </AppFieldShell>
            <AppFieldShell label="الوقت">
              <AppInput type="time" value={form.orderedTime} onChange={(event) => updateOrderTime(event.target.value)} />
            </AppFieldShell>
          </div>

          <div className="rounded-app-lg border border-app-border bg-app-surface-muted p-3">
            <AppFieldShell label="بحث عن صنف">
              <AppInput value={itemQuery} onChange={(event) => setItemQuery(event.target.value)} placeholder="ابحث عن صنف..." />
            </AppFieldShell>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
              {categoryTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveItemCategoryId(tab.id)}
                  className={cn(
                    "shrink-0 rounded-app-md border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft",
                    activeItemCategoryId === tab.id
                      ? "border-app-primary bg-app-primary-soft text-app-primary"
                      : "border-app-border bg-app-surface text-app-muted hover:border-app-border-strong hover:bg-app-surface-muted hover:text-app-ink"
                  )}
                >
                  {tab.name} ({formatInteger(tab.count)})
                </button>
              ))}
            </div>
            <div className="mt-3 max-h-[340px] overflow-y-auto pe-1">
              {items.length ? (
                visibleMenuItems.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {visibleMenuItems.map((item) => {
                      const hasRecipe = recipes.some((entry) => entry.menuItemId === item.id);

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => addItemToCart(item)}
                          className="min-h-16 rounded-app-md border border-app-border bg-app-surface p-2 text-start transition-colors hover:border-app-primary hover:bg-app-primary-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft"
                        >
                          <span className="block truncate text-sm font-semibold text-app-ink">{item.name}</span>
                          <span className="mt-1 block text-app-helper text-app-muted">{money(item.price, state.restaurant?.currency)}</span>
                          {state.modules?.inventory && !hasRecipe ? (
                            <span className="mt-1 block text-[11px] font-semibold text-app-warning">لا توجد مكونات مخزون مرتبطة</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <AppEmptyState title="لا توجد نتائج مطابقة" description="جرّب البحث باسم صنف آخر." />
                )
              ) : (
                <AppEmptyState title="لا توجد أصناف" description="أضف أصنافًا إلى المنيو قبل إنشاء الطلب." />
              )}
            </div>
          </div>

          <div className="rounded-app-lg border border-app-border bg-app-surface">
            <div className="flex items-center justify-between border-b border-app-border p-3">
              <p className="text-sm font-semibold text-app-ink">بنود الطلب</p>
              <p className="text-app-meta text-app-muted">{formatInteger(cart.length)} صنف</p>
            </div>
            <div className="grid gap-2 p-3">
              {cart.length ? (
                cart.map((line, index) => (
                  <div key={`${line.menuItemId}-${index}`} className="grid gap-2 rounded-app-md bg-app-surface-muted p-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-app-ink">{line.name}</p>
                        <p className="text-app-helper text-app-muted">{money(line.unitPrice * line.quantity, state.restaurant?.currency)}</p>
                        {state.modules?.inventory && !recipes.some((entry) => entry.menuItemId === line.menuItemId) ? (
                          <p className="mt-1 text-app-helper font-semibold text-app-warning">لا توجد مكونات مخزون مرتبطة بهذا الصنف.</p>
                        ) : null}
                      </div>
                      <AppButton type="button" variant="ghost" size="sm" onClick={() => removeCartLine(index)} className="text-app-danger hover:bg-app-danger-soft">حذف</AppButton>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[100px_1fr]">
                      <AppFieldShell label="الكمية">
                        <AppInput type="number" min="1" value={line.quantity} onChange={(event) => updateCartLine(index, { quantity: Number(event.target.value) })} />
                      </AppFieldShell>
                      <AppFieldShell label="ملاحظة">
                        <AppInput value={line.notes} onChange={(event) => updateCartLine(index, { notes: event.target.value })} />
                      </AppFieldShell>
                    </div>
                  </div>
                ))
              ) : (
                <AppEmptyState title="السلة فارغة" description="أضف صنفًا أو أكثر قبل إنشاء الطلب." />
              )}
            </div>
            <div className="border-t border-app-border p-3 text-sm font-semibold text-app-ink">
              الإجمالي قبل الرسوم: {money(cartSubTotal, state.restaurant?.currency)}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <AppFieldShell label="خصم">
              <AppInput type="number" min="0" value={form.discount} onChange={(event) => setForm({ ...form, discount: Number(event.target.value) })} />
            </AppFieldShell>
            <AppFieldShell label="ضريبة">
              <AppInput type="number" min="0" value={form.tax} onChange={(event) => setForm({ ...form, tax: Number(event.target.value) })} />
            </AppFieldShell>
            <AppFieldShell label="خدمة">
              <AppInput type="number" min="0" value={form.serviceCharge} onChange={(event) => setForm({ ...form, serviceCharge: Number(event.target.value) })} />
            </AppFieldShell>
          </div>
          <AppFieldShell label="طريقة الدفع">
            <AppSelect value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}>
              {paymentMethods.map((method) => <option key={method} value={method}>{option(method).label}</option>)}
            </AppSelect>
          </AppFieldShell>
          <AppFieldShell label="ملاحظات الطلب">
            <AppTextarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </AppFieldShell>
          <AppButton type="submit" loading={orderFormBusy} disabled={!cart.length || orderFormBusy}>إنشاء الطلب</AppButton>
        </form>
      </PopupForm>

      <PopupForm
        open={Boolean(pendingCompleteOrder)}
        onClose={() => setPendingCompleteOrder(null)}
        title="إنهاء الطلب"
        description={pendingCompleteOrder ? `${cashierOrderLabel(pendingCompleteOrder.order, tables.find((table) => table.id === pendingCompleteOrder.order.tableId) ?? null)} · ${money(pendingCompleteOrder.order.total, state.restaurant?.currency)}` : undefined}
        maxWidth="sm"
      >
        {pendingCompleteOrder ? (
          <div className="grid gap-4">
            <div className="rounded-app-md border border-app-border bg-app-surface-muted p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-app-muted">الإجمالي</span>
                <strong className="text-lg text-app-ink">{money(pendingCompleteOrder.order.total, state.restaurant?.currency)}</strong>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <AppFieldShell label="طريقة الدفع">
                <AppSelect
                  value={pendingCompleteOrder.paymentMethod}
                  onChange={(event) => {
                    const paymentMethod = event.target.value as PaymentMethod;
                    setPendingCompleteOrder((current) => current ? {
                      ...current,
                      paymentMethod,
                      paidAmount: paymentAmountForMethod(paymentMethod, current.order.total, current.paidAmount)
                    } : current);
                    setComplete((current) => ({ ...current, paymentMethod }));
                  }}
                >
                  {paymentMethods.map((method) => <option key={method} value={method}>{option(method).label}</option>)}
                </AppSelect>
              </AppFieldShell>
              <AppFieldShell label="المدفوع">
                <AppInput
                  type="number"
                  min="0"
                  value={pendingCompleteOrder.paidAmount}
                  onChange={(event) => setPendingCompleteOrder((current) => current ? { ...current, paidAmount: Number(event.target.value) } : current)}
                />
              </AppFieldShell>
            </div>
            {cashRegisters.length ? (
              <AppFieldShell label="الصندوق">
                <AppSelect
                  value={pendingCompleteOrder.cashRegisterId}
                  onChange={(event) => {
                    setPendingCompleteOrder((current) => current ? { ...current, cashRegisterId: event.target.value } : current);
                    setComplete((current) => ({ ...current, cashRegisterId: event.target.value }));
                  }}
                >
                  <option value="">بدون صندوق</option>
                  {cashRegisters.map((register) => (
                    <option key={register.id} value={register.id}>
                      {register.name} - {money(register.currentBalance, state.restaurant?.currency)}
                    </option>
                  ))}
                </AppSelect>
              </AppFieldShell>
            ) : null}
            <AppFieldShell label="ملاحظة الدفع">
              <AppInput
                value={pendingCompleteOrder.note}
                onChange={(event) => {
                  setPendingCompleteOrder((current) => current ? { ...current, note: event.target.value } : current);
                  setComplete((current) => ({ ...current, note: event.target.value }));
                }}
              />
            </AppFieldShell>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <AppButton type="button" variant="secondary" onClick={() => setPendingCompleteOrder(null)} disabled={Boolean(orderActionBusyId)} className="w-full sm:w-auto">
                إلغاء
              </AppButton>
              <AppButton
                type="button"
                data-autofocus
                onClick={() => void confirmCompleteOrder()}
                loading={orderActionBusyId === pendingCompleteOrder.order.id}
                disabled={Boolean(orderActionBusyId)}
                className="w-full sm:w-auto"
              >
                تأكيد الإنهاء
              </AppButton>
            </div>
          </div>
        ) : null}
      </PopupForm>

      <OrderDetailsDialog
        order={detailsOrder}
        table={detailsOrder ? tables.find((table) => table.id === detailsOrder.tableId) ?? null : null}
        snapshot={detailsSnapshot}
        cashRegisters={cashRegisters}
        restaurant={state.restaurant}
        token={state.token}
        onClose={() => setDetailsOrder(null)}
      />
    </OpsShell>
  );
}

function OrdersList({
  orders,
  tables,
  currency,
  token,
  restaurant,
  busyId,
  onStatusChange,
  onComplete,
  onDetails,
  onCancel
}: {
  orders: OpsOrder[];
  tables: OpsTable[];
  currency?: string;
  token: string;
  restaurant: Restaurant | null;
  busyId: string;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
  onComplete: (order: OpsOrder) => void;
  onDetails: (order: OpsOrder) => void;
  onCancel: (orderId: string) => void;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-app-lg border border-app-border bg-app-surface md:block">
        <table className="w-full min-w-[920px] table-fixed text-app-table">
          <thead className="bg-app-surface-muted text-app-meta text-app-muted">
            <tr className="[&>th]:border-b [&>th]:border-app-border [&>th]:px-3 [&>th]:py-2 [&>th]:text-start [&>th]:font-semibold">
              <th className="w-[260px]">الطلب</th>
              <th className="w-40">الطاولة / النوع</th>
              <th className="w-28 whitespace-nowrap">الوقت</th>
              <th className="w-32 whitespace-nowrap">الإجمالي</th>
              <th className="w-28 whitespace-nowrap">الحالة</th>
              <th className="w-[280px]">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-border">
            {orders.map((order) => {
              const table = tables.find((entry) => entry.id === order.tableId) ?? null;
              const closed = !isOpenOrder(order);

              return (
                <tr key={order.id} className={cn("align-middle transition-colors hover:bg-app-surface-muted", closed && "bg-app-surface/60 text-app-muted")}>
                  <td className="min-w-0 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className={cn("truncate font-semibold", closed ? "text-app-muted" : "text-app-ink")} title={cashierOrderLabel(order, table)}>
                        {cashierOrderLabel(order, table)}
                      </p>
                      {order.invoiceId ? <AppBadge variant="success">فاتورة</AppBadge> : null}
                    </div>
                    <p className="mt-1 truncate text-app-helper text-app-muted">{compactItemsSummary(order)}</p>
                  </td>
                  <td className="px-3 py-2.5 text-app-muted">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-app-ink" title={tableLabel(tables, order.tableId)}>{tableLabel(tables, order.tableId)}</p>
                      <p className="mt-0.5 truncate text-app-helper text-app-muted">{orderTypeLabel(order.type)}</p>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-app-muted">{formatOrderTimeCompact(order.orderedAt || order.createdAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-app-ink">{money(order.total, currency)}</td>
                  <td className="px-3 py-2.5"><OrderStatusBadge status={order.status} /></td>
                  <td className="px-3 py-2.5">
                    <OrderRowActions
                      order={order}
                      table={table}
                      restaurant={restaurant}
                      token={token}
                      busy={busyId === order.id}
                      onStatusChange={onStatusChange}
                      onComplete={onComplete}
                      onDetails={onDetails}
                      onCancel={onCancel}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 md:hidden">
        {orders.map((order) => {
          const table = tables.find((entry) => entry.id === order.tableId) ?? null;
          const closed = !isOpenOrder(order);

          return (
            <article key={order.id} className={cn("min-w-0 rounded-app-lg border border-app-border bg-app-surface p-3", closed && "bg-app-surface/70")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-semibold text-app-ink" title={cashierOrderLabel(order, table)}>{cashierOrderLabel(order, table)}</p>
                    {order.invoiceId ? <AppBadge variant="success">فاتورة</AppBadge> : null}
                  </div>
                  <p className="mt-1 truncate text-app-meta text-app-muted">{tableLabel(tables, order.tableId)} · {orderTypeLabel(order.type)} · {formatOrderTimeCompact(order.orderedAt || order.createdAt)}</p>
                </div>
                <OrderStatusBadge status={order.status} />
              </div>
              <p className="mt-2 line-clamp-2 text-app-helper text-app-muted">{compactItemsSummary(order)}</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="font-semibold text-app-ink">{money(order.total, currency)}</p>
                <OrderRowActions
                  order={order}
                  table={table}
                  restaurant={restaurant}
                  token={token}
                  busy={busyId === order.id}
                  onStatusChange={onStatusChange}
                  onComplete={onComplete}
                  onDetails={onDetails}
                  onCancel={onCancel}
                />
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function OrderRowActions({
  order,
  table,
  restaurant,
  token,
  busy,
  onStatusChange,
  onComplete,
  onDetails,
  onCancel
}: {
  order: OpsOrder;
  table: OpsTable | null;
  restaurant: Restaurant | null;
  token: string;
  busy: boolean;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
  onComplete: (order: OpsOrder) => void;
  onDetails: (order: OpsOrder) => void;
  onCancel: (orderId: string) => void;
}) {
  const closed = !isOpenOrder(order);
  const canPrint = order.items.length > 0 && (isOpenOrder(order) || order.status === "COMPLETED" || Boolean(order.invoiceId));

  return (
    <div className="flex max-w-[280px] flex-wrap items-center gap-1.5">
      <OrderPrimaryAction order={order} table={table} onDetails={onDetails} />
      {!closed ? (
        <>
          <AppButton type="button" size="sm" disabled={busy} onClick={() => onComplete(order)}>
            إنهاء
          </AppButton>
        </>
      ) : null}
      {canPrint ? <OrderReceiptPrintButton order={order} restaurant={restaurant} table={table} token={token} /> : null}
      <details className="relative">
        <summary
          aria-label="المزيد"
          title="المزيد"
          className="inline-flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-app-md border border-app-border bg-app-surface text-app-ink transition-colors hover:bg-app-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft sm:h-9 sm:w-9 [&::-webkit-details-marker]:hidden"
        >
          <MoreHorizontal className="h-4 w-4" />
        </summary>
        <div className="absolute left-0 z-20 mt-2 grid w-56 gap-2 rounded-app-md border border-app-border bg-app-surface p-2 text-start shadow-lg">
          {!closed ? (
            <>
              <AppFieldShell label="تغيير الحالة" className="text-xs">
                <AppSelect
                  aria-label="تغيير حالة الطلب"
                  value={orderWorkflowStatuses.includes(order.status) ? order.status : ""}
                  disabled={busy}
                  onChange={(event) => {
                    if (event.target.value) onStatusChange(order.id, event.target.value as OrderStatus);
                  }}
                  className="h-9 text-xs"
                >
                  <option value="">حالة الطلب</option>
                  {orderWorkflowStatuses.map((status) => (
                    <option key={status} value={status} disabled={order.status === status}>
                      {orderStatusLabels[status]}
                    </option>
                  ))}
                </AppSelect>
              </AppFieldShell>
              <AppButton type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onCancel(order.id)} className="justify-start text-app-danger hover:bg-app-danger-soft">
                إلغاء الطلب
              </AppButton>
            </>
          ) : (
            <p className="px-2 py-1 text-app-helper text-app-muted">لا توجد إجراءات إضافية.</p>
          )}
        </div>
      </details>
    </div>
  );
}

function OrderPrimaryAction({ order, table, onDetails }: { order: OpsOrder; table: OpsTable | null; onDetails: (order: OpsOrder) => void }) {
  if (!isOpenOrder(order)) {
    return (
      <AppButton type="button" variant="secondary" size="sm" onClick={() => onDetails(order)}>
        تفاصيل
      </AppButton>
    );
  }

  if (!table || order.type !== "DINE_IN") {
    return (
      <AppButton type="button" variant="secondary" size="sm" disabled>
        فتح
      </AppButton>
    );
  }

  return (
    <Link
      href={`/owner/operations/tables/${table.id}`}
      className="inline-flex h-10 shrink-0 items-center justify-center rounded-app-md border border-app-border bg-app-surface px-3 text-xs font-semibold text-app-ink transition-colors hover:border-app-border-strong hover:bg-app-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft sm:h-9"
    >
      فتح
    </Link>
  );
}

function OrderDetailsDialog({
  order,
  table,
  snapshot,
  cashRegisters,
  restaurant,
  token,
  onClose
}: {
  order: OpsOrder | null;
  table: OpsTable | null;
  snapshot: OrderDetailsSnapshot | null;
  cashRegisters: CashRegister[];
  restaurant: Restaurant | null;
  token: string;
  onClose: () => void;
}) {
  if (!order) {
    return null;
  }

  const invoice = snapshot?.invoice ?? null;
  const payment = snapshot?.payment ?? null;
  const cashMovement = snapshot?.cashMovement ?? null;
  const lines = orderDetailsLines(order, invoice);
  const subTotal = numberValue(invoice?.subTotal, order.subTotal);
  const discount = numberValue(invoice?.discount, order.discount);
  const tax = numberValue(invoice?.tax, order.tax);
  const serviceCharge = numberValue(invoice?.serviceCharge, order.serviceCharge);
  const total = numberValue(invoice?.total, order.total);
  const paidAmount = numberValue(invoice?.paidAmount ?? payment?.amount, order.paidAmount);
  const remainingAmount = numberValue(invoice?.remainingAmount, Math.max(total - paidAmount, 0));
  const paymentMethod = invoice?.paymentMethod ?? payment?.method ?? order.paymentMethod;
  const cashRegister = cashMovement ? cashRegisters.find((register) => register.id === cashMovement.cashRegisterId) ?? null : null;
  const detailNote = invoice?.notes || payment?.note || order.notes;
  const completedAt = invoice?.updatedAt || payment?.paidAt || order.completedAt || order.updatedAt;

  return (
    <PopupForm
      open
      onClose={onClose}
      title={`تفاصيل ${cashierOrderLabel(order, table)}`}
      description={`${table?.name ?? "بدون طاولة"} · ${orderStatusLabels[order.status]} · ${formatOrderDateTimeCompact(order.orderedAt || order.createdAt)}`}
      maxWidth="wide"
    >
      <div className="grid max-h-[78vh] gap-4 overflow-y-auto pe-1">
        <div className="grid gap-2 rounded-app-lg border border-app-border bg-app-surface-muted p-3 text-sm sm:grid-cols-4">
          <DetailValue label="الطاولة" value={table?.name ?? "بدون طاولة"} />
          <DetailValue label="النوع" value={orderTypeLabel(order.type)} />
          <DetailValue label="الحالة" value={orderStatusLabels[order.status]} />
          <DetailValue label="الإكمال" value={formatOrderDateTimeCompact(completedAt)} />
        </div>

        <div className="overflow-hidden rounded-app-lg border border-app-border bg-app-surface">
          <div className="grid grid-cols-[minmax(0,1fr)_64px_96px_104px] gap-2 border-b border-app-border bg-app-surface-muted px-3 py-2 text-app-meta font-bold text-app-muted">
            <span>الصنف</span>
            <span className="text-center">الكمية</span>
            <span className="text-end">السعر</span>
            <span className="text-end">الإجمالي</span>
          </div>
          <div className="divide-y divide-app-border">
            {lines.length ? (
              lines.map((line) => (
                <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_64px_96px_104px] gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-app-ink" title={line.name}>{line.name}</p>
                    {line.notes ? <p className="mt-1 line-clamp-2 text-app-helper text-app-muted">{line.notes}</p> : null}
                  </div>
                  <span className="text-center font-semibold text-app-ink">{formatInteger(line.quantity)}</span>
                  <span className="text-end text-app-muted">{money(line.unitPrice, restaurant?.currency)}</span>
                  <span className="text-end font-semibold text-app-ink">{money(line.total, restaurant?.currency)}</span>
                </div>
              ))
            ) : (
              <div className="px-3 py-6 text-center text-sm text-app-muted">لا توجد أصناف محفوظة لهذا الطلب.</div>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid content-start gap-2 rounded-app-lg border border-app-border bg-app-surface p-3">
            {order.notes ? <DetailRow label="ملاحظة الطلب" value={order.notes} /> : null}
            {detailNote && detailNote !== order.notes ? <DetailRow label="ملاحظة الدفع" value={detailNote} /> : null}
            {invoice ? <DetailRow label="الفاتورة" value={compactReferenceNo(invoice.id)} /> : null}
            {payment ? <DetailRow label="الدفع" value={`${option(payment.method).label} · ${formatOrderDateTimeCompact(payment.paidAt || payment.createdAt)}`} /> : null}
            {cashRegister ? <DetailRow label="الصندوق" value={cashRegister.name} /> : null}
          </div>

          <div className="grid gap-2 rounded-app-lg border border-app-border bg-app-surface p-3">
            <DetailTotal label="المجموع الفرعي" value={subTotal} currency={restaurant?.currency} />
            {discount ? <DetailTotal label="الخصم" value={discount} currency={restaurant?.currency} /> : null}
            {tax ? <DetailTotal label="الضريبة" value={tax} currency={restaurant?.currency} /> : null}
            {serviceCharge ? <DetailTotal label="الخدمة" value={serviceCharge} currency={restaurant?.currency} /> : null}
            <div className="my-1 border-t border-app-border" />
            <DetailTotal label="الإجمالي" value={total} currency={restaurant?.currency} strong />
            <DetailRow label="طريقة الدفع" value={option(paymentMethod).label} />
            <DetailTotal label="المدفوع" value={paidAmount} currency={restaurant?.currency} />
            {remainingAmount > 0 ? <DetailTotal label="المتبقي" value={remainingAmount} currency={restaurant?.currency} /> : null}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AppButton type="button" variant="secondary" onClick={onClose} className="w-full sm:w-auto">
            إغلاق
          </AppButton>
          {order.items.length ? <OrderReceiptPrintButton order={order} restaurant={restaurant} table={table} token={token} /> : null}
        </div>
      </div>
    </PopupForm>
  );
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-app-helper font-semibold text-app-muted">{label}</p>
      <p className="mt-1 truncate font-semibold text-app-ink" title={value}>{value || "-"}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="shrink-0 font-semibold text-app-muted">{label}</span>
      <span className="min-w-0 whitespace-pre-wrap text-end font-semibold text-app-ink">{value || "-"}</span>
    </div>
  );
}

function DetailTotal({ label, value, currency, strong = false }: { label: string; value: number; currency?: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className={cn("font-semibold", strong ? "text-app-ink" : "text-app-muted")}>{label}</span>
      <span className={cn("font-semibold", strong ? "text-base text-app-ink" : "text-app-ink")}>{money(value, currency)}</span>
    </div>
  );
}

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <AppBadge variant={orderStatusVariant(status)}>{orderStatusLabels[status]}</AppBadge>;
}

function orderStatusVariant(status: OrderStatus): "neutral" | "primary" | "success" | "warning" | "danger" {
  if (status === "COMPLETED" || status === "SERVED") return "success";
  if (status === "CANCELLED") return "danger";
  if (status === "PENDING" || status === "DRAFT") return "warning";
  if (status === "CONFIRMED" || status === "PREPARING" || status === "READY") return "primary";
  return "neutral";
}

const orderWorkflowStatuses: OrderStatus[] = ["PENDING", "CONFIRMED", "PREPARING", "READY", "SERVED"];
const cashierStatusTabs = [
  { value: "OPEN", label: "مفتوح" },
  { value: "COMPLETED", label: "مكتمل" }
];
const statusFilterOptions = Array.from(new Set(["ALL", "OPEN", "COMPLETED", ...orderStatuses]));

function isOpenOrder(order: OpsOrder) {
  return order.status !== "COMPLETED" && order.status !== "CANCELLED" && !order.invoiceId;
}

function matchesOrderStatusFilter(order: OpsOrder, filter: string) {
  if (filter === "ALL") return true;
  if (filter === "OPEN") return isOpenOrder(order);
  return order.status === filter;
}

function sortOrdersForCashier(first: OpsOrder, second: OpsOrder) {
  const firstOpen = isOpenOrder(first);
  const secondOpen = isOpenOrder(second);
  if (firstOpen !== secondOpen) return firstOpen ? -1 : 1;
  return orderTimestamp(second) - orderTimestamp(first);
}

function orderTimestamp(order: OpsOrder) {
  const parsed = new Date(order.orderedAt || order.createdAt || 0);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

async function loadOrderDetailsSnapshot(tenantId: string, order: OpsOrder | null): Promise<OrderDetailsSnapshot | null> {
  if (!tenantId || !order) return null;
  const [invoice, payment, cashMovement] = await Promise.all([
    loadLocalOrderInvoice(tenantId, order),
    loadLocalOrderPayment(tenantId, order),
    loadLocalOrderCashMovement(tenantId, order)
  ]);
  return { invoice, payment, cashMovement };
}

async function loadLocalOrderInvoice(tenantId: string, order: OpsOrder) {
  if (order.invoiceId) {
    const invoice = await offlineDb.invoices.get(order.invoiceId);
    if (invoice && invoice.restaurantId === tenantId && !invoice.deletedAt) return invoice;
  }
  const invoices = await offlineDb.invoices.where("orderId").equals(order.id).toArray();
  return invoices.find((invoice) => invoice.restaurantId === tenantId && !invoice.deletedAt) ?? null;
}

async function loadLocalOrderPayment(tenantId: string, order: OpsOrder) {
  if (order.paymentId) {
    const payment = await offlineDb.payments.get(order.paymentId);
    if (payment && payment.restaurantId === tenantId && !payment.deletedAt) return payment;
  }
  const payments = await offlineDb.payments.where("orderId").equals(order.id).toArray();
  return payments.find((payment) => payment.restaurantId === tenantId && !payment.deletedAt) ?? null;
}

async function loadLocalOrderCashMovement(tenantId: string, order: OpsOrder) {
  const movements = await offlineDb.cashMovements.where("referenceId").equals(order.id).toArray();
  return movements.find((movement) => movement.restaurantId === tenantId && !movement.deletedAt && movement.referenceType === "ORDER") ?? null;
}

function tableLabel(tables: OpsTable[], tableId: string) {
  if (!tableId) return "بدون طاولة";
  return tables.find((table) => table.id === tableId)?.name ?? tableId;
}

function orderFilterLabel(status: string) {
  if (status === "ALL") return "كل الحالات";
  if (status === "OPEN") return "الطلبات المفتوحة";
  return orderStatusLabels[status as OrderStatus];
}

function cashierOrderLabel(order: OpsOrder, table: OpsTable | null) {
  const name = order.name?.trim();
  if (name && !looksInternalOrderId(name)) return name.length > 34 ? `${name.slice(0, 31)}...` : name;

  const time = formatOrderTimeOnly(order.orderedAt || order.createdAt);
  if (table?.name) return time ? `${table.name} · ${time}` : table.name;
  return time ? `طلب · ${time}` : "طلب";
}

function looksInternalOrderId(value: string) {
  return /^order[_-]/i.test(value) || value.length > 42;
}

function compactItemsSummary(order: OpsOrder) {
  if (!order.items.length) return "بدون أصناف";
  const items = order.items.slice(0, 3).map((item) => `${item.name} x${formatInteger(item.quantity)}`);
  const remaining = order.items.length - items.length;
  return remaining > 0 ? `${items.join("، ")} +${formatInteger(remaining)}` : items.join("، ");
}

function orderTypeLabel(type: string) {
  return option(type).label;
}

function orderDetailsLines(order: OpsOrder, invoice: LocalInvoice | null) {
  if (invoice?.items.length) {
    return invoice.items.map((item, index) => {
      const orderLine = order.items.find((line) => line.menuItemId === item.itemId) ?? order.items.find((line) => line.name === item.name);
      return {
        id: `${item.itemId || item.name}-${index}`,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
        notes: orderLine?.notes ?? ""
      };
    });
  }

  return order.items.map((item, index) => ({
    id: `${item.menuItemId || item.name}-${index}`,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: item.total,
    notes: item.notes
  }));
}

function compactReferenceNo(value: string) {
  const trimmed = String(value || "").trim();
  const withoutOrderPrefix = trimmed.replace(/^order[_-]?/i, "");
  return (withoutOrderPrefix || trimmed || "-").slice(0, 8);
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function emptyOrderForm(): OrderForm {
  const { date, time } = localDateTimeParts();
  return {
    tableId: "",
    type: "DINE_IN",
    source: "POS",
    name: defaultOrderName("", time),
    orderedDate: date,
    orderedTime: time,
    discount: 0,
    tax: 0,
    serviceCharge: 0,
    paymentMethod: "CASH",
    notes: ""
  };
}

function defaultOrderName(tableName: string, time: string) {
  return `${`الطاولة: ${tableName}` || "طلب"} - ${time || localDateTimeParts().time}`;
}

function localDateTimeParts(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return { date: `${year}-${month}-${day}`, time: `${hours}:${minutes}` };
}

function combineLocalDateTime(date: string, time: string) {
  const fallback = new Date();
  const localDate = date || localDateTimeParts(fallback).date;
  const localTime = time || "00:00";
  const parsed = new Date(`${localDate}T${localTime}`);
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString();
}

function buildOrderCreateInput(form: OrderForm, cart: OrderCartLine[]): OrderCreateInput {
  return {
    name: form.name,
    tableId: form.tableId,
    type: form.type as OrderCreateInput["type"],
    source: form.source as OrderCreateInput["source"],
    orderedAt: combineLocalDateTime(form.orderedDate, form.orderedTime),
    items: cart.map((line) => ({
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      notes: line.notes,
      modifiers: line.modifiers
    })),
    discount: form.discount,
    tax: form.tax,
    serviceCharge: form.serviceCharge,
    paymentMethod: form.paymentMethod as PaymentMethod,
    notes: form.notes
  };
}

function formatOrderTimeCompact(value: string | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const time = parsed.toLocaleTimeString("ar-SY-u-nu-latn", { hour: "2-digit", minute: "2-digit" });
  const now = new Date();
  const isToday = parsed.getFullYear() === now.getFullYear() && parsed.getMonth() === now.getMonth() && parsed.getDate() === now.getDate();
  if (isToday) return time;
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  return `${day}/${month} • ${time}`;
}

function formatOrderDateTimeCompact(value: string | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = parsed.getFullYear();
  const time = parsed.toLocaleTimeString("ar-SY-u-nu-latn", { hour: "2-digit", minute: "2-digit" });
  return `${day}/${month}/${year} • ${time}`;
}

function formatOrderTimeOnly(value: string | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString("ar-SY-u-nu-latn", { hour: "2-digit", minute: "2-digit" });
}
