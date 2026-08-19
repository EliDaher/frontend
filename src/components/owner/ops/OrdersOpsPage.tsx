"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { PopupForm } from "@/components/shared";
import { formatInteger } from "@/lib/format";
import { useLiveQuery } from "@/offline/hooks/useLiveQuery";
import { completeLocalOrder, createLocalOrder, cancelLocalOrder, hydrateOrders, listLocalOrders, updateLocalOrder, type OrderCreateInput } from "@/offline/repositories/orders";
import { hydrateReferenceData, listLocalCashRegisters, listLocalCategories, listLocalMenuItems, listLocalRecipeIngredients } from "@/offline/repositories/reference-data";
import { hydrateTables, listLocalTables, type OfflineContext } from "@/offline/repositories/tables";
import type { Category, MenuItem } from "@/types/menu";
import type { CashRegister, OpsOrder, OpsTable, OrderStatus, PaymentMethod, RecipeIngredient } from "@/types/ops";
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
import { OrderReceiptPrintButton } from "./OrderReceiptPrintButton";
import { Filters, option, orderStatuses, orderTypes, paymentMethods, run } from "./OpsPageShared";

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
    if (!window.confirm(`إنهاء الطلب ${order.id} بقيمة ${money(order.total, state.restaurant?.currency)}؟`)) return;

    await runOrderAction(order.id, async () => {
      if (!offlineContext) throw new Error("تعذر تحديد المطعم الحالي.");
      await completeLocalOrder(offlineContext, order.id, {
        paymentMethod: paymentMethod as PaymentMethod,
        paidAmount,
        cashRegisterId: complete.cashRegisterId || undefined,
        note: complete.note
      });
      setComplete((current) => ({ ...current, orderId: "", paidAmount: 0, note: "" }));
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
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Panel title="قائمة الطلبات" action={<SecondaryButton onClick={openNewOrder}>إنشاء طلب</SecondaryButton>}>
          <Filters query={query} setQuery={setQuery} status={status} setStatus={setStatus} statuses={["ALL", ...orderStatuses]} />
          <div className="mt-4 grid gap-3">
            {filtered.length ? (
              filtered.map((order) => (
                <article key={order.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black">{order.name || order.id}</h3>
                      <p className="mt-1 text-sm font-bold text-slate-600">{order.items.map((item) => `${item.name} x${item.quantity}`).join("، ")}</p>
                      <p className="mt-1 text-sm font-bold text-slate-500">
                        {order.type} · {formatOrderDateTime(order.orderedAt || order.createdAt)} · {money(order.total, state.restaurant?.currency)}
                      </p>
                      {order.invoiceId ? <p className="mt-1 text-xs font-black text-emerald-700">فاتورة: {order.invoiceId}</p> : null}
                    </div>
                    <StatusBadge label={orderStatusLabels[order.status]} tone={order.status === "COMPLETED" ? "green" : order.status === "CANCELLED" ? "red" : "amber"} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <OrderReceiptPrintButton order={order} restaurant={state.restaurant} table={tables.find((table) => table.id === order.tableId) ?? null} token={state.token} disabled={!order.items.length} />
                    {order.status !== "COMPLETED" && order.status !== "CANCELLED" ? (
                      <OrderStatusActions
                        status={order.status}
                        busy={orderActionBusyId === order.id}
                        onStatusChange={(next) => void changeOrderStatus(order.id, next)}
                        onComplete={() => void completeOrderById(order)}
                        onCancel={() => void cancelOrder(order.id)}
                      />
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <Empty title="لا توجد طلبات" text="أنشئ طلبًا جديدًا أو غيّر الفلاتر." />
            )}
          </div>
        </Panel>

        <Panel title="إتمام طلب">
          <form onSubmit={completeOrder} className="grid gap-3">
            <SelectField
              label="الطلب"
              value={complete.orderId}
              options={[{ value: "", label: "اختر طلبًا" }, ...orders.filter((order) => !order.invoiceId && order.status !== "CANCELLED").map((order) => ({ value: order.id, label: `${order.name || order.id} - ${money(order.total, state.restaurant?.currency)}` }))]}
              onChange={(orderId) => {
                const selectedOrder = orders.find((order) => order.id === orderId);
                setComplete({ ...complete, orderId, paidAmount: complete.paymentMethod === "DEBT" ? 0 : selectedOrder?.total ?? 0 });
              }}
            />
            <SelectField
              label="طريقة الدفع"
              value={complete.paymentMethod}
              options={paymentMethods.map(option)}
              onChange={(paymentMethod) => {
                const selectedOrder = orders.find((order) => order.id === complete.orderId);
                setComplete({ ...complete, paymentMethod, paidAmount: paymentMethod === "DEBT" ? 0 : selectedOrder?.total ?? complete.paidAmount });
              }}
            />
            <Field label="المدفوع" type="number" min="0" value={complete.paidAmount} onChange={(paidAmount) => setComplete({ ...complete, paidAmount: Number(paidAmount) })} />
            {cashRegisters.length ? (
              <SelectField
                label="الصندوق"
                value={complete.cashRegisterId}
                options={[{ value: "", label: "بدون صندوق" }, ...cashRegisters.map((register) => ({ value: register.id, label: `${register.name} - ${money(register.currentBalance, state.restaurant?.currency)}` }))]}
                onChange={(cashRegisterId) => setComplete({ ...complete, cashRegisterId })}
              />
            ) : null}
            <Field label="ملاحظة" value={complete.note} onChange={(note) => setComplete({ ...complete, note })} />
            <PrimaryButton disabled={!complete.orderId}>إتمام</PrimaryButton>
          </form>
        </Panel>
      </div>

      <PopupForm open={orderFormOpen} onClose={closeOrderForm} title="إنشاء طلب" description="اختر الطاولة والوقت، ثم أضف الأصناف حسب الأقسام." maxWidth="xl">
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="اسم الطلب" value={form.name} onChange={updateOrderName} />
            <SelectField label="الطاولة" value={form.tableId} options={[{ value: "", label: "بدون طاولة" }, ...tables.map((table) => ({ value: table.id, label: table.name }))]} onChange={updateOrderTable} />
            <SelectField label="نوع الطلب" value={form.type} options={orderTypes.map(option)} onChange={(type) => setForm({ ...form, type })} />
            <Field label="التاريخ" type="date" value={form.orderedDate} onChange={(orderedDate) => setForm({ ...form, orderedDate })} />
            <Field label="الوقت" type="time" value={form.orderedTime} onChange={updateOrderTime} />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="grid gap-1 text-sm font-black">
              <span>بحث عن صنف</span>
              <input
                value={itemQuery}
                onChange={(event) => setItemQuery(event.target.value)}
                placeholder="ابحث عن صنف..."
                className="h-11 rounded-md border border-slate-200 bg-white px-3 font-bold outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
              />
            </label>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
              {categoryTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveItemCategoryId(tab.id)}
                  className={`shrink-0 rounded-full border px-3 py-2 text-xs font-black transition ${
                    activeItemCategoryId === tab.id
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50"
                  }`}
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
                          className="rounded-md border border-slate-200 bg-white p-2 text-right shadow-sm transition hover:border-amber-300 hover:bg-amber-50"
                        >
                          <span className="block truncate text-sm font-black text-slate-950">{item.name}</span>
                          <span className="mt-1 block text-xs font-bold text-slate-500">{money(item.price, state.restaurant?.currency)}</span>
                          {state.modules?.inventory && !hasRecipe ? (
                            <span className="mt-1 block text-[11px] font-black text-amber-700">لا توجد مكونات مخزون مرتبطة</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Empty title="لا توجد نتائج مطابقة" text="جرّب البحث باسم صنف آخر." />
                )
              ) : (
                <Empty title="لا توجد أصناف" text="أضف أصنافًا إلى المنيو قبل إنشاء الطلب." />
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 p-3">
              <p className="text-sm font-black">بنود الطلب</p>
              <p className="text-xs font-black text-slate-500">{formatInteger(cart.length)} صنف</p>
            </div>
            <div className="grid gap-2 p-3">
              {cart.length ? (
                cart.map((line, index) => (
                  <div key={`${line.menuItemId}-${index}`} className="grid gap-2 rounded-md bg-slate-50 p-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-black">{line.name}</p>
                        <p className="text-xs font-bold text-slate-500">{money(line.unitPrice * line.quantity, state.restaurant?.currency)}</p>
                        {state.modules?.inventory && !recipes.some((entry) => entry.menuItemId === line.menuItemId) ? (
                          <p className="mt-1 text-xs font-black text-amber-700">لا توجد مكونات مخزون مرتبطة بهذا الصنف.</p>
                        ) : null}
                      </div>
                      <DangerButton onClick={() => removeCartLine(index)}>حذف</DangerButton>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[100px_1fr]">
                      <Field label="الكمية" type="number" min="1" value={line.quantity} onChange={(quantity) => updateCartLine(index, { quantity: Number(quantity) })} />
                      <Field label="ملاحظة" value={line.notes} onChange={(notes) => updateCartLine(index, { notes })} />
                    </div>
                  </div>
                ))
              ) : (
                <Empty title="السلة فارغة" text="أضف صنفًا أو أكثر قبل إنشاء الطلب." />
              )}
            </div>
            <div className="border-t border-slate-100 p-3 text-sm font-black">
              الإجمالي قبل الرسوم: {money(cartSubTotal, state.restaurant?.currency)}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="خصم" type="number" min="0" value={form.discount} onChange={(discount) => setForm({ ...form, discount: Number(discount) })} />
            <Field label="ضريبة" type="number" min="0" value={form.tax} onChange={(tax) => setForm({ ...form, tax: Number(tax) })} />
            <Field label="خدمة" type="number" min="0" value={form.serviceCharge} onChange={(serviceCharge) => setForm({ ...form, serviceCharge: Number(serviceCharge) })} />
          </div>
          <SelectField label="طريقة الدفع" value={form.paymentMethod} options={paymentMethods.map(option)} onChange={(paymentMethod) => setForm({ ...form, paymentMethod })} />
          <TextArea label="ملاحظات الطلب" value={form.notes} onChange={(notes) => setForm({ ...form, notes })} />
          <PrimaryButton disabled={!cart.length}>إنشاء الطلب</PrimaryButton>
        </form>
      </PopupForm>
    </OpsShell>
  );
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
