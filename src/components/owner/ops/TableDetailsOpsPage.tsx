"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { AppBadge, AppButton, AppEmptyState, AppFieldShell, AppInput, AppPageHeader, AppSelect, AppSurface, AppTextarea, PopupForm, cn } from "@/components/shared";
import { formatInteger } from "@/lib/format";
import { useLiveQuery } from "@/offline/hooks/useLiveQuery";
import { cancelLocalOrder, completeLocalOrder, createLocalOrder, getLocalOrder, hydrateOrders, updateLocalOrder, type OrderCreateInput } from "@/offline/repositories/orders";
import { hydrateReferenceData, listLocalCashRegisters, listLocalCategories, listLocalMenuItems, listLocalRecipeIngredients } from "@/offline/repositories/reference-data";
import { getLocalTable, hydrateTables, listLocalTables, saveLocalTable, type OfflineContext } from "@/offline/repositories/tables";
import type { Category, MenuItem } from "@/types/menu";
import type { CashRegister, OpsOrder, OpsTable, OrderStatus, PaymentMethod, RecipeIngredient } from "@/types/ops";
import { money, OrderStatusActions, orderStatusLabels, OpsShell, paymentAmountForMethod, useOpsPage } from "./OpsShared";
import { OrderReceiptPrintButton } from "./OrderReceiptPrintButton";
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

type CompleteCurrentOrderConfirmation = {
  order: OpsOrder;
  paymentMethod: PaymentMethod;
  paidAmount: number;
  cashRegisterId: string;
  note: string;
};

const moveOrderMessageKey = "ops-table-order-move-message";

export function TableDetailsOpsPage({ tableId }: { tableId: string }) {
  const router = useRouter();
  const state = useOpsPage("tables");
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
  const [moveOrderOpen, setMoveOrderOpen] = useState(false);
  const [moveTargetTableId, setMoveTargetTableId] = useState("");
  const [pendingMoveTable, setPendingMoveTable] = useState<OpsTable | null>(null);
  const [pendingCompleteOrder, setPendingCompleteOrder] = useState<CompleteCurrentOrderConfirmation | null>(null);
  const tenantId = state.restaurant?.id ?? "";
  const offlineContext = useMemo<OfflineContext | null>(() => {
    if (!state.token || !tenantId) return null;
    return { token: state.token, tenantId, userId: state.restaurant?.ownerUserId ?? "owner" };
  }, [state.restaurant?.ownerUserId, state.token, tenantId]);
  const { value: table } = useLiveQuery(() => tenantId ? getLocalTable(tenantId, tableId) : Promise.resolve(null), null as OpsTable | null, [tenantId, tableId]);
  const { value: tables } = useLiveQuery(() => tenantId ? listLocalTables(tenantId) : Promise.resolve([]), [] as OpsTable[], [tenantId]);
  const { value: order } = useLiveQuery(() => tenantId && table?.currentOrderId ? getLocalOrder(tenantId, table.currentOrderId) : Promise.resolve(null), null as OpsOrder | null, [tenantId, table?.currentOrderId]);
  const { value: menuItems } = useLiveQuery(() => tenantId ? listLocalMenuItems(tenantId) : Promise.resolve([]), [] as MenuItem[], [tenantId]);
  const { value: categories } = useLiveQuery(() => tenantId ? listLocalCategories(tenantId) : Promise.resolve([]), [] as Category[], [tenantId]);
  const { value: recipes } = useLiveQuery(() => tenantId ? listLocalRecipeIngredients(tenantId) : Promise.resolve([]), [] as RecipeIngredient[], [tenantId]);
  const { value: cashRegisters } = useLiveQuery(() => tenantId ? listLocalCashRegisters(tenantId) : Promise.resolve([]), [] as CashRegister[], [tenantId]);

  const lockedOrder = Boolean(order && (["COMPLETED", "CANCELLED"].includes(order.status) || order.invoiceId || order.paymentId));
  const canStartOrder = Boolean(table && !table.currentOrderId && !order && state.modules?.orders);
  const currentOrderTableId = order?.tableId || tableId;
  const eligibleMoveTables = useMemo(() => {
    return tables.filter((entry) => entry.id !== currentOrderTableId && entry.status !== "DISABLED" && !entry.currentOrderId);
  }, [currentOrderTableId, tables]);
  const previewTotal = useMemo(() => {
    const subTotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    return Math.max(subTotal - orderForm.discount + orderForm.tax + orderForm.serviceCharge, 0);
  }, [lines, orderForm.discount, orderForm.tax, orderForm.serviceCharge]);
  const startCartSubTotal = startCart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

  useEffect(() => {
    if (offlineContext && state.modules?.tables) void load();
  }, [offlineContext, state.modules?.tables, tableId]);

  useEffect(() => {
    if (table) hydrateTableForm(table);
  }, [table]);

  useEffect(() => {
    setDraftLine((current) => ({ ...current, menuItemId: current.menuItemId || menuItems[0]?.id || "" }));
  }, [menuItems]);

  useEffect(() => {
    if (order) {
      hydrateOrderForms(order);
    } else {
      setLines([]);
    }
  }, [order, cashRegisters]);

  async function load() {
    if (!offlineContext) return;
    await Promise.all([
      hydrateTables(offlineContext),
      hydrateOrders(offlineContext),
      hydrateReferenceData(offlineContext, { inventory: state.modules?.inventory, accounting: state.modules?.accounting })
    ]);

    const moveMessage = window.sessionStorage.getItem(moveOrderMessageKey);
    if (moveMessage) {
      window.sessionStorage.removeItem(moveOrderMessageKey);
      state.setMessage(moveMessage);
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

  function hydrateOrderForms(nextOrder: OpsOrder) {
    setOrderForm({
      name: nextOrder.name || nextOrder.id,
      tableId: nextOrder.tableId || table?.id || tableId,
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
      cashRegisterId: current.cashRegisterId || cashRegisters[0]?.id || "",
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
      if (!offlineContext || !table) return;
      await saveLocalTable(offlineContext, {
        id: table.id,
        name: tableForm.name,
        area: tableForm.area,
        capacity: tableForm.capacity,
        status: tableForm.status as OpsTable["status"],
        currentOrderId: table.currentOrderId,
        qrCode: tableForm.qrCode
      });
      setTableFormOpen(false);
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
      if (!offlineContext) return;
      await createLocalOrder(offlineContext, buildStartOrderCreateInput(startOrderForm, startCart));
      closeStartOrder();
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
      if (!offlineContext) return;
      await updateLocalOrder(offlineContext, order.id, {
        name: orderForm.name,
        tableId: orderForm.tableId,
        type: orderForm.type as OpsOrder["type"],
        discount: orderForm.discount,
        tax: orderForm.tax,
        serviceCharge: orderForm.serviceCharge,
        paymentMethod: orderForm.paymentMethod as PaymentMethod,
        notes: orderForm.notes,
        items: lines.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity, notes: line.notes, modifiers: line.modifiers }))
      });
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

  function openMoveOrder() {
    if (!order || lockedOrder) return;
    const firstTargetId = eligibleMoveTables[0]?.id || "";
    setMoveTargetTableId(firstTargetId);
    setMoveOrderOpen(true);
  }

  function closeMoveOrder() {
    setMoveOrderOpen(false);
    setMoveTargetTableId("");
    setPendingMoveTable(null);
  }

  function closeMoveConfirmation() {
    setPendingMoveTable(null);
    setMoveOrderOpen(true);
  }

  async function moveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order || lockedOrder) return;

    const targetTable = eligibleMoveTables.find((entry) => entry.id === moveTargetTableId);
    if (!targetTable) {
      state.setMessage("اختر طاولة فارغة ومتاحة لنقل الطلب.");
      return;
    }
    setMoveOrderOpen(false);
    setPendingMoveTable(targetTable);
  }

  async function confirmMoveOrder() {
    if (!order || lockedOrder || !pendingMoveTable) return;
    const targetTable = pendingMoveTable;
    await runOrderAction(async () => {
      if (!offlineContext) return;
      await updateLocalOrder(offlineContext, order.id, { tableId: targetTable.id });
      const message = `تم نقل الطلب إلى الطاولة ${targetTable.name}.`;
      window.sessionStorage.setItem(moveOrderMessageKey, message);
      closeMoveOrder();
      state.setMessage(message);
      router.push(`/owner/operations/tables/${targetTable.id}`);
    });
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
      if (!offlineContext) return;
      await updateLocalOrder(offlineContext, order.id, { status });
    });
  }

  async function completeCurrentOrder() {
    if (!order || lockedOrder) return;
    const paidAmount = paymentAmountForMethod(completeForm.paymentMethod as PaymentMethod, order.total, completeForm.paidAmount);
    if (completeForm.paymentMethod === "SPLIT" && paidAmount <= 0) {
      state.setMessage("أدخل المبلغ المدفوع قبل إنهاء طلب الدفع المقسّم.");
      return;
    }
    setPendingCompleteOrder({
      order,
      paymentMethod: completeForm.paymentMethod as PaymentMethod,
      paidAmount,
      cashRegisterId: completeForm.cashRegisterId,
      note: completeForm.note
    });
  }

  async function confirmCompleteCurrentOrder() {
    if (!pendingCompleteOrder) return;
    const { order, paymentMethod, paidAmount, cashRegisterId, note } = pendingCompleteOrder;
    await runOrderAction(async () => {
      if (!offlineContext) return;
      await completeLocalOrder(offlineContext, order.id, {
        paymentMethod,
        paidAmount,
        cashRegisterId: cashRegisterId || undefined,
        note
      });
      setPendingCompleteOrder(null);
    });
  }

  async function cancelCurrentOrder() {
    if (!order || lockedOrder) return;
    const reason = window.prompt("سبب الإلغاء") || "";
    if (!reason.trim()) return;

    await runOrderAction(async () => {
      if (!offlineContext) return;
      await cancelLocalOrder(offlineContext, order.id, reason);
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
      <AppPageHeader
        className="mb-4"
        title={table ? `الطاولة ${table.name}` : "تفاصيل الطاولة"}
        description="متابعة حالة الطاولة والطلب المفتوح عليها."
        primaryAction={table ? (
          <div className="flex flex-wrap gap-2">
            {canStartOrder ? <AppButton type="button" onClick={openStartOrder}>بدء طلب</AppButton> : null}
            <AppButton type="button" variant="secondary" onClick={openTableForm}>تعديل الطاولة</AppButton>
          </div>
        ) : null}
        secondaryActions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/owner/operations/tables" className="inline-flex h-10 items-center rounded-app-md border border-app-border bg-app-surface px-3 text-sm font-semibold text-app-ink transition-colors hover:bg-app-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft">
              العودة للطاولات
            </Link>
            {table ? <TableStatusBadge status={table.status} /> : null}
          </div>
        }
      />

      <AppSurface className="p-4">
        {table ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <h2 className="w-full text-center text-4xl font-semibold text-app-ink">
                <div className="inline-block select-none rounded-app-md border border-app-border bg-app-surface-muted px-4 py-2">
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
            <TableStatusBadge status={table.status} />
          </div>
        ) : <AppEmptyState title="لم يتم العثور على الطاولة" description="تحقق من الرابط أو ارجع لقائمة الطاولات." />}
      </AppSurface>

      <div className="mt-4">
        <AppSurface className="p-4">
          <div className="mb-4">
            <h2 className="text-app-panel-title font-semibold text-app-ink">الطلب على الطاولة</h2>
          </div>
          {order ? (
            <form onSubmit={saveOrder} className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2 rounded-app-lg border border-app-border bg-app-surface p-2">
                <div className="min-w-44 flex-1">
                  <p className="truncate text-sm font-semibold text-app-ink">{order.name || order.id}</p>
                  <p className="mt-0.5 truncate text-app-helper text-app-muted">#{order.id}</p>
                </div>
                <div className="rounded-app-md bg-app-surface-muted px-3 py-2 text-app-meta font-semibold text-app-ink">
                  {money(order.total, state.restaurant?.currency)}
                </div>
                <OrderStatusBadge status={order.status} />
                <label className="flex h-10 min-w-56 flex-1 items-center gap-2 rounded-app-md border border-app-border bg-app-surface px-2 text-app-helper font-semibold text-app-muted focus-within:border-app-primary focus-within:ring-4 focus-within:ring-app-primary-soft">
                  <span className="shrink-0">اسم الطلب</span>
                  <input
                    value={orderForm.name}
                    onChange={(event) => setOrderForm({ ...orderForm, name: event.target.value })}
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-app-ink outline-none"
                  />
                </label>
                <label className="flex h-10 min-w-44 items-center gap-2 rounded-app-md border border-app-border bg-app-surface px-2 text-app-helper font-semibold text-app-muted focus-within:border-app-primary focus-within:ring-4 focus-within:ring-app-primary-soft">
                  <span className="shrink-0">نوع الطلب</span>
                  <select
                    value={orderForm.type}
                    onChange={(event) => setOrderForm({ ...orderForm, type: event.target.value })}
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-app-ink outline-none"
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
                <OrderReceiptPrintButton order={order} restaurant={state.restaurant} table={table} token={state.token} disabled={!order.items.length} />
                {!lockedOrder ? <AppButton type="button" variant="secondary" size="sm" onClick={openMoveOrder}>نقل الطلب</AppButton> : null}
              </div>

              {lockedOrder ? (
                <p className="rounded-app-md border border-app-warning-soft bg-app-warning-soft px-3 py-2 text-app-helper font-semibold text-app-warning">
                  الطلب مغلق ماليًا. يمكن عرض التفاصيل، لكن لا يمكن تعديل البنود بعد الإتمام أو الإلغاء أو إنشاء الفاتورة.
                </p>
              ) : null}

              {!lockedOrder ? (
                <div className="rounded-app-lg border border-app-border bg-app-surface-muted p-3">
                  <div className="grid gap-3 md:grid-cols-[1fr_215px] ">
                    <AppFieldShell label="إضافة صنف">
                      <AppSelect value={draftLine.menuItemId} onChange={(event) => setDraftLine({ ...draftLine, menuItemId: event.target.value })}>
                        {menuItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} - {money(item.price, state.restaurant?.currency)}
                          </option>
                        ))}
                      </AppSelect>
                    </AppFieldShell>
                    <AppFieldShell label="الكمية">
                      <AppInput type="number" min="1" value={draftLine.quantity} onChange={(event) => setDraftLine({ ...draftLine, quantity: Number(event.target.value) })} />
                    </AppFieldShell>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                    <AppFieldShell label="ملاحظة الصنف">
                      <AppInput value={draftLine.notes} onChange={(event) => setDraftLine({ ...draftLine, notes: event.target.value })} />
                    </AppFieldShell>
                    <AppButton type="button" variant="secondary" onClick={addLine}>إضافة</AppButton>
                  </div>
                </div>
              ) : null}

              {lines.length ? (
                <div className="overflow-x-auto rounded-app-lg border border-app-border bg-app-surface">
                  <table className="w-full min-w-[720px] text-app-table">
                    <thead className="bg-app-surface-muted text-app-meta text-app-muted">
                      <tr className="[&>th]:border-b [&>th]:border-app-border [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-start [&>th]:font-semibold">
                        <th>الصنف</th>
                        <th>السعر</th>
                        <th className="w-28">الكمية</th>
                        <th>ملاحظة</th>
                        <th>الإجمالي</th>
                        {!lockedOrder ? <th className="w-20">إجراء</th> : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-app-border">
                      {lines.map((line, index) => (
                        <tr key={`${line.menuItemId}-${index}`} className="align-top transition-colors hover:bg-app-surface-muted">
                          <td className="px-3 py-3">
                            <p className="font-semibold text-app-ink">{line.name}</p>
                            {state.modules?.inventory && !recipes.some((entry) => entry.menuItemId === line.menuItemId) ? (
                              <p className="mt-1 text-app-helper font-semibold text-app-warning">لا توجد مكونات مخزون مرتبطة بهذا الصنف.</p>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-medium text-app-muted">{money(line.unitPrice, state.restaurant?.currency)}</td>
                          <td className="px-3 py-3">
                            {lockedOrder ? (
                              <span className="font-semibold text-app-ink">{formatInteger(line.quantity)}</span>
                            ) : (
                              <AppInput
                                type="number"
                                min="1"
                                value={line.quantity}
                                onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })}
                                className="h-9 w-20"
                              />
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {lockedOrder ? (
                              <span className="font-medium text-app-muted">{line.notes || "-"}</span>
                            ) : (
                              <AppInput
                                value={line.notes}
                                onChange={(event) => updateLine(index, { notes: event.target.value })}
                                className="h-9 min-w-44"
                              />
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-semibold text-app-ink">{money(line.unitPrice * line.quantity, state.restaurant?.currency)}</td>
                          {!lockedOrder ? (
                            <td className="px-3 py-3">
                              <AppButton
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}
                                className="text-app-danger hover:bg-app-danger-soft"
                              >
                                حذف
                              </AppButton>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <AppEmptyState title="لا توجد بنود" description="أضف صنفًا واحدًا على الأقل إلى الطلب." />}

              <div className="grid gap-3 md:grid-cols-4">
                <AppFieldShell label="خصم">
                  <AppInput type="number" min="0" value={orderForm.discount} onChange={(event) => setOrderForm({ ...orderForm, discount: Number(event.target.value) })} />
                </AppFieldShell>
                <AppFieldShell label="ضريبة">
                  <AppInput type="number" min="0" value={orderForm.tax} onChange={(event) => setOrderForm({ ...orderForm, tax: Number(event.target.value) })} />
                </AppFieldShell>
                <AppFieldShell label="خدمة">
                  <AppInput type="number" min="0" value={orderForm.serviceCharge} onChange={(event) => setOrderForm({ ...orderForm, serviceCharge: Number(event.target.value) })} />
                </AppFieldShell>
                <AppFieldShell label="طريقة الدفع">
                  <AppSelect value={orderForm.paymentMethod} onChange={(event) => setOrderForm({ ...orderForm, paymentMethod: event.target.value })}>
                    {paymentMethods.map((method) => <option key={method} value={method}>{option(method).label}</option>)}
                  </AppSelect>
                </AppFieldShell>
              </div>
              {!lockedOrder ? (
                <div className="grid gap-3 rounded-app-lg border border-app-success-soft bg-app-success-soft p-3 md:grid-cols-4">
                  <AppFieldShell label="طريقة الدفع عند الإنهاء">
                    <AppSelect value={completeForm.paymentMethod} onChange={(event) => setCompleteForm({ ...completeForm, paymentMethod: event.target.value, paidAmount: event.target.value === "DEBT" ? 0 : order.total })}>
                      {paymentMethods.map((method) => <option key={method} value={method}>{option(method).label}</option>)}
                    </AppSelect>
                  </AppFieldShell>
                  <AppFieldShell label="المدفوع">
                    <AppInput type="number" min="0" value={completeForm.paidAmount} onChange={(event) => setCompleteForm({ ...completeForm, paidAmount: Number(event.target.value) })} />
                  </AppFieldShell>
                  {cashRegisters.length ? (
                    <AppFieldShell label="الصندوق">
                      <AppSelect value={completeForm.cashRegisterId} onChange={(event) => setCompleteForm({ ...completeForm, cashRegisterId: event.target.value })}>
                        <option value="">بدون صندوق</option>
                        {cashRegisters.map((register) => (
                          <option key={register.id} value={register.id}>
                            {register.name} - {money(register.currentBalance, state.restaurant?.currency)}
                          </option>
                        ))}
                      </AppSelect>
                    </AppFieldShell>
                  ) : (
                    <AppFieldShell label="الصندوق">
                      <AppInput value={completeForm.cashRegisterId} onChange={(event) => setCompleteForm({ ...completeForm, cashRegisterId: event.target.value })} />
                    </AppFieldShell>
                  )}
                  <AppFieldShell label="ملاحظة الدفع">
                    <AppInput value={completeForm.note} onChange={(event) => setCompleteForm({ ...completeForm, note: event.target.value })} />
                  </AppFieldShell>
                </div>
              ) : null}
              <AppFieldShell label="ملاحظات الطلب">
                <AppTextarea value={orderForm.notes} onChange={(event) => setOrderForm({ ...orderForm, notes: event.target.value })} />
              </AppFieldShell>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-app-lg border border-app-border bg-app-surface-muted p-3">
                <p className="font-semibold text-app-ink">الإجمالي المتوقع: {money(previewTotal, state.restaurant?.currency)}</p>
                <AppButton type="submit" disabled={lockedOrder || !lines.length}>حفظ الطلب</AppButton>
              </div>
            </form>
          ) : (
            <div className="grid gap-3">
              <AppEmptyState title="لا يوجد طلب مفتوح" description="هذه الطاولة لا تحتوي على طلب مفتوح حاليًا." />
              {canStartOrder ? (
                <div className="flex justify-center">
                  <AppButton type="button" onClick={openStartOrder}>بدء طلب</AppButton>
                </div>
              ) : null}
            </div>
          )}
        </AppSurface>
      </div>

      <PopupForm open={tableFormOpen} onClose={closeTableForm} title="تعديل الطاولة" maxWidth="md">
        <form onSubmit={saveTable} className="grid gap-3">
          <AppFieldShell label="الاسم/الرقم">
            <AppInput value={tableForm.name} onChange={(event) => setTableForm({ ...tableForm, name: event.target.value })} />
          </AppFieldShell>
          <AppFieldShell label="المنطقة">
            <AppInput value={tableForm.area} onChange={(event) => setTableForm({ ...tableForm, area: event.target.value })} />
          </AppFieldShell>
          <AppFieldShell label="السعة">
            <AppInput type="number" min="1" value={tableForm.capacity} onChange={(event) => setTableForm({ ...tableForm, capacity: Number(event.target.value) })} />
          </AppFieldShell>
          <AppFieldShell label="الحالة">
            <AppSelect value={tableForm.status} onChange={(event) => setTableForm({ ...tableForm, status: event.target.value })}>
              {tableStatuses.map((status) => <option key={status} value={status}>{option(status).label}</option>)}
            </AppSelect>
          </AppFieldShell>
          <AppFieldShell label="QR">
            <AppInput value={tableForm.qrCode} onChange={(event) => setTableForm({ ...tableForm, qrCode: event.target.value })} />
          </AppFieldShell>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <AppButton type="button" variant="secondary" onClick={closeTableForm} className="w-full sm:w-auto">إلغاء</AppButton>
            <AppButton type="submit" className="w-full sm:w-auto">حفظ الطاولة</AppButton>
          </div>
        </form>
      </PopupForm>

      <PopupForm open={moveOrderOpen} onClose={closeMoveOrder} title="نقل الطلب" description={order && table ? `نقل ${order.name || order.id} من الطاولة ${table.name}` : undefined} maxWidth="md">
        {eligibleMoveTables.length ? (
          <form onSubmit={moveOrder} className="grid gap-3">
            <AppFieldShell label="الطاولة الجديدة">
              <AppSelect value={moveTargetTableId} onChange={(event) => setMoveTargetTableId(event.target.value)}>
                {eligibleMoveTables.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} - {entry.area || "بدون منطقة"} - {entry.capacity} مقاعد
                  </option>
                ))}
              </AppSelect>
            </AppFieldShell>
            <p className="rounded-app-md border border-app-border bg-app-surface-muted px-3 py-2 text-app-helper font-semibold text-app-muted">
              سيتم نقل الطلب بكل تفاصيله إلى الطاولة المختارة، ولن يتم تغيير البنود أو الإجماليات.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <AppButton type="button" variant="secondary" onClick={closeMoveOrder} className="w-full sm:w-auto">إلغاء</AppButton>
              <AppButton type="submit" disabled={!moveTargetTableId || orderActionBusy} className="w-full sm:w-auto">تأكيد النقل</AppButton>
            </div>
          </form>
        ) : (
          <div className="grid gap-3">
            <AppEmptyState title="لا توجد طاولات فارغة" description="كل الطاولات المتاحة مشغولة أو معطلة حاليًا." />
            <div className="flex justify-end">
              <AppButton type="button" variant="secondary" onClick={closeMoveOrder}>إغلاق</AppButton>
            </div>
          </div>
        )}
      </PopupForm>

      <PopupForm open={startOrderOpen} onClose={closeStartOrder} title="بدء طلب" description={table ? `الطاولة: ${table.name}` : undefined} maxWidth="xl">
        <form onSubmit={createOrder} className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-app-md border border-app-border bg-app-surface-muted p-3 text-app-body font-semibold text-app-ink">
              الطاولة: {table?.name ?? tableId}
            </div>
            <AppFieldShell label="اسم الطلب">
              <AppInput value={startOrderForm.name} onChange={(event) => updateStartOrderName(event.target.value)} />
            </AppFieldShell>
            <AppFieldShell label="نوع الطلب">
              <AppSelect value={startOrderForm.type} onChange={(event) => setStartOrderForm({ ...startOrderForm, type: event.target.value })}>
                {orderTypes.map((type) => <option key={type} value={type}>{option(type).label}</option>)}
              </AppSelect>
            </AppFieldShell>
            <AppFieldShell label="التاريخ">
              <AppInput type="date" value={startOrderForm.orderedDate} onChange={(event) => setStartOrderForm({ ...startOrderForm, orderedDate: event.target.value })} />
            </AppFieldShell>
            <AppFieldShell label="الوقت">
              <AppInput type="time" value={startOrderForm.orderedTime} onChange={(event) => updateStartOrderTime(event.target.value)} />
            </AppFieldShell>
          </div>

          <div className="rounded-app-lg border border-app-border bg-app-surface-muted p-3">
            <AppFieldShell label="بحث عن صنف">
              <AppInput value={startItemQuery} onChange={(event) => setStartItemQuery(event.target.value)} placeholder="ابحث عن صنف..." />
            </AppFieldShell>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
              {startCategoryTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveStartCategoryId(tab.id)}
                  className={cn(
                    "shrink-0 rounded-app-md border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft",
                    activeStartCategoryId === tab.id
                      ? "border-app-primary bg-app-primary-soft text-app-primary"
                      : "border-app-border bg-app-surface text-app-muted hover:border-app-border-strong hover:bg-app-surface-muted hover:text-app-ink"
                  )}
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
              <p className="text-app-meta text-app-muted">{formatInteger(startCart.length)} صنف</p>
            </div>
            <div className="grid gap-2 p-3">
              {startCart.length ? startCart.map((line, index) => (
                <div key={`${line.menuItemId}-${index}`} className="grid gap-2 rounded-app-md bg-app-surface-muted p-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-app-ink">{line.name}</p>
                      <p className="text-app-helper text-app-muted">{money(line.unitPrice * line.quantity, state.restaurant?.currency)}</p>
                    </div>
                    <AppButton type="button" variant="ghost" size="sm" onClick={() => setStartCart((current) => current.filter((_, lineIndex) => lineIndex !== index))} className="text-app-danger hover:bg-app-danger-soft">حذف</AppButton>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[100px_1fr]">
                    <AppFieldShell label="الكمية">
                      <AppInput type="number" min="1" value={line.quantity} onChange={(event) => updateStartCartLine(index, { quantity: Number(event.target.value) })} />
                    </AppFieldShell>
                    <AppFieldShell label="ملاحظة">
                      <AppInput value={line.notes} onChange={(event) => updateStartCartLine(index, { notes: event.target.value })} />
                    </AppFieldShell>
                  </div>
                </div>
              )) : <AppEmptyState title="السلة فارغة" description="أضف صنفًا أو أكثر قبل إنشاء الطلب." />}
            </div>
            <div className="border-t border-app-border p-3 text-sm font-semibold text-app-ink">
              الإجمالي قبل الرسوم: {money(startCartSubTotal, state.restaurant?.currency)}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <AppFieldShell label="خصم">
              <AppInput type="number" min="0" value={startOrderForm.discount} onChange={(event) => setStartOrderForm({ ...startOrderForm, discount: Number(event.target.value) })} />
            </AppFieldShell>
            <AppFieldShell label="ضريبة">
              <AppInput type="number" min="0" value={startOrderForm.tax} onChange={(event) => setStartOrderForm({ ...startOrderForm, tax: Number(event.target.value) })} />
            </AppFieldShell>
            <AppFieldShell label="خدمة">
              <AppInput type="number" min="0" value={startOrderForm.serviceCharge} onChange={(event) => setStartOrderForm({ ...startOrderForm, serviceCharge: Number(event.target.value) })} />
            </AppFieldShell>
          </div>
          <AppFieldShell label="طريقة الدفع">
            <AppSelect value={startOrderForm.paymentMethod} onChange={(event) => setStartOrderForm({ ...startOrderForm, paymentMethod: event.target.value })}>
              {paymentMethods.map((method) => <option key={method} value={method}>{option(method).label}</option>)}
            </AppSelect>
          </AppFieldShell>
          <AppFieldShell label="ملاحظات الطلب">
            <AppTextarea value={startOrderForm.notes} onChange={(event) => setStartOrderForm({ ...startOrderForm, notes: event.target.value })} />
          </AppFieldShell>
          <AppButton type="submit" disabled={!startCart.length}>بدء الطلب</AppButton>
        </form>
      </PopupForm>

      <PopupForm
        open={Boolean(pendingMoveTable)}
        onClose={closeMoveConfirmation}
        title="نقل الطلب إلى طاولة أخرى؟"
        description={order && pendingMoveTable ? `نقل ${order.name || order.id} إلى الطاولة ${pendingMoveTable.name}.` : undefined}
        maxWidth="sm"
      >
        <div className="grid gap-4">
          <p className="text-app-body leading-7 text-app-muted">سيبقى الطلب بكل تفاصيله وبنوده وإجمالياته كما هو.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AppButton type="button" variant="secondary" onClick={closeMoveConfirmation} disabled={orderActionBusy} className="w-full sm:w-auto">
              إلغاء
            </AppButton>
            <AppButton type="button" data-autofocus onClick={() => void confirmMoveOrder()} loading={orderActionBusy} disabled={orderActionBusy} className="w-full sm:w-auto">
              نقل الطلب
            </AppButton>
          </div>
        </div>
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
            <AppButton type="button" variant="secondary" onClick={() => setPendingCompleteOrder(null)} disabled={orderActionBusy} className="w-full sm:w-auto">
              إلغاء
            </AppButton>
            <AppButton type="button" data-autofocus onClick={() => void confirmCompleteCurrentOrder()} loading={orderActionBusy} disabled={orderActionBusy} className="w-full sm:w-auto">
              إكمال الطلب
            </AppButton>
          </div>
        </div>
      </PopupForm>
    </OpsShell>
  );
}

function TableFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-app-helper font-semibold text-app-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-app-ink">{value}</p>
    </div>
  );
}

function TableStatusBadge({ status }: { status: OpsTable["status"] }) {
  const variant = status === "AVAILABLE" ? "success" : status === "DISABLED" ? "danger" : "warning";
  return <AppBadge variant={variant}>{status}</AppBadge>;
}

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const variant = status === "COMPLETED" || status === "SERVED" ? "success" : status === "CANCELLED" ? "danger" : status === "PENDING" || status === "DRAFT" ? "warning" : "primary";
  return <AppBadge variant={variant}>{orderStatusLabels[status]}</AppBadge>;
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

function buildStartOrderCreateInput(form: StartOrderForm, cart: StartCartLine[]): OrderCreateInput {
  return {
    name: form.name,
    tableId: form.tableId,
    type: form.type as OpsOrder["type"],
    source: form.source as OpsOrder["source"],
    orderedAt: combineLocalDateTime(form.orderedDate, form.orderedTime),
    items: cart.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity, notes: line.notes, modifiers: line.modifiers })),
    discount: form.discount,
    tax: form.tax,
    serviceCharge: form.serviceCharge,
    paymentMethod: form.paymentMethod as PaymentMethod,
    notes: form.notes
  };
}
