"use client";

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
  AppTextarea,
  AppToolbar,
  PopupForm,
  cn
} from "@/components/shared";
import { formatInteger } from "@/lib/format";
import { useLiveQuery } from "@/offline/hooks/useLiveQuery";
import { completeLocalOrder, createLocalOrder, cancelLocalOrder, hydrateOrders, listLocalOrders, updateLocalOrder, type OrderCreateInput } from "@/offline/repositories/orders";
import { hydrateReferenceData, listLocalCashRegisters, listLocalCategories, listLocalMenuItems, listLocalRecipeIngredients } from "@/offline/repositories/reference-data";
import { hydrateTables, listLocalTables, type OfflineContext } from "@/offline/repositories/tables";
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
  const [orderActionBusyId, setOrderActionBusyId] = useState("");
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

    await run(state, async () => {
      if (!offlineContext) throw new Error("تعذر تحديد المطعم الحالي.");
      await createLocalOrder(offlineContext, buildOrderCreateInput(form, cart));
      closeOrderForm();
    });
  }

  async function changeOrderStatus(orderId: string, nextStatus: OrderStatus) {
    await runOrderAction(orderId, async () => {
      if (!offlineContext) throw new Error("تعذر تحديد المطعم الحالي.");
      await updateLocalOrder(offlineContext, orderId, { status: nextStatus });
    });
  }

  async function completeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const order = orders.find((entry) => entry.id === complete.orderId);
    if (!order) {
      state.setMessage("اختر طلبًا قبل إنهائه.");
      return;
    }
    await completeOrderById(order);
  }

  async function completeOrderById(order: OpsOrder) {
    const paymentMethod = complete.orderId === order.id ? complete.paymentMethod : order.paymentMethod || complete.paymentMethod;
    const paidAmount = paymentAmountForMethod(paymentMethod as PaymentMethod, order.total, complete.orderId === order.id ? complete.paidAmount : 0);
    if (paymentMethod === "SPLIT" && paidAmount <= 0) {
      state.setMessage("أدخل المبلغ المدفوع قبل إنهاء طلب الدفع المقسّم.");
      setComplete((current) => ({ ...current, orderId: order.id, paidAmount: current.orderId === order.id ? current.paidAmount : order.total }));
      return;
    }
    setPendingCompleteOrder({
      order,
      paymentMethod: paymentMethod as PaymentMethod,
      paidAmount,
      cashRegisterId: complete.cashRegisterId,
      note: complete.note
    });
  }

  async function confirmCompleteOrder() {
    if (!pendingCompleteOrder) return;
    const { order, paymentMethod, paidAmount, cashRegisterId, note } = pendingCompleteOrder;

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
    });
  }

  async function cancelOrder(orderId: string) {
    const reason = window.prompt("سبب الإلغاء") || "";
    if (!reason.trim()) return;
    await runOrderAction(orderId, async () => {
      if (!offlineContext) throw new Error("تعذر تحديد المطعم الحالي.");
      await cancelLocalOrder(offlineContext, orderId, reason);
    });
  }

  async function runOrderAction(orderId: string, action: () => Promise<void>) {
    setOrderActionBusyId(orderId);
    try {
      await run(state, action);
    } finally {
      setOrderActionBusyId("");
    }
  }

  const filtered = orders.filter((order) => {
    const text = `${order.id} ${order.name} ${order.notes} ${order.items.map((item) => item.name).join(" ")}`.toLowerCase();
    return (status === "ALL" || order.status === status) && text.includes(query.toLowerCase());
  });

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
      <AppPageHeader
        className="mb-4"
        title="الطلبات"
        description="متابعة طلبات المطعم وحالتها."
        primaryAction={
          <AppButton type="button" onClick={openNewOrder}>
            إنشاء طلب
          </AppButton>
        }
        secondaryActions={
          <div className="flex flex-wrap items-center gap-2">
            <AppBadge variant="neutral">{formatInteger(filtered.length)} طلب</AppBadge>
            <AppBadge variant="warning">{formatInteger(orders.filter((order) => !["COMPLETED", "CANCELLED"].includes(order.status)).length)} مفتوح</AppBadge>
          </div>
        }
      />
      <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
        <AppSurface className="min-w-0 p-4">
          <AppToolbar
            search={
              <AppFieldShell label="بحث">
                <AppInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث برقم الطلب أو الاسم أو الصنف" />
              </AppFieldShell>
            }
            filters={
              <AppFieldShell label="الحالة">
                <AppSelect value={status} onChange={(event) => setStatus(event.target.value)} className="min-w-[180px]">
                  {["ALL", ...orderStatuses].map((entry) => (
                    <option key={entry} value={entry}>
                      {orderFilterLabel(entry)}
                    </option>
                  ))}
                </AppSelect>
              </AppFieldShell>
            }
          />
          <div className="mt-4 min-w-0">
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
                onCancel={cancelOrder}
              />
            ) : (
              <AppEmptyState title="لا توجد طلبات حالياً" description="أنشئ طلبًا جديدًا أو غيّر الفلاتر." action={<AppButton type="button" onClick={openNewOrder}>إنشاء طلب</AppButton>} />
            )}
          </div>
        </AppSurface>

        <AppSurface className="min-w-0 p-4 2xl:max-w-80">
          <div className="mb-4">
            <h2 className="text-app-panel-title font-semibold text-app-ink">إتمام طلب</h2>
            <p className="mt-1 text-app-helper text-app-muted">اختر طلبًا مفتوحًا وسجل طريقة الدفع.</p>
          </div>
          <form onSubmit={completeOrder} className="grid min-w-0 gap-3">
            <AppFieldShell label="الطلب">
              <AppSelect
                value={complete.orderId}
                onChange={(event) => {
                  const orderId = event.target.value;
                  const selectedOrder = orders.find((order) => order.id === orderId);
                  setComplete({ ...complete, orderId, paidAmount: complete.paymentMethod === "DEBT" ? 0 : selectedOrder?.total ?? 0 });
                }}
              >
                <option value="">اختر طلبًا</option>
                {orders.filter((order) => !order.invoiceId && order.status !== "CANCELLED").map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.name || order.id} - {money(order.total, state.restaurant?.currency)}
                  </option>
                ))}
              </AppSelect>
            </AppFieldShell>
            <AppFieldShell label="طريقة الدفع">
              <AppSelect
                value={complete.paymentMethod}
                onChange={(event) => {
                  const paymentMethod = event.target.value;
                  const selectedOrder = orders.find((order) => order.id === complete.orderId);
                  setComplete({ ...complete, paymentMethod, paidAmount: paymentMethod === "DEBT" ? 0 : selectedOrder?.total ?? complete.paidAmount });
                }}
              >
                {paymentMethods.map((method) => <option key={method} value={method}>{option(method).label}</option>)}
              </AppSelect>
            </AppFieldShell>
            <AppFieldShell label="المدفوع">
              <AppInput type="number" min="0" value={complete.paidAmount} onChange={(event) => setComplete({ ...complete, paidAmount: Number(event.target.value) })} />
            </AppFieldShell>
            {cashRegisters.length ? (
              <AppFieldShell label="الصندوق">
                <AppSelect value={complete.cashRegisterId} onChange={(event) => setComplete({ ...complete, cashRegisterId: event.target.value })} className="min-w-0">
                  <option value="">بدون صندوق</option>
                  {cashRegisters.map((register) => (
                    <option key={register.id} value={register.id}>
                      {register.name} - {money(register.currentBalance, state.restaurant?.currency)}
                    </option>
                  ))}
                </AppSelect>
              </AppFieldShell>
            ) : null}
            <AppFieldShell label="ملاحظة">
              <AppInput value={complete.note} onChange={(event) => setComplete({ ...complete, note: event.target.value })} />
            </AppFieldShell>
            <AppButton type="submit" disabled={!complete.orderId}>إتمام</AppButton>
          </form>
        </AppSurface>
      </div>

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
          <AppButton type="submit" disabled={!cart.length}>إنشاء الطلب</AppButton>
        </form>
      </PopupForm>

      <PopupForm
        open={Boolean(pendingCompleteOrder)}
        onClose={() => setPendingCompleteOrder(null)}
        title="إكمال الطلب؟"
        description={pendingCompleteOrder ? `سيتم إنهاء الطلب ${pendingCompleteOrder.order.name || pendingCompleteOrder.order.id} بقيمة ${money(pendingCompleteOrder.order.total, state.restaurant?.currency)}.` : undefined}
        maxWidth="sm"
      >
        <div className="grid gap-4">
          <p className="text-app-body leading-7 text-app-muted">سيتم تسجيل الدفع وإغلاق الطلب بنفس بيانات الدفع الحالية.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AppButton type="button" variant="secondary" onClick={() => setPendingCompleteOrder(null)} disabled={Boolean(orderActionBusyId)} className="w-full sm:w-auto">
              إلغاء
            </AppButton>
            <AppButton
              type="button"
              data-autofocus
              onClick={() => void confirmCompleteOrder()}
              loading={Boolean(pendingCompleteOrder && orderActionBusyId === pendingCompleteOrder.order.id)}
              disabled={Boolean(orderActionBusyId)}
              className="w-full sm:w-auto"
            >
              إكمال الطلب
            </AppButton>
          </div>
        </div>
      </PopupForm>
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
  onCancel: (orderId: string) => void;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-app-lg border border-app-border bg-app-surface md:block">
        <table className="w-full min-w-[1080px] table-fixed text-app-table">
          <thead className="bg-app-surface-muted text-app-meta text-app-muted">
            <tr className="[&>th]:border-b [&>th]:border-app-border [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-start [&>th]:font-semibold">
              <th className="w-[220px]">رقم الطلب</th>
              <th className="w-36">الطاولة / النوع</th>
              <th className="w-40 whitespace-nowrap">الوقت</th>
              <th className="w-32 whitespace-nowrap">الإجمالي</th>
              <th className="w-28 whitespace-nowrap">الحالة</th>
              <th className="w-[300px]">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-border">
            {orders.map((order) => (
              <tr key={order.id} className="align-top transition-colors hover:bg-app-surface-muted">
                <td className="min-w-0 px-3 py-3">
                  <p className="truncate font-semibold text-app-ink" title={order.name || order.id}>{order.name || order.id}</p>
                  <p className="mt-1 truncate text-app-helper text-app-muted" dir="ltr" title={order.id}>#{order.id}</p>
                  {order.invoiceId ? (
                    <p className="mt-1 truncate text-app-helper font-semibold text-app-success" dir="ltr" title={order.invoiceId}>
                      فاتورة: {order.invoiceId}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-app-muted">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-app-ink" title={tableLabel(tables, order.tableId)}>{tableLabel(tables, order.tableId)}</p>
                    <p className="mt-1 truncate text-app-helper text-app-muted" dir="ltr" title={order.type}>{order.type}</p>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-app-muted">{formatOrderDateTime(order.orderedAt || order.createdAt)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold text-app-ink">{money(order.total, currency)}</td>
                <td className="px-3 py-3"><OrderStatusBadge status={order.status} /></td>
                <td className="px-3 py-3">
                  <OrderRowActions
                    order={order}
                    table={tables.find((table) => table.id === order.tableId) ?? null}
                    restaurant={restaurant}
                    token={token}
                    busy={busyId === order.id}
                    onStatusChange={onStatusChange}
                    onComplete={onComplete}
                    onCancel={onCancel}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 md:hidden">
        {orders.map((order) => (
          <article key={order.id} className="min-w-0 rounded-app-lg border border-app-border bg-app-surface p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-app-ink" title={order.name || order.id}>{order.name || order.id}</p>
                <p className="mt-1 truncate text-app-meta text-app-muted">{tableLabel(tables, order.tableId)} · {formatOrderDateTime(order.orderedAt || order.createdAt)}</p>
                <p className="mt-1 truncate text-app-helper text-app-muted" dir="ltr" title={order.id}>#{order.id}</p>
              </div>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="mt-2 line-clamp-2 text-app-helper text-app-muted">{order.items.map((item) => `${item.name} x${item.quantity}`).join("، ")}</p>
            <p className="mt-2 font-semibold text-app-ink">{money(order.total, currency)}</p>
            <div className="mt-3">
              <OrderRowActions
                order={order}
                table={tables.find((table) => table.id === order.tableId) ?? null}
                restaurant={restaurant}
                token={token}
                busy={busyId === order.id}
                onStatusChange={onStatusChange}
                onComplete={onComplete}
                onCancel={onCancel}
              />
            </div>
          </article>
        ))}
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
  onCancel
}: {
  order: OpsOrder;
  table: OpsTable | null;
  restaurant: Restaurant | null;
  token: string;
  busy: boolean;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
  onComplete: (order: OpsOrder) => void;
  onCancel: (orderId: string) => void;
}) {
  const closed = order.status === "COMPLETED" || order.status === "CANCELLED";

  return (
    <div className="flex max-w-[300px] flex-wrap items-center gap-2">
      <OrderReceiptPrintButton order={order} restaurant={restaurant} table={table} token={token} disabled={!order.items.length} />
      {!closed ? (
        <>
          {orderWorkflowStatuses.map((status) => (
            <AppButton key={status} type="button" variant="secondary" size="sm" disabled={busy || order.status === status} onClick={() => onStatusChange(order.id, status)}>
              {orderStatusLabels[status]}
            </AppButton>
          ))}
          <AppButton type="button" size="sm" disabled={busy} onClick={() => onComplete(order)}>
            إنهاء
          </AppButton>
          <AppButton type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onCancel(order.id)} className="text-app-danger hover:bg-app-danger-soft">
            إلغاء
          </AppButton>
        </>
      ) : null}
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

function tableLabel(tables: OpsTable[], tableId: string) {
  if (!tableId) return "بدون طاولة";
  return tables.find((table) => table.id === tableId)?.name ?? tableId;
}

function orderFilterLabel(status: string) {
  return status === "ALL" ? "كل الحالات" : orderStatusLabels[status as OrderStatus];
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

function formatOrderDateTime(value: string | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("ar-SY-u-nu-latn", { dateStyle: "medium", timeStyle: "short" });
}
