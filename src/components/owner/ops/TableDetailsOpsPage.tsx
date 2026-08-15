"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { PopupForm } from "@/components/shared";
import { adminRequest } from "@/lib/api";
import { formatInteger } from "@/lib/format";
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
import { option, orderTypes, paymentMethods, tableStatuses } from "./OpsPageShared";

type OrderEditLine = {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes: string;
  modifiers: string[];
};

type StartOrderForm = {
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

type StartCartLine = {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes: string;
  modifiers: string[];
};

export function TableDetailsOpsPage({ tableId }: { tableId: string }) {
  const state = useOpsPage("tables");
  const [table, setTable] = useState<OpsTable | null>(null);
  const [order, setOrder] = useState<OpsOrder | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recipes, setRecipes] = useState<RecipeIngredient[]>([]);
  const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);
  const [tableFormOpen, setTableFormOpen] = useState(false);
  const [tableForm, setTableForm] = useState({ name: "", area: "", capacity: 1, status: "AVAILABLE", qrCode: "" });
  const [orderForm, setOrderForm] = useState({ name: "", tableId: "", type: "DINE_IN", status: "PENDING", discount: 0, tax: 0, serviceCharge: 0, paymentMethod: "CASH", notes: "" });
  const [completeForm, setCompleteForm] = useState({ paymentMethod: "CASH", paidAmount: 0, cashRegisterId: "", note: "" });
  const [draftLine, setDraftLine] = useState({ menuItemId: "", quantity: 1, notes: "" });
  const [lines, setLines] = useState<OrderEditLine[]>([]);
  const [orderActionBusy, setOrderActionBusy] = useState(false);
  const [startOrderOpen, setStartOrderOpen] = useState(false);
  const [startOrderForm, setStartOrderForm] = useState<StartOrderForm>(() => emptyStartOrderForm(tableId));
  const [startOrderNameTouched, setStartOrderNameTouched] = useState(false);
  const [startCart, setStartCart] = useState<StartCartLine[]>([]);
  const [startItemQuery, setStartItemQuery] = useState("");
  const [activeStartCategoryId, setActiveStartCategoryId] = useState("all");

  const lockedOrder = Boolean(order && (["COMPLETED", "CANCELLED"].includes(order.status) || order.invoiceId || order.paymentId));
  const canStartOrder = Boolean(table && !table.currentOrderId && !order && state.modules?.orders);
  const previewTotal = useMemo(() => {
    const subTotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    return Math.max(subTotal - orderForm.discount + orderForm.tax + orderForm.serviceCharge, 0);
  }, [lines, orderForm.discount, orderForm.tax, orderForm.serviceCharge]);
  const startCartSubTotal = startCart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

  useEffect(() => {
    if (state.token && state.modules?.tables) void load();
  }, [state.token, state.modules?.tables, tableId]);

  async function load() {
    const nextTable = await adminRequest<OpsTable>(`/api/owner/ops/tables/${tableId}`, state.token);
    setTable(nextTable);
    hydrateTableForm(nextTable);

    const [nextMenuItems, nextCategories, nextOrder, nextRecipes, nextCashRegisters] = await Promise.all([
      adminRequest<MenuItem[]>("/api/owner/items", state.token).catch(() => []),
      adminRequest<Category[]>("/api/owner/categories", state.token).catch(() => []),
      nextTable.currentOrderId && state.modules?.orders ? adminRequest<OpsOrder>(`/api/owner/ops/orders/${nextTable.currentOrderId}`, state.token).catch(() => null) : Promise.resolve(null),
      state.modules?.inventory ? adminRequest<RecipeIngredient[]>("/api/owner/ops/recipes", state.token).catch(() => []) : Promise.resolve([]),
      state.modules?.accounting ? adminRequest<CashRegister[]>("/api/owner/ops/cash/registers", state.token).catch(() => []) : Promise.resolve([])
    ]);
    setMenuItems(nextMenuItems);
    setCategories(nextCategories);
    setRecipes(nextRecipes);
    setCashRegisters(nextCashRegisters);
    setDraftLine((current) => ({ ...current, menuItemId: current.menuItemId || nextMenuItems[0]?.id || "" }));
    setOrder(nextOrder);

    if (nextOrder) {
      setOrderForm({
        name: nextOrder.name || nextOrder.id,
        tableId: nextOrder.tableId || nextTable.id,
        type: nextOrder.type,
        status: nextOrder.status,
        discount: nextOrder.discount,
        tax: nextOrder.tax,
        serviceCharge: nextOrder.serviceCharge,
        paymentMethod: nextOrder.paymentMethod,
        notes: nextOrder.notes || ""
      });
      setCompleteForm((current) => ({
        ...current,
        paymentMethod: nextOrder.paymentMethod,
        paidAmount: nextOrder.paymentMethod === "DEBT" ? 0 : nextOrder.total,
        cashRegisterId: current.cashRegisterId || nextCashRegisters[0]?.id || "",
        note: nextOrder.notes || ""
      }));
      setLines(nextOrder.items.map((line) => ({
        menuItemId: line.menuItemId,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        notes: line.notes || "",
        modifiers: line.modifiers || []
      })));
    } else {
      setLines([]);
    }
  }

  function hydrateTableForm(nextTable: OpsTable) {
    setTableForm({
      name: nextTable.name,
      area: nextTable.area,
      capacity: nextTable.capacity,
      status: nextTable.status,
      qrCode: nextTable.qrCode || ""
    });
  }

  function openTableForm() {
    if (table) hydrateTableForm(table);
    setTableFormOpen(true);
  }

  function closeTableForm() {
    setTableFormOpen(false);
    if (table) hydrateTableForm(table);
  }

  async function saveTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runLocal(async () => {
      await adminRequest(`/api/owner/ops/tables/${tableId}`, state.token, {
        method: "PATCH",
        body: JSON.stringify(tableForm)
      });
      setTableFormOpen(false);
      await load();
    });
  }

  function openStartOrder() {
    if (!table) return;
    setStartOrderForm(emptyStartOrderForm(table.id, table.name));
    setStartOrderNameTouched(false);
    setStartCart([]);
    setStartItemQuery("");
    setActiveStartCategoryId("all");
    setStartOrderOpen(true);
  }

  function closeStartOrder() {
    setStartOrderOpen(false);
    setStartOrderForm(emptyStartOrderForm(table?.id ?? tableId, table?.name ?? ""));
    setStartOrderNameTouched(false);
    setStartCart([]);
    setStartItemQuery("");
    setActiveStartCategoryId("all");
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!startCart.length) {
      state.setMessage("أضف صنفًا واحدًا على الأقل إلى الطلب.");
      return;
    }

    await runLocal(async () => {
      await adminRequest("/api/owner/ops/orders", state.token, {
        method: "POST",
        body: JSON.stringify({
          name: startOrderForm.name,
          tableId: startOrderForm.tableId,
          type: startOrderForm.type,
          source: startOrderForm.source,
          orderedAt: combineLocalDateTime(startOrderForm.orderedDate, startOrderForm.orderedTime),
          items: startCart.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity, notes: line.notes, modifiers: line.modifiers })),
          discount: startOrderForm.discount,
          tax: startOrderForm.tax,
          serviceCharge: startOrderForm.serviceCharge,
          paymentMethod: startOrderForm.paymentMethod,
          notes: startOrderForm.notes
        })
      });
      closeStartOrder();
      await load();
    });
  }

  function addStartItemToCart(item: MenuItem) {
    setStartCart((current) => {
      const existing = current.find((line) => line.menuItemId === item.id && !line.notes);
      if (existing) {
        return current.map((line) => (line === existing ? { ...line, quantity: line.quantity + 1 } : line));
      }
      return [...current, { menuItemId: item.id, name: item.name, quantity: 1, unitPrice: item.price, notes: "", modifiers: [] }];
    });
  }

  function updateStartCartLine(index: number, patch: Partial<StartCartLine>) {
    setStartCart((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch, quantity: Math.max(1, patch.quantity ?? line.quantity) } : line)));
  }

  function updateStartOrderTime(orderedTime: string) {
    setStartOrderForm((current) => ({
      ...current,
      orderedTime,
      name: startOrderNameTouched ? current.name : defaultOrderName(table?.name ?? "", orderedTime)
    }));
  }

  function updateStartOrderName(name: string) {
    setStartOrderNameTouched(true);
    setStartOrderForm((current) => ({ ...current, name }));
  }

  async function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order || lockedOrder) return;
    if (!lines.length) {
      state.setMessage("لا يمكن حفظ طلب بدون أصناف.");
      return;
    }

    await runLocal(async () => {
      await adminRequest(`/api/owner/ops/orders/${order.id}`, state.token, {
        method: "PATCH",
        body: JSON.stringify({
          name: orderForm.name,
          tableId: orderForm.tableId,
          type: orderForm.type,
          discount: orderForm.discount,
          tax: orderForm.tax,
          serviceCharge: orderForm.serviceCharge,
          paymentMethod: orderForm.paymentMethod,
          notes: orderForm.notes,
          items: lines.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity, notes: line.notes, modifiers: line.modifiers }))
        })
      });
      await load();
    });
  }

  function addLine() {
    const item = menuItems.find((entry) => entry.id === draftLine.menuItemId);
    if (!item || draftLine.quantity <= 0) return;

    setLines((current) => [
      ...current,
      {
        menuItemId: item.id,
        name: item.name,
        quantity: draftLine.quantity,
        unitPrice: item.price,
        notes: draftLine.notes,
        modifiers: []
      }
    ]);
    setDraftLine({ menuItemId: item.id, quantity: 1, notes: "" });
  }

  function updateLine(index: number, patch: Partial<OrderEditLine>) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch, quantity: Math.max(1, patch.quantity ?? line.quantity) } : line)));
  }

  async function runLocal(action: () => Promise<void>) {
    state.setMessage("");
    try {
      await action();
    } catch (error) {
      state.setMessage(error instanceof Error ? error.message : "حدث خطأ غير متوقع.");
    }
  }

  async function changeOrderStatus(status: OrderStatus) {
    if (!order || lockedOrder) return;
    await runOrderAction(async () => {
      await adminRequest(`/api/owner/ops/orders/${order.id}`, state.token, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await load();
    });
  }

  async function completeCurrentOrder() {
    if (!order || lockedOrder) return;
    const paidAmount = paymentAmountForMethod(completeForm.paymentMethod as PaymentMethod, order.total, completeForm.paidAmount);
    if (completeForm.paymentMethod === "SPLIT" && paidAmount <= 0) {
      state.setMessage("أدخل المبلغ المدفوع قبل إنهاء طلب الدفع المقسّم.");
      return;
    }
    if (!window.confirm(`إنهاء الطلب ${order.id} بقيمة ${money(order.total, state.restaurant?.currency)}؟`)) return;

    await runOrderAction(async () => {
      await adminRequest(`/api/owner/ops/orders/${order.id}/complete`, state.token, {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: completeForm.paymentMethod,
          paidAmount,
          cashRegisterId: completeForm.cashRegisterId || undefined,
          note: completeForm.note
        })
      });
      await load();
    });
  }

  async function cancelCurrentOrder() {
    if (!order || lockedOrder) return;
    const reason = window.prompt("سبب الإلغاء") || "";
    if (!reason.trim()) return;

    await runOrderAction(async () => {
      await adminRequest(`/api/owner/ops/orders/${order.id}/cancel`, state.token, {
        method: "POST",
        body: JSON.stringify({ reason })
      });
      await load();
    });
  }

  async function runOrderAction(action: () => Promise<void>) {
    setOrderActionBusy(true);
    try {
      await runLocal(action);
    } finally {
      setOrderActionBusy(false);
    }
  }

  const normalizedStartItemQuery = startItemQuery.trim().toLowerCase();
  const filteredStartMenuItems = menuItems.filter((item) => {
    const text = `${item.name} ${item.description}`.toLowerCase();
    return !normalizedStartItemQuery || text.includes(normalizedStartItemQuery);
  });
  const { startCategoryTabs, visibleStartMenuItems } = useMemo(() => {
    const sortedCategories = [...categories].sort((first, second) => first.order - second.order);
    const knownCategoryIds = new Set(sortedCategories.map((category) => category.id));
    const uncategorizedItems = filteredStartMenuItems.filter((item) => !knownCategoryIds.has(item.categoryId));
    const tabs = [
      { id: "all", name: "الكل", count: filteredStartMenuItems.length },
      ...sortedCategories
        .filter((category) => menuItems.some((item) => item.categoryId === category.id))
        .map((category) => ({
          id: category.id,
          name: category.name,
          count: filteredStartMenuItems.filter((item) => item.categoryId === category.id).length
        })),
      ...(menuItems.some((item) => !knownCategoryIds.has(item.categoryId)) ? [{ id: "uncategorized", name: "بدون قسم", count: uncategorizedItems.length }] : [])
    ];
    const visibleItems = filteredStartMenuItems
      .filter((item) => {
        if (activeStartCategoryId === "all") return true;
        if (activeStartCategoryId === "uncategorized") return !knownCategoryIds.has(item.categoryId);
        return item.categoryId === activeStartCategoryId;
      })
      .sort((first, second) => {
        const firstCategoryOrder = sortedCategories.find((category) => category.id === first.categoryId)?.order ?? Number.MAX_SAFE_INTEGER;
        const secondCategoryOrder = sortedCategories.find((category) => category.id === second.categoryId)?.order ?? Number.MAX_SAFE_INTEGER;
        return firstCategoryOrder - secondCategoryOrder || first.order - second.order;
      });

    return { startCategoryTabs: tabs, visibleStartMenuItems: visibleItems };
  }, [activeStartCategoryId, categories, filteredStartMenuItems, menuItems]);

  useEffect(() => {
    if (!startCategoryTabs.some((tab) => tab.id === activeStartCategoryId)) {
      setActiveStartCategoryId("all");
    }
  }, [activeStartCategoryId, startCategoryTabs]);

  return (
    <OpsShell title="تفاصيل الطاولة" eyebrow="الطاولات والطلبات المفتوحة" module="tables" state={state} onRefresh={() => void Promise.all([state.loadRestaurant(), load()])}>
      <div className="mb-4">
        <Link href="/owner/operations/tables" className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-black text-slate-700">
          العودة للطاولات
        </Link>
      </div>

      <Panel
        title="بيانات الطاولة"
        action={table ? (
          <div className="flex flex-wrap gap-2">
            {canStartOrder ? <button type="button" onClick={openStartOrder} className="inline-flex h-10 items-center justify-center rounded-md bg-amber-500 px-3 text-sm font-black text-white">بدء طلب</button> : null}
            <SecondaryButton onClick={openTableForm}>تعديل الطاولة</SecondaryButton>
          </div>
        ) : null}
      >
        {table ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <h2 className="text-5xl font-black text-slate-950 text-center w-full">
                <div className="select-none inline-block rounded-md border border-slate-200 bg-slate-50 px-4 py-2">
                  {table.name}
                </div>
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <TableFact label="المنطقة" value={table.area || "غير محدد"} />
                <TableFact label="السعة" value={`${table.capacity} مقاعد`} />
                <TableFact label="QR" value={table.qrCode || "غير مضاف"} />
                <TableFact label="الطلب المفتوح" value={table.currentOrderId || "لا يوجد"} />
              </div>
            </div>
            <StatusBadge label={table.status} tone={table.status === "AVAILABLE" ? "green" : table.status === "DISABLED" ? "red" : "amber"} />
          </div>
        ) : <Empty title="لم يتم العثور على الطاولة" text="تحقق من الرابط أو ارجع لقائمة الطاولات." />}
      </Panel>

      <div className="mt-4">
        <Panel title="الطلب على الطاولة">
          {order ? (
            <form onSubmit={saveOrder} className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
                <div className="min-w-44 flex-1">
                  <p className="truncate text-sm font-black text-slate-950">{order.name || order.id}</p>
                  <p className="mt-0.5 truncate text-[11px] font-bold text-slate-500">#{order.id}</p>
                </div>
                <div className="rounded-md bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">
                  {money(order.total, state.restaurant?.currency)}
                </div>
                <StatusBadge label={orderStatusLabels[order.status]} tone={order.status === "COMPLETED" ? "green" : order.status === "CANCELLED" ? "red" : "amber"} />
                <label className="flex h-10 min-w-56 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 text-xs font-black text-slate-500">
                  <span className="shrink-0">اسم الطلب</span>
                  <input
                    value={orderForm.name}
                    onChange={(event) => setOrderForm({ ...orderForm, name: event.target.value })}
                    className="min-w-0 flex-1 bg-transparent text-sm font-black text-slate-950 outline-none"
                  />
                </label>
                <label className="flex h-10 min-w-44 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 text-xs font-black text-slate-500">
                  <span className="shrink-0">نوع الطلب</span>
                  <select
                    value={orderForm.type}
                    onChange={(event) => setOrderForm({ ...orderForm, type: event.target.value })}
                    className="min-w-0 flex-1 bg-transparent text-sm font-black text-slate-950 outline-none"
                  >
                    {orderTypes.map((type) => (
                      <option key={type} value={type}>{option(type).label}</option>
                    ))}
                  </select>
                </label>
                <OrderStatusActions
                  status={order.status}
                  busy={orderActionBusy}
                  onStatusChange={(status) => void changeOrderStatus(status)}
                  onComplete={() => void completeCurrentOrder()}
                  onCancel={() => void cancelCurrentOrder()}
                />
              </div>

              {lockedOrder ? (
                <p className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">
                  الطلب مغلق ماليًا. يمكن عرض التفاصيل، لكن لا يمكن تعديل البنود بعد الإتمام أو الإلغاء أو إنشاء الفاتورة.
                </p>
              ) : null}

              {!lockedOrder ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="grid gap-3 md:grid-cols-[1fr_115px] ">
                    <SelectField label="إضافة صنف" value={draftLine.menuItemId} options={menuItems.map((item) => ({ value: item.id, label: `${item.name} - ${money(item.price, state.restaurant?.currency)}` }))} onChange={(menuItemId) => setDraftLine({ ...draftLine, menuItemId })} />
                    <Field label="الكمية" type="number" min="1" value={draftLine.quantity} onChange={(quantity) => setDraftLine({ ...draftLine, quantity: Number(quantity) })} />
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                    <Field label="ملاحظة الصنف" value={draftLine.notes} onChange={(notes) => setDraftLine({ ...draftLine, notes })} />
                    <SecondaryButton onClick={addLine}>إضافة</SecondaryButton>
                  </div>
                </div>
              ) : null}

              {lines.length ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full min-w-[760px] text-right text-sm">
                    <thead className="bg-slate-50 text-xs font-black text-slate-500">
                      <tr>
                        <th className="px-3 py-2">الصنف</th>
                        <th className="px-3 py-2">السعر</th>
                        <th className="w-28 px-3 py-2">الكمية</th>
                        <th className="px-3 py-2">ملاحظة</th>
                        <th className="px-3 py-2">الإجمالي</th>
                        {!lockedOrder ? <th className="w-20 px-3 py-2">إجراء</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, index) => (
                        <tr key={`${line.menuItemId}-${index}`} className="border-t border-slate-100 align-top">
                          <td className="px-3 py-2">
                            <p className="font-black text-slate-900">{line.name}</p>
                            {state.modules?.inventory && !recipes.some((entry) => entry.menuItemId === line.menuItemId) ? (
                              <p className="mt-1 text-xs font-black text-amber-700">لا توجد مكونات مخزون مرتبطة بهذا الصنف.</p>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-bold text-slate-600">{money(line.unitPrice, state.restaurant?.currency)}</td>
                          <td className="px-3 py-2">
                            {lockedOrder ? (
                              <span className="font-black text-slate-700">{formatInteger(line.quantity)}</span>
                            ) : (
                              <input
                                type="number"
                                min="1"
                                value={line.quantity}
                                onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })}
                                className="h-9 w-20 rounded-md border border-slate-200 bg-white px-2 font-bold outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                              />
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {lockedOrder ? (
                              <span className="font-bold text-slate-600">{line.notes || "-"}</span>
                            ) : (
                              <input
                                value={line.notes}
                                onChange={(event) => updateLine(index, { notes: event.target.value })}
                                className="h-9 w-full min-w-48 rounded-md border border-slate-200 bg-white px-2 font-bold outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                              />
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-black text-slate-900">{money(line.unitPrice * line.quantity, state.restaurant?.currency)}</td>
                          {!lockedOrder ? (
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}
                                className="inline-flex h-9 items-center justify-center rounded-md border border-red-200 bg-red-50 px-3 text-xs font-black text-red-700"
                              >
                                حذف
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty title="لا توجد بنود" text="أضف صنفًا واحدًا على الأقل إلى الطلب." />}

              <div className="grid gap-3 md:grid-cols-4">
                <Field label="خصم" type="number" min="0" value={orderForm.discount} onChange={(discount) => setOrderForm({ ...orderForm, discount: Number(discount) })} />
                <Field label="ضريبة" type="number" min="0" value={orderForm.tax} onChange={(tax) => setOrderForm({ ...orderForm, tax: Number(tax) })} />
                <Field label="خدمة" type="number" min="0" value={orderForm.serviceCharge} onChange={(serviceCharge) => setOrderForm({ ...orderForm, serviceCharge: Number(serviceCharge) })} />
                <SelectField label="طريقة الدفع" value={orderForm.paymentMethod} options={paymentMethods.map(option)} onChange={(paymentMethod) => setOrderForm({ ...orderForm, paymentMethod })} />
              </div>
              {!lockedOrder ? (
                <div className="grid gap-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3 md:grid-cols-4">
                  <SelectField label="طريقة الدفع عند الإنهاء" value={completeForm.paymentMethod} options={paymentMethods.map(option)} onChange={(paymentMethod) => setCompleteForm({ ...completeForm, paymentMethod, paidAmount: paymentMethod === "DEBT" ? 0 : order.total })} />
                  <Field label="المدفوع" type="number" min="0" value={completeForm.paidAmount} onChange={(paidAmount) => setCompleteForm({ ...completeForm, paidAmount: Number(paidAmount) })} />
                  {cashRegisters.length ? (
                    <SelectField label="الصندوق" value={completeForm.cashRegisterId} options={[{ value: "", label: "بدون صندوق" }, ...cashRegisters.map((register) => ({ value: register.id, label: `${register.name} - ${money(register.currentBalance, state.restaurant?.currency)}` }))]} onChange={(cashRegisterId) => setCompleteForm({ ...completeForm, cashRegisterId })} />
                  ) : (
                    <Field label="الصندوق" value={completeForm.cashRegisterId} onChange={(cashRegisterId) => setCompleteForm({ ...completeForm, cashRegisterId })} />
                  )}
                  <Field label="ملاحظة الدفع" value={completeForm.note} onChange={(note) => setCompleteForm({ ...completeForm, note })} />
                </div>
              ) : null}
              <TextArea label="ملاحظات الطلب" value={orderForm.notes} onChange={(notes) => setOrderForm({ ...orderForm, notes })} />
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="font-black">الإجمالي المتوقع: {money(previewTotal, state.restaurant?.currency)}</p>
                <PrimaryButton disabled={lockedOrder || !lines.length}>حفظ الطلب</PrimaryButton>
              </div>
            </form>
          ) : (
            <div className="grid gap-3">
              <Empty title="لا يوجد طلب مفتوح" text="هذه الطاولة لا تحتوي على طلب مفتوح حاليًا." />
              {canStartOrder ? (
                <div className="flex justify-center">
                  <button type="button" onClick={openStartOrder} className="inline-flex h-11 items-center justify-center rounded-md bg-amber-500 px-4 text-sm font-black text-white">
                    بدء طلب
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </Panel>
      </div>

      <PopupForm open={tableFormOpen} onClose={closeTableForm} title="تعديل الطاولة" maxWidth="md">
        <form onSubmit={saveTable} className="grid gap-3">
          <Field label="الاسم/الرقم" value={tableForm.name} onChange={(name) => setTableForm({ ...tableForm, name })} />
          <Field label="المنطقة" value={tableForm.area} onChange={(area) => setTableForm({ ...tableForm, area })} />
          <Field label="السعة" type="number" min="1" value={tableForm.capacity} onChange={(capacity) => setTableForm({ ...tableForm, capacity: Number(capacity) })} />
          <SelectField label="الحالة" value={tableForm.status} options={tableStatuses.map(option)} onChange={(status) => setTableForm({ ...tableForm, status })} />
          <Field label="QR" value={tableForm.qrCode} onChange={(qrCode) => setTableForm({ ...tableForm, qrCode })} />
          <div className="flex gap-2">
            <PrimaryButton>حفظ الطاولة</PrimaryButton>
            <SecondaryButton onClick={closeTableForm}>إلغاء</SecondaryButton>
          </div>
        </form>
      </PopupForm>

      <PopupForm open={startOrderOpen} onClose={closeStartOrder} title="بدء طلب" description={table ? `الطاولة: ${table.name}` : undefined} maxWidth="xl">
        <form onSubmit={createOrder} className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-black">
              الطاولة: {table?.name ?? tableId}
            </div>
            <Field label="اسم الطلب" value={startOrderForm.name} onChange={updateStartOrderName} />
            <SelectField label="نوع الطلب" value={startOrderForm.type} options={orderTypes.map(option)} onChange={(type) => setStartOrderForm({ ...startOrderForm, type })} />
            <Field label="التاريخ" type="date" value={startOrderForm.orderedDate} onChange={(orderedDate) => setStartOrderForm({ ...startOrderForm, orderedDate })} />
            <Field label="الوقت" type="time" value={startOrderForm.orderedTime} onChange={updateStartOrderTime} />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="grid gap-1 text-sm font-black">
              <span>بحث عن صنف</span>
              <input
                value={startItemQuery}
                onChange={(event) => setStartItemQuery(event.target.value)}
                placeholder="ابحث عن صنف..."
                className="h-11 rounded-md border border-slate-200 bg-white px-3 font-bold outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
              />
            </label>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
              {startCategoryTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveStartCategoryId(tab.id)}
                  className={`shrink-0 rounded-full border px-3 py-2 text-xs font-black transition ${
                    activeStartCategoryId === tab.id
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50"
                  }`}
                >
                  {tab.name} ({formatInteger(tab.count)})
                </button>
              ))}
            </div>
            <div className="mt-3 max-h-[320px] overflow-y-auto pe-1">
              {menuItems.length ? (
                visibleStartMenuItems.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {visibleStartMenuItems.map((item) => {
                      const hasRecipe = recipes.some((entry) => entry.menuItemId === item.id);

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => addStartItemToCart(item)}
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
              <p className="text-xs font-black text-slate-500">{formatInteger(startCart.length)} صنف</p>
            </div>
            <div className="grid gap-2 p-3">
              {startCart.length ? startCart.map((line, index) => (
                <div key={`${line.menuItemId}-${index}`} className="grid gap-2 rounded-md bg-slate-50 p-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-black">{line.name}</p>
                      <p className="text-xs font-bold text-slate-500">{money(line.unitPrice * line.quantity, state.restaurant?.currency)}</p>
                    </div>
                    <DangerButton onClick={() => setStartCart((current) => current.filter((_, lineIndex) => lineIndex !== index))}>حذف</DangerButton>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[100px_1fr]">
                    <Field label="الكمية" type="number" min="1" value={line.quantity} onChange={(quantity) => updateStartCartLine(index, { quantity: Number(quantity) })} />
                    <Field label="ملاحظة" value={line.notes} onChange={(notes) => updateStartCartLine(index, { notes })} />
                  </div>
                </div>
              )) : <Empty title="السلة فارغة" text="أضف صنفًا أو أكثر قبل إنشاء الطلب." />}
            </div>
            <div className="border-t border-slate-100 p-3 text-sm font-black">
              الإجمالي قبل الرسوم: {money(startCartSubTotal, state.restaurant?.currency)}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="خصم" type="number" min="0" value={startOrderForm.discount} onChange={(discount) => setStartOrderForm({ ...startOrderForm, discount: Number(discount) })} />
            <Field label="ضريبة" type="number" min="0" value={startOrderForm.tax} onChange={(tax) => setStartOrderForm({ ...startOrderForm, tax: Number(tax) })} />
            <Field label="خدمة" type="number" min="0" value={startOrderForm.serviceCharge} onChange={(serviceCharge) => setStartOrderForm({ ...startOrderForm, serviceCharge: Number(serviceCharge) })} />
          </div>
          <SelectField label="طريقة الدفع" value={startOrderForm.paymentMethod} options={paymentMethods.map(option)} onChange={(paymentMethod) => setStartOrderForm({ ...startOrderForm, paymentMethod })} />
          <TextArea label="ملاحظات الطلب" value={startOrderForm.notes} onChange={(notes) => setStartOrderForm({ ...startOrderForm, notes })} />
          <PrimaryButton disabled={!startCart.length}>بدء الطلب</PrimaryButton>
        </form>
      </PopupForm>
    </OpsShell>
  );
}

function TableFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function emptyStartOrderForm(tableId: string, tableName = ""): StartOrderForm {
  const { date, time } = localDateTimeParts();
  return {
    tableId,
    type: "DINE_IN",
    source: "POS",
    name: defaultOrderName(tableName, time),
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
  return `${tableName || "طلب"} - ${time || localDateTimeParts().time}`;
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
