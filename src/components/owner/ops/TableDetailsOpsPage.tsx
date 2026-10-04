"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, Minus, Plus, Search, StickyNote, Trash2 } from "lucide-react";
import { AppBadge, AppButton, AppEmptyState, AppFieldShell, AppInput, AppSelect, AppSurface, AppTextarea, PopupForm, cn } from "@/components/shared";
import { formatInteger } from "@/lib/format";
import { createActionGuard } from "@/offline/action-guard";
import { useLiveQuery } from "@/offline/hooks/useLiveQuery";
import { cancelLocalOrder, completeLocalOrder, createLocalOrder, getLocalOrder, hydrateOrders, listLocalOrders, updateLocalOrder, type OrderCreateInput } from "@/offline/repositories/orders";
import { hydrateReferenceData, listLocalCashRegisters, listLocalCategories, listLocalMenuItems, listLocalRecipeIngredients } from "@/offline/repositories/reference-data";
import { getLocalTable, hydrateTables, listLocalTables, saveLocalTable, type OfflineContext } from "@/offline/repositories/tables";
import type { Category, MenuItem, Restaurant } from "@/types/menu";
import type { CashRegister, OpsOrder, OpsTable, OrderStatus, PaymentMethod, RecipeIngredient } from "@/types/ops";
import { money, orderStatusLabels, OpsShell, paymentAmountForMethod, useOpsPage } from "./OpsShared";
import { OrderReceiptPrintButton } from "./OrderReceiptPrintButton";
import { formatActionError, option, orderTypes, paymentMethods, tableStatuses } from "./OpsPageShared";
import { addOrMergeOrderLine, lineItemsQuantity, lineItemsTotal, mergeOrderLines, updateLineQuantity } from "./table-details-line-merge";

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
const recentTableHistoryLimit = 8;

export function TableDetailsOpsPage({ tableId }: { tableId: string }) {
  const router = useRouter();
  const state = useOpsPage("tables");
  const [activeTableId, setActiveTableId] = useState(tableId);
  const [tableFormOpen, setTableFormOpen] = useState(false);
  const [tableForm, setTableForm] = useState({ name: "", area: "", capacity: 1, status: "AVAILABLE", qrCode: "" });
  const [orderForm, setOrderForm] = useState({ name: "", tableId: "", type: "DINE_IN", status: "PENDING", discount: 0, tax: 0, serviceCharge: 0, paymentMethod: "CASH", notes: "" });
  const [completeForm, setCompleteForm] = useState({ paymentMethod: "CASH", paidAmount: 0, cashRegisterId: "", note: "" });
  const [lines, setLines] = useState<OrderEditLine[]>([]);
  const [orderActionBusy, setOrderActionBusy] = useState(false);
  const orderActionGuard = useRef(createActionGuard());
  const [addItemsOpen, setAddItemsOpen] = useState(false);
  const [addItemQuery, setAddItemQuery] = useState("");
  const [activeAddCategoryId, setActiveAddCategoryId] = useState("all");
  const [addCart, setAddCart] = useState<OrderEditLine[]>([]);
  const [editingAddCartNoteIndex, setEditingAddCartNoteIndex] = useState<number | null>(null);
  const [addCartNoteDraft, setAddCartNoteDraft] = useState("");
  const [editingLineNoteIndex, setEditingLineNoteIndex] = useState<number | null>(null);
  const [lineNoteDraft, setLineNoteDraft] = useState("");
  const [orderNotesOpen, setOrderNotesOpen] = useState(false);
  const [orderDetailsOpen, setOrderDetailsOpen] = useState(false);
  const [startOrderOpen, setStartOrderOpen] = useState(false);
  const [startOrderForm, setStartOrderForm] = useState<StartOrderForm>(() => emptyStartOrderForm(tableId));
  const [startOrderNameTouched, setStartOrderNameTouched] = useState(false);
  const [startCart, setStartCart] = useState<StartCartLine[]>([]);
  const [startItemQuery, setStartItemQuery] = useState("");
  const [activeStartCategoryId, setActiveStartCategoryId] = useState("all");
  const [startDetailsOpen, setStartDetailsOpen] = useState(false);
  const [editingStartCartNoteIndex, setEditingStartCartNoteIndex] = useState<number | null>(null);
  const [startCartNoteDraft, setStartCartNoteDraft] = useState("");
  const [moveOrderOpen, setMoveOrderOpen] = useState(false);
  const [moveTargetTableId, setMoveTargetTableId] = useState("");
  const [pendingMoveTable, setPendingMoveTable] = useState<OpsTable | null>(null);
  const [pendingCompleteOrder, setPendingCompleteOrder] = useState<CompleteCurrentOrderConfirmation | null>(null);
  const [recentTableIds, setRecentTableIds] = useState<string[]>([]);
  const tenantId = state.restaurant?.id ?? "";
  const recentTablesKey = tenantId ? `ops-recent-tables:${tenantId}` : "";
  const offlineContext = useMemo<OfflineContext | null>(() => {
    if (!state.token || !tenantId) return null;
    return { token: state.token, tenantId, userId: state.restaurant?.ownerUserId ?? "owner" };
  }, [state.restaurant?.ownerUserId, state.token, tenantId]);
  const { value: selectedTable } = useLiveQuery(() => tenantId ? getLocalTable(tenantId, activeTableId) : Promise.resolve(null), null as OpsTable | null, [tenantId, activeTableId]);
  const { value: tables } = useLiveQuery(() => tenantId ? listLocalTables(tenantId) : Promise.resolve([]), [] as OpsTable[], [tenantId]);
  const table = useMemo(() => tables.find((entry) => entry.id === activeTableId) ?? (selectedTable?.id === activeTableId ? selectedTable : null), [activeTableId, selectedTable, tables]);
  const { value: selectedOrder } = useLiveQuery(() => tenantId && table?.currentOrderId ? getLocalOrder(tenantId, table.currentOrderId) : Promise.resolve(null), null as OpsOrder | null, [tenantId, table?.currentOrderId]);
  const { value: orders } = useLiveQuery(() => tenantId ? listLocalOrders(tenantId) : Promise.resolve([]), [] as OpsOrder[], [tenantId]);
  const { value: menuItems } = useLiveQuery(() => tenantId ? listLocalMenuItems(tenantId) : Promise.resolve([]), [] as MenuItem[], [tenantId]);
  const { value: categories } = useLiveQuery(() => tenantId ? listLocalCategories(tenantId) : Promise.resolve([]), [] as Category[], [tenantId]);
  const { value: recipes } = useLiveQuery(() => tenantId ? listLocalRecipeIngredients(tenantId) : Promise.resolve([]), [] as RecipeIngredient[], [tenantId]);
  const { value: cashRegisters } = useLiveQuery(() => tenantId ? listLocalCashRegisters(tenantId) : Promise.resolve([]), [] as CashRegister[], [tenantId]);

  const orderById = useMemo(() => new Map(orders.map((entry) => [entry.id, entry])), [orders]);
  const order = useMemo(() => {
    if (!table?.currentOrderId) return null;
    return orderById.get(table.currentOrderId) ?? (selectedOrder?.id === table.currentOrderId ? selectedOrder : null);
  }, [orderById, selectedOrder, table?.currentOrderId]);
  const lockedOrder = Boolean(order && (["COMPLETED", "CANCELLED"].includes(order.status) || order.invoiceId || order.paymentId));
  const canStartOrder = Boolean(table && !table.currentOrderId && !order && state.modules?.orders);
  const currentOrderTableId = order?.tableId || activeTableId;
  const eligibleMoveTables = useMemo(() => {
    return tables.filter((entry) => entry.id !== currentOrderTableId && entry.status !== "DISABLED" && !entry.currentOrderId);
  }, [currentOrderTableId, tables]);
  const previewTotal = useMemo(() => {
    const subTotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    return Math.max(subTotal - orderForm.discount + orderForm.tax + orderForm.serviceCharge, 0);
  }, [lines, orderForm.discount, orderForm.tax, orderForm.serviceCharge]);
  const startCartSubTotal = startCart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const startCartQuantity = lineItemsQuantity(startCart);
  const startCartQuantities = useMemo(() => {
    return startCart.reduce<Record<string, number>>((result, line) => {
      result[line.menuItemId] = (result[line.menuItemId] ?? 0) + line.quantity;
      return result;
    }, {});
  }, [startCart]);
  const addCartQuantity = lineItemsQuantity(addCart);
  const addCartTotal = lineItemsTotal(addCart);
  const addCartQuantities = useMemo(() => {
    return addCart.reduce<Record<string, number>>((result, line) => {
      result[line.menuItemId] = (result[line.menuItemId] ?? 0) + line.quantity;
      return result;
    }, {});
  }, [addCart]);
  const startPicker = useMenuPickerData(menuItems, categories, startItemQuery, activeStartCategoryId);
  const addPicker = useMenuPickerData(menuItems, categories, addItemQuery, activeAddCategoryId);
  const railTables = useMemo(() => sortTablesForNavigation(tables), [tables]);
  const lastTableId = recentTableIds.find((id) => id !== activeTableId) ?? "";
  const lastTable = tables.find((entry) => entry.id === lastTableId) ?? null;
  const lastTableOrder = lastTable?.currentOrderId ? orderById.get(lastTable.currentOrderId) ?? null : null;

  useEffect(() => {
    setActiveTableId(tableId);
  }, [tableId]);

  useEffect(() => {
    function handlePopState() {
      const nextTableId = tableIdFromPath(window.location.pathname);
      if (nextTableId) setActiveTableId(nextTableId);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (offlineContext && state.modules?.tables) void load();
  }, [offlineContext, state.modules?.tables]);

  useEffect(() => {
    if (!recentTablesKey) {
      setRecentTableIds([]);
      return;
    }

    setRecentTableIds(readRecentTableIds(recentTablesKey));
  }, [recentTablesKey]);

  useEffect(() => {
    if (!recentTablesKey || !activeTableId) return;

    setRecentTableIds(() => {
      const base = readRecentTableIds(recentTablesKey);
      const next = [activeTableId, ...base.filter((id) => id !== activeTableId)].slice(0, recentTableHistoryLimit);
      writeRecentTableIds(recentTablesKey, next);
      return next;
    });
  }, [recentTablesKey, activeTableId]);

  useEffect(() => {
    if (table) hydrateTableForm(table);
  }, [table]);

  useEffect(() => {
    if (table) markTableSwitch(`table-ready:${activeTableId}`);
  }, [activeTableId, table]);

  useEffect(() => {
    if (order) {
      hydrateOrderForms(order);
    } else {
      setLines([]);
    }
  }, [order, cashRegisters]);

  useEffect(() => {
    markTableSwitch(`order-ready:${activeTableId}:${order?.id ?? "none"}`);
  }, [activeTableId, order?.id]);

  useEffect(() => {
    markTableSwitch(`items-ready:${activeTableId}:${lines.length}`);
  }, [activeTableId, lines.length]);

  function switchTable(nextTableId: string) {
    if (!nextTableId || nextTableId === activeTableId) return;
    setActiveTableId(nextTableId);
    const nextPath = `/owner/operations/tables/${nextTableId}`;
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    markTableSwitch(`table:${nextTableId}`);
  }

  async function load() {
    if (!offlineContext) return;
    markTableSwitch("hydration-start");
    try {
      await Promise.all([
        hydrateTables(offlineContext),
        hydrateOrders(offlineContext),
        hydrateReferenceData(offlineContext, { inventory: state.modules?.inventory, accounting: state.modules?.accounting })
      ]);
    } finally {
      markTableSwitch("hydration-end");
    }

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
      tableId: nextOrder.tableId || table?.id || activeTableId,
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
    setOrderNotesOpen(Boolean(nextOrder.notes));
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
    setStartDetailsOpen(false);
    setEditingStartCartNoteIndex(null);
    setStartCartNoteDraft("");
    setStartOrderOpen(true);
  }

  function closeStartOrder() {
    setStartOrderOpen(false);
    setStartOrderForm(emptyStartOrderForm(table?.id ?? activeTableId, table?.name ?? ""));
    setStartOrderNameTouched(false);
    setStartCart([]);
    setStartItemQuery("");
    setActiveStartCategoryId("all");
    setStartDetailsOpen(false);
    setEditingStartCartNoteIndex(null);
    setStartCartNoteDraft("");
  }

  function openAddItems() {
    setAddCart([]);
    setAddItemQuery("");
    setActiveAddCategoryId("all");
    setAddItemsOpen(true);
  }

  function closeAddItems() {
    setAddItemsOpen(false);
    setAddCart([]);
    setEditingAddCartNoteIndex(null);
    setAddCartNoteDraft("");
  }

  function openOrderDetails() {
    setOrderDetailsOpen(true);
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!startCart.length) {
      state.setMessage("أضف صنفًا واحدًا على الأقل إلى الطلب.");
      return;
    }

    await runOrderAction(async () => {
      if (!offlineContext) throw new Error("تعذر تحديد المطعم الحالي.");
      await createLocalOrder(offlineContext, buildStartOrderCreateInput(startOrderForm, startCart));
      closeStartOrder();
    }, "تم إنشاء الطلب على الجهاز — بانتظار المزامنة");
  }

  function addStartItemToCart(item: MenuItem) {
    setStartCart((current) => addOrMergeOrderLine(current, menuItemToOrderLine(item)));
  }

  function updateStartCartQuantity(index: number, quantity: number) {
    setStartCart((current) => updateLineQuantity(current, index, quantity));
  }

  function openStartCartNote(index: number) {
    setEditingStartCartNoteIndex(index);
    setStartCartNoteDraft(startCart[index]?.notes ?? "");
  }

  function saveStartCartNote() {
    if (editingStartCartNoteIndex === null) return;
    setStartCart((current) => current.map((line, index) => (index === editingStartCartNoteIndex ? { ...line, notes: startCartNoteDraft } : line)));
    setEditingStartCartNoteIndex(null);
    setStartCartNoteDraft("");
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

    await runOrderAction(async () => {
      if (!offlineContext) throw new Error("تعذر تحديد المطعم الحالي.");
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
    }, "تم حفظ التعديلات على الجهاز — بانتظار المزامنة");
  }

  function menuItemToOrderLine(item: MenuItem, quantity = 1, notes = ""): OrderEditLine {
    return {
      menuItemId: item.id,
      name: item.name,
      quantity: Math.max(1, quantity),
      unitPrice: item.price,
      notes,
      modifiers: []
    };
  }

  function addMenuItemToAddCart(item: MenuItem) {
    setAddCart((current) => addOrMergeOrderLine(current, menuItemToOrderLine(item)));
  }

  function updateAddCartLine(index: number, quantity: number) {
    setAddCart((current) => updateLineQuantity(current, index, quantity));
  }

  function openAddCartNote(index: number) {
    setEditingAddCartNoteIndex(index);
    setAddCartNoteDraft(addCart[index]?.notes ?? "");
  }

  function saveAddCartNote() {
    if (editingAddCartNoteIndex === null) return;
    setAddCart((current) => current.map((line, index) => (index === editingAddCartNoteIndex ? { ...line, notes: addCartNoteDraft } : line)));
    setEditingAddCartNoteIndex(null);
    setAddCartNoteDraft("");
  }

  function commitAddCartToOrder() {
    if (!addCart.length) return;
    setLines((current) => mergeOrderLines(mergeOrderLines([], current), addCart));
    closeAddItems();
  }

  function updateLine(index: number, patch: Partial<OrderEditLine>) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch, quantity: Math.max(1, patch.quantity ?? line.quantity) } : line)));
  }

  function changeLineQuantity(index: number, delta: number) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, quantity: Math.max(1, line.quantity + delta) } : line)));
  }

  function openLineNote(index: number) {
    setEditingLineNoteIndex(index);
    setLineNoteDraft(lines[index]?.notes ?? "");
  }

  function saveLineNote() {
    if (editingLineNoteIndex === null) return;
    updateLine(editingLineNoteIndex, { notes: lineNoteDraft });
    setEditingLineNoteIndex(null);
    setLineNoteDraft("");
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
      if (!offlineContext) throw new Error("تعذر تحديد المطعم الحالي.");
      await updateLocalOrder(offlineContext, order.id, { tableId: targetTable.id });
      const message = `تم نقل الطلب إلى الطاولة ${targetTable.name}.`;
      window.sessionStorage.setItem(moveOrderMessageKey, message);
      closeMoveOrder();
      state.setMessage(message);
      router.push(`/owner/operations/tables/${targetTable.id}`);
    });
  }

  async function runLocal(action: () => Promise<void>, successMessage?: string) {
    state.setMessage("");
    try {
      await action();
      if (successMessage) state.setMessage(successMessage);
    } catch (error) {
      state.setMessage(formatActionError(error));
    }
  }

  async function changeOrderStatus(status: OrderStatus) {
    if (!order || lockedOrder) return;
    await runOrderAction(async () => {
      if (!offlineContext) throw new Error("تعذر تحديد المطعم الحالي.");
      await updateLocalOrder(offlineContext, order.id, { status });
    }, "تم تحديث حالة الطلب على الجهاز — بانتظار المزامنة");
  }

  async function completeCurrentOrder() {
    if (!order || lockedOrder) return;
    const paidAmount = paymentAmountForMethod(completeForm.paymentMethod as PaymentMethod, order.total, completeForm.paidAmount);
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
    if (paymentMethod === "SPLIT" && paidAmount <= 0) {
      state.setMessage("أدخل المبلغ المدفوع قبل إنهاء طلب الدفع المقسّم.");
      return;
    }
    await runOrderAction(async () => {
      if (!offlineContext) throw new Error("تعذر تحديد المطعم الحالي.");
      await completeLocalOrder(offlineContext, order.id, {
        paymentMethod,
        paidAmount,
        cashRegisterId: cashRegisterId || undefined,
        note
      });
      setPendingCompleteOrder(null);
    }, "تم إنهاء الطلب وحفظه على الجهاز — بانتظار المزامنة");
  }

  async function cancelCurrentOrder() {
    if (!order || lockedOrder) return;
    const reason = window.prompt("سبب الإلغاء") || "";
    if (!reason.trim()) return;

    await runOrderAction(async () => {
      if (!offlineContext) throw new Error("تعذر تحديد المطعم الحالي.");
      await cancelLocalOrder(offlineContext, order.id, reason);
    }, "تم إلغاء الطلب على الجهاز — بانتظار المزامنة");
  }

  async function runOrderAction(action: () => Promise<void>, successMessage?: string) {
    await orderActionGuard.current.run(async () => {
      setOrderActionBusy(true);
      try {
        await runLocal(action, successMessage);
      } finally {
        setOrderActionBusy(false);
      }
    });
  }

  useEffect(() => {
    if (!startPicker.categoryTabs.some((tab) => tab.id === activeStartCategoryId)) {
      setActiveStartCategoryId("all");
    }
  }, [activeStartCategoryId, startPicker.categoryTabs]);

  useEffect(() => {
    if (!addPicker.categoryTabs.some((tab) => tab.id === activeAddCategoryId)) {
      setActiveAddCategoryId("all");
    }
  }, [activeAddCategoryId, addPicker.categoryTabs]);

  return (
    <OpsShell title="تفاصيل الطاولة" eyebrow="الطاولات والطلبات المفتوحة" module="tables" state={state} onRefresh={() => void Promise.all([state.loadRestaurant(), load()])}>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_10.5rem] xl:[direction:ltr] 2xl:grid-cols-[minmax(0,1fr)_11.5rem]">
        <div className="min-w-0 xl:[direction:rtl]">
          <QuickTablesMobile tables={railTables} currentTableId={activeTableId} orderById={orderById} lastTable={lastTable} lastOrder={lastTableOrder} currency={state.restaurant?.currency} onSelectTable={switchTable} />
          <AppSurface className="p-2">
            {table ? (
              order ? (
                <form onSubmit={saveOrder} className="grid gap-3">
              <UnifiedTableToolbar
                table={table}
                order={order}
                lockedOrder={lockedOrder}
                busy={orderActionBusy}
                restaurant={state.restaurant}
                token={state.token}
                onAddItems={openAddItems}
                onComplete={() => void completeCurrentOrder()}
                onStatusChange={(status) => void changeOrderStatus(status)}
                onCancel={() => void cancelCurrentOrder()}
                onMove={openMoveOrder}
                onEditOrder={openOrderDetails}
                onEditTable={openTableForm}
              />
              {lockedOrder ? (
                <p className="rounded-app-md border border-app-warning-soft bg-app-warning-soft px-3 py-2 text-app-helper font-semibold text-app-warning">
                  الطلب مغلق ماليًا. يمكن عرض التفاصيل، لكن لا يمكن تعديل البنود بعد الإتمام أو الإلغاء أو إنشاء الفاتورة.
                </p>
              ) : null}

              {lines.length ? (
                <div className="overflow-x-auto rounded-app-lg border border-app-border bg-app-surface">
                  <table className="w-full min-w-[780px] text-app-table">
                    <thead className="bg-app-surface-muted text-app-meta text-app-muted">
                      <tr className="[&>th]:border-b [&>th]:border-app-border [&>th]:px-2.5 [&>th]:py-2 [&>th]:text-start [&>th]:font-semibold">
                        <th>الصنف</th>
                        <th className="w-28">الكمية</th>
                        <th className="w-32">السعر</th>
                        <th className="w-36">الإجمالي</th>
                        <th className="w-48">الملاحظة</th>
                        {!lockedOrder ? <th className="w-12 text-center">إجراء</th> : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-app-border">
                      {lines.map((line, index) => (
                        <tr key={`${line.menuItemId}-${index}`} className="h-12 align-middle transition-colors hover:bg-app-surface-muted">
                          <td className="px-2.5 py-2">
                            <p className="font-semibold text-app-ink">{line.name}</p>
                            {state.modules?.inventory && !recipes.some((entry) => entry.menuItemId === line.menuItemId) ? (
                              <p className="mt-0.5 text-[11px] font-semibold text-app-warning">لا توجد مكونات مخزون مرتبطة</p>
                            ) : null}
                          </td>
                          <td className="px-2.5 py-2">
                            {lockedOrder ? (
                              <span className="font-semibold text-app-ink">{formatInteger(line.quantity)}</span>
                            ) : (
                              <QuantityStepper value={line.quantity} onChange={(quantity) => updateLine(index, { quantity })} onStep={(delta) => changeLineQuantity(index, delta)} />
                            )}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-2 font-medium text-app-muted">{money(line.unitPrice, state.restaurant?.currency)}</td>
                          <td className="whitespace-nowrap px-2.5 py-2 font-bold text-app-ink">{money(line.unitPrice * line.quantity, state.restaurant?.currency)}</td>
                          <td className="px-2.5 py-2">
                            {lockedOrder ? (
                              <span className="block max-w-44 truncate font-medium text-app-muted">{line.notes || "-"}</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openLineNote(index)}
                                className={cn(
                                  "inline-flex max-w-full items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft",
                                  line.notes ? "bg-app-primary-soft text-app-primary" : "bg-app-surface-muted text-app-muted hover:text-app-ink"
                                )}
                              >
                                <StickyNote className="h-3.5 w-3.5" />
                                <span className="truncate">{line.notes || "+ ملاحظة"}</span>
                              </button>
                            )}
                          </td>
                          {!lockedOrder ? (
                            <td className="px-2.5 py-2 text-center">
                              <button
                                type="button"
                                aria-label={`حذف ${line.name}`}
                                title="حذف"
                                onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-app-md text-app-danger transition-colors hover:bg-app-danger-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-danger-soft"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <AppEmptyState title="لا توجد بنود" description="أضف صنفًا واحدًا على الأقل إلى الطلب." />}

              <div className="grid gap-2 rounded-app-md border border-app-border bg-app-surface-muted p-2 md:grid-cols-[repeat(3,minmax(92px,120px))_1fr_auto] md:items-end">
                <AppFieldShell label="خصم">
                  <AppInput type="number" min="0" value={orderForm.discount} disabled={lockedOrder} onChange={(event) => setOrderForm({ ...orderForm, discount: Number(event.target.value) })} className="h-9" />
                </AppFieldShell>
                <AppFieldShell label="ضريبة">
                  <AppInput type="number" min="0" value={orderForm.tax} disabled={lockedOrder} onChange={(event) => setOrderForm({ ...orderForm, tax: Number(event.target.value) })} className="h-9" />
                </AppFieldShell>
                <AppFieldShell label="خدمة">
                  <AppInput type="number" min="0" value={orderForm.serviceCharge} disabled={lockedOrder} onChange={(event) => setOrderForm({ ...orderForm, serviceCharge: Number(event.target.value) })} className="h-9" />
                </AppFieldShell>
                <div className="flex flex-wrap items-center gap-2">
                  {!orderNotesOpen && !orderForm.notes ? (
                    <AppButton type="button" variant="secondary" size="sm" onClick={() => setOrderNotesOpen(true)} disabled={lockedOrder}>
                      + ملاحظة للطلب
                    </AppButton>
                  ) : null}
                  <p className="text-lg font-black text-app-ink">الإجمالي: {money(previewTotal, state.restaurant?.currency)}</p>
                </div>
                <AppButton type="submit" size="sm" loading={orderActionBusy} disabled={lockedOrder || !lines.length || orderActionBusy}>حفظ</AppButton>
              </div>
              {orderNotesOpen || orderForm.notes ? (
                <AppFieldShell label="ملاحظات الطلب">
                  <AppTextarea value={orderForm.notes} disabled={lockedOrder} onChange={(event) => setOrderForm({ ...orderForm, notes: event.target.value })} className="min-h-20" />
                </AppFieldShell>
              ) : null}
                </form>
              ) : (
                <div className="grid gap-3">
              <UnifiedTableToolbar
                table={table}
                order={null}
                lockedOrder={false}
                busy={orderActionBusy}
                restaurant={state.restaurant}
                token={state.token}
                onAddItems={openAddItems}
                onComplete={() => void completeCurrentOrder()}
                onStatusChange={(status) => void changeOrderStatus(status)}
                onCancel={() => void cancelCurrentOrder()}
                onMove={openMoveOrder}
                onEditOrder={openOrderDetails}
                onEditTable={openTableForm}
                onStartOrder={canStartOrder ? openStartOrder : undefined}
              />
              <AppEmptyState title="لا يوجد طلب مفتوح" description="هذه الطاولة لا تحتوي على طلب مفتوح حاليًا." />
                </div>
              )
            ) : <AppEmptyState title="لم يتم العثور على الطاولة" description="تحقق من الرابط أو ارجع لقائمة الطاولات." />}
          </AppSurface>
        </div>
        <QuickTablesRail tables={railTables} currentTableId={activeTableId} orderById={orderById} lastTable={lastTable} lastOrder={lastTableOrder} currency={state.restaurant?.currency} onSelectTable={switchTable} />
      </div>

      <PopupForm open={orderDetailsOpen} onClose={() => setOrderDetailsOpen(false)} title="تفاصيل الطلب" maxWidth="md">
        <div className="grid gap-3">
          <AppFieldShell label="اسم الطلب">
            <AppInput value={orderForm.name} disabled={lockedOrder} onChange={(event) => setOrderForm({ ...orderForm, name: event.target.value })} />
          </AppFieldShell>
          <AppFieldShell label="نوع الطلب">
            <AppSelect value={orderForm.type} disabled={lockedOrder} onChange={(event) => setOrderForm({ ...orderForm, type: event.target.value })}>
              {orderTypes.map((type) => (
                <option key={type} value={type}>{option(type).label}</option>
              ))}
            </AppSelect>
          </AppFieldShell>
          <p className="rounded-app-md border border-app-border bg-app-surface-muted px-3 py-2 text-app-helper font-semibold text-app-muted">
            سيتم تطبيق هذه التفاصيل عند حفظ الطلب من الشريط السفلي.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AppButton type="button" variant="secondary" onClick={() => setOrderDetailsOpen(false)} className="w-full sm:w-auto">إغلاق</AppButton>
          </div>
        </div>
      </PopupForm>

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

      <PopupForm open={addItemsOpen} onClose={closeAddItems} title="إضافة أصناف" description={table ? `طاولة ${table.name}` : undefined} maxWidth="wide">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,38%)] lg:[direction:ltr]">
          <SelectedItemsPanel
            title="الأصناف المضافة"
            emptyTitle="لم تتم إضافة أصناف"
            emptyDescription="اضغط + بجانب أي صنف لإضافته مؤقتًا هنا."
            lines={addCart}
            currency={state.restaurant?.currency}
            quantity={addCartQuantity}
            total={addCartTotal}
            actionLabel="إضافة للطلب"
            actionDisabled={!addCart.length}
            onAction={commitAddCartToOrder}
            onQuantityChange={updateAddCartLine}
            onNoteClick={openAddCartNote}
          />
          <div className="rounded-app-lg border border-app-border bg-app-surface-muted p-3 lg:[direction:rtl]">
            <MenuItemSelectionPanel
              query={addItemQuery}
              onQueryChange={setAddItemQuery}
              activeCategoryId={activeAddCategoryId}
              onCategoryChange={setActiveAddCategoryId}
              categoryTabs={addPicker.categoryTabs}
              visibleItems={addPicker.visibleItems}
              allItemsCount={menuItems.length}
              recipes={recipes}
              inventoryEnabled={Boolean(state.modules?.inventory)}
              currency={state.restaurant?.currency}
              onQuickAdd={addMenuItemToAddCart}
              selectedQuantities={addCartQuantities}
            />
          </div>
        </div>
      </PopupForm>

      <PopupForm open={editingAddCartNoteIndex !== null} onClose={() => setEditingAddCartNoteIndex(null)} title="ملاحظة الصنف" maxWidth="sm">
        <div className="grid gap-3">
          <AppTextarea value={addCartNoteDraft} onChange={(event) => setAddCartNoteDraft(event.target.value)} className="min-h-28" />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AppButton type="button" variant="secondary" onClick={() => setEditingAddCartNoteIndex(null)} className="w-full sm:w-auto">إلغاء</AppButton>
            <AppButton type="button" onClick={saveAddCartNote} className="w-full sm:w-auto">حفظ الملاحظة</AppButton>
          </div>
        </div>
      </PopupForm>

      <PopupForm open={editingLineNoteIndex !== null} onClose={() => setEditingLineNoteIndex(null)} title="ملاحظة الصنف" maxWidth="sm">
        <div className="grid gap-3">
          <AppTextarea value={lineNoteDraft} onChange={(event) => setLineNoteDraft(event.target.value)} className="min-h-28" />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AppButton type="button" variant="secondary" onClick={() => setEditingLineNoteIndex(null)} className="w-full sm:w-auto">إلغاء</AppButton>
            <AppButton type="button" onClick={saveLineNote} className="w-full sm:w-auto">حفظ الملاحظة</AppButton>
          </div>
        </div>
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

      <PopupForm open={startOrderOpen} onClose={closeStartOrder} title="بدء طلب" description={table ? `الطاولة: ${table.name}` : undefined} maxWidth="wide">
        <form onSubmit={createOrder} className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-app-md border border-app-border bg-app-surface-muted px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-app-ink">
              <span>طاولة {table?.name ?? activeTableId}</span>
              <span className="text-app-meta text-app-muted" aria-hidden="true">•</span>
              <span>{option(startOrderForm.type).label}</span>
              <span className="text-app-meta text-app-muted" aria-hidden="true">•</span>
              <span>{startOrderForm.orderedTime}</span>
            </div>
            <button
              type="button"
              onClick={() => setStartDetailsOpen((open) => !open)}
              className="rounded-app-md px-2 py-1 text-xs font-bold text-app-primary transition-colors hover:bg-app-primary-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft"
            >
              تفاصيل إضافية
            </button>
          </div>

          {startDetailsOpen ? (
            <div className="grid gap-3 rounded-app-lg border border-app-border bg-app-surface-muted p-3 sm:grid-cols-2 lg:grid-cols-4">
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
              <AppFieldShell label="خصم">
                <AppInput type="number" min="0" value={startOrderForm.discount} onChange={(event) => setStartOrderForm({ ...startOrderForm, discount: Number(event.target.value) })} />
              </AppFieldShell>
              <AppFieldShell label="ضريبة">
                <AppInput type="number" min="0" value={startOrderForm.tax} onChange={(event) => setStartOrderForm({ ...startOrderForm, tax: Number(event.target.value) })} />
              </AppFieldShell>
              <AppFieldShell label="خدمة">
                <AppInput type="number" min="0" value={startOrderForm.serviceCharge} onChange={(event) => setStartOrderForm({ ...startOrderForm, serviceCharge: Number(event.target.value) })} />
              </AppFieldShell>
              <AppFieldShell label="طريقة الدفع">
                <AppSelect value={startOrderForm.paymentMethod} onChange={(event) => setStartOrderForm({ ...startOrderForm, paymentMethod: event.target.value })}>
                  {paymentMethods.map((method) => <option key={method} value={method}>{option(method).label}</option>)}
                </AppSelect>
              </AppFieldShell>
              <AppFieldShell label="ملاحظات الطلب" className="sm:col-span-2 lg:col-span-4">
                <AppTextarea value={startOrderForm.notes} onChange={(event) => setStartOrderForm({ ...startOrderForm, notes: event.target.value })} className="min-h-20" />
              </AppFieldShell>
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,38%)] lg:[direction:ltr]">
            <SelectedItemsPanel
              title="الطلب الجديد"
              emptyTitle="السلة فارغة"
              emptyDescription="أضف صنفًا أو أكثر قبل إنشاء الطلب."
              lines={startCart}
              currency={state.restaurant?.currency}
              quantity={startCartQuantity}
              total={startCartSubTotal}
              actionLabel="إنشاء الطلب"
              actionType="submit"
              actionLoading={orderActionBusy}
              actionDisabled={!startCart.length || orderActionBusy}
              onQuantityChange={updateStartCartQuantity}
              onNoteClick={openStartCartNote}
            />
            <div className="rounded-app-lg border border-app-border bg-app-surface-muted p-3 lg:[direction:rtl]">
              <MenuItemSelectionPanel
                query={startItemQuery}
                onQueryChange={setStartItemQuery}
                activeCategoryId={activeStartCategoryId}
                onCategoryChange={setActiveStartCategoryId}
                categoryTabs={startPicker.categoryTabs}
                visibleItems={startPicker.visibleItems}
                allItemsCount={menuItems.length}
                recipes={recipes}
                inventoryEnabled={Boolean(state.modules?.inventory)}
                currency={state.restaurant?.currency}
                onQuickAdd={addStartItemToCart}
                selectedQuantities={startCartQuantities}
              />
            </div>
          </div>
        </form>
      </PopupForm>

      <PopupForm open={editingStartCartNoteIndex !== null} onClose={() => setEditingStartCartNoteIndex(null)} title="ملاحظة الصنف" maxWidth="sm">
        <div className="grid gap-3">
          <AppTextarea value={startCartNoteDraft} onChange={(event) => setStartCartNoteDraft(event.target.value)} className="min-h-28" />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AppButton type="button" variant="secondary" onClick={() => setEditingStartCartNoteIndex(null)} className="w-full sm:w-auto">إلغاء</AppButton>
            <AppButton type="button" onClick={saveStartCartNote} className="w-full sm:w-auto">حفظ الملاحظة</AppButton>
          </div>
        </div>
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
        title="إنهاء الطلب"
        description={pendingCompleteOrder ? `سيتم إنهاء الطلب ${pendingCompleteOrder.order.name || pendingCompleteOrder.order.id} بقيمة ${money(pendingCompleteOrder.order.total, state.restaurant?.currency)}.` : undefined}
        maxWidth="md"
      >
        {pendingCompleteOrder ? (
          <div className="grid gap-3">
          <div className="rounded-app-md border border-app-success-soft bg-app-success-soft px-3 py-2 text-lg font-black text-app-success">
            الإجمالي: {money(pendingCompleteOrder.order.total, state.restaurant?.currency)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <AppFieldShell label="طريقة الدفع">
              <AppSelect
                value={pendingCompleteOrder.paymentMethod}
                onChange={(event) => {
                  const paymentMethod = event.target.value as PaymentMethod;
                  setPendingCompleteOrder({
                    ...pendingCompleteOrder,
                    paymentMethod,
                    paidAmount: paymentAmountForMethod(paymentMethod, pendingCompleteOrder.order.total, pendingCompleteOrder.paidAmount)
                  });
                }}
              >
                {paymentMethods.map((method) => <option key={method} value={method}>{option(method).label}</option>)}
              </AppSelect>
            </AppFieldShell>
            <AppFieldShell label="المدفوع">
              <AppInput type="number" min="0" value={pendingCompleteOrder.paidAmount} onChange={(event) => setPendingCompleteOrder({ ...pendingCompleteOrder, paidAmount: Number(event.target.value) })} />
            </AppFieldShell>
          </div>
          {cashRegisters.length ? (
            <AppFieldShell label="الصندوق">
              <AppSelect value={pendingCompleteOrder.cashRegisterId} onChange={(event) => setPendingCompleteOrder({ ...pendingCompleteOrder, cashRegisterId: event.target.value })}>
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
              <AppInput value={pendingCompleteOrder.cashRegisterId} onChange={(event) => setPendingCompleteOrder({ ...pendingCompleteOrder, cashRegisterId: event.target.value })} />
            </AppFieldShell>
          )}
          <AppFieldShell label="ملاحظة الدفع">
            <AppInput value={pendingCompleteOrder.note} onChange={(event) => setPendingCompleteOrder({ ...pendingCompleteOrder, note: event.target.value })} />
          </AppFieldShell>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AppButton type="button" variant="secondary" onClick={() => setPendingCompleteOrder(null)} disabled={orderActionBusy} className="w-full sm:w-auto">
              إلغاء
            </AppButton>
            <AppButton type="button" data-autofocus onClick={() => void confirmCompleteCurrentOrder()} loading={orderActionBusy} disabled={orderActionBusy} className="w-full sm:w-auto">
              إنهاء الطلب
            </AppButton>
          </div>
          </div>
        ) : null}
      </PopupForm>
    </OpsShell>
  );
}

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const variant = status === "COMPLETED" || status === "SERVED" ? "success" : status === "CANCELLED" ? "danger" : status === "PENDING" || status === "DRAFT" ? "warning" : "primary";
  return <AppBadge variant={variant}>{orderStatusLabels[status]}</AppBadge>;
}

function QuickTablesRail({
  tables,
  currentTableId,
  orderById,
  lastTable,
  lastOrder,
  currency,
  onSelectTable
}: {
  tables: OpsTable[];
  currentTableId: string;
  orderById: Map<string, OpsOrder>;
  lastTable: OpsTable | null;
  lastOrder: OpsOrder | null;
  currency?: string;
  onSelectTable: (tableId: string) => void;
}) {
  return (
    <aside className="hidden xl:block xl:[direction:rtl]">
      <div className="sticky top-3 flex max-h-[calc(100dvh-1.5rem)] flex-col rounded-app-lg border border-app-border bg-app-surface">
        <div className="flex items-center justify-between gap-2 border-b border-app-border px-3 py-2">
          <p className="text-sm font-bold text-app-ink">الطاولات</p>
          <span className="text-app-meta font-semibold text-app-muted">{formatInteger(tables.length)}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="grid grid-cols-3 gap-1.5 2xl:gap-2">
            {tables.map((entry) => (
              <QuickTableLink key={entry.id} table={entry} current={entry.id === currentTableId} order={entry.currentOrderId ? orderById.get(entry.currentOrderId) ?? null : null} onSelect={onSelectTable} />
            ))}
          </div>
        </div>
        <LastTableCard table={lastTable} order={lastOrder} currency={currency} onSelect={onSelectTable} />
      </div>
    </aside>
  );
}

function QuickTablesMobile({
  tables,
  currentTableId,
  orderById,
  lastTable,
  lastOrder,
  currency,
  onSelectTable
}: {
  tables: OpsTable[];
  currentTableId: string;
  orderById: Map<string, OpsOrder>;
  lastTable: OpsTable | null;
  lastOrder: OpsOrder | null;
  currency?: string;
  onSelectTable: (tableId: string) => void;
}) {
  return (
    <details className="mb-3 rounded-app-lg border border-app-border bg-app-surface xl:hidden">
      <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-bold text-app-ink [&::-webkit-details-marker]:hidden">
        <span>الطاولات</span>
        <span className="text-app-meta font-semibold text-app-muted">{formatInteger(tables.length)}</span>
      </summary>
      <div className="border-t border-app-border p-2">
        <div className="grid max-h-64 grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-6 md:grid-cols-8">
          {tables.map((entry) => (
            <QuickTableLink key={entry.id} table={entry} current={entry.id === currentTableId} order={entry.currentOrderId ? orderById.get(entry.currentOrderId) ?? null : null} onSelect={onSelectTable} />
          ))}
        </div>
        <LastTableCard table={lastTable} order={lastOrder} currency={currency} compact onSelect={onSelectTable} />
      </div>
    </details>
  );
}

function QuickTableLink({ table, current, order, onSelect }: { table: OpsTable; current: boolean; order: OpsOrder | null; onSelect: (tableId: string) => void }) {
  const state = tableNavigationState(table, order);

  return (
    <button
      type="button"
      onClick={() => onSelect(table.id)}
      aria-current={current ? "page" : undefined}
      className={cn(
        "relative grid h-11 min-w-0 place-items-center rounded-app-md border px-1 text-sm font-black transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft",
        current
          ? "border-app-primary bg-app-primary text-app-primary-foreground shadow-sm"
          : "border-transparent bg-app-surface text-app-ink hover:border-app-border hover:bg-app-surface-muted",
        table.status === "DISABLED" && !current && "opacity-60"
      )}
      title={`طاولة ${table.name} - ${state.label}`}
    >
      <span className="max-w-full truncate">{table.name}</span>
      <span className={cn("absolute bottom-1 left-1 h-2 w-2 rounded-full", current ? "bg-app-primary-foreground" : state.dotClass)} aria-hidden="true" />
    </button>
  );
}

function LastTableCard({ table, order, currency, compact = false, onSelect }: { table: OpsTable | null; order: OpsOrder | null; currency?: string; compact?: boolean; onSelect: (tableId: string) => void }) {
  if (!table) return null;

  const state = tableNavigationState(table, order);

  return (
    <div className={cn("border-t border-app-border p-2", compact && "mt-2 rounded-app-md border")}>
      <button
        type="button"
        onClick={() => onSelect(table.id)}
        className="block w-full rounded-app-md border border-app-border bg-app-surface-muted px-2 py-1.5 text-start transition-colors hover:border-app-primary hover:bg-app-primary-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-bold text-app-muted">آخر طاولة: <span className="text-app-ink">{table.name}</span></span>
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", state.dotClass)} aria-hidden="true" />
        </div>
        {order ? (
          <p className="mt-0.5 truncate text-app-helper font-semibold text-app-muted">
            {money(order.total, currency)}
          </p>
        ) : null}
      </button>
    </div>
  );
}

function tableNavigationState(table: OpsTable, order: OpsOrder | null) {
  if (table.currentOrderId || order) {
    return {
      label: order ? orderStatusLabels[order.status] : "مع طلب",
      dotClass: "bg-app-warning"
    };
  }
  if (table.status === "AVAILABLE") {
    return { label: option(table.status).label, dotClass: "bg-app-success" };
  }
  if (table.status === "DISABLED") {
    return { label: option(table.status).label, dotClass: "bg-app-danger" };
  }
  return { label: option(table.status).label, dotClass: "bg-app-warning" };
}

function SelectedItemsPanel({
  title,
  emptyTitle,
  emptyDescription,
  lines,
  currency,
  quantity,
  total,
  actionLabel,
  actionType = "button",
  actionLoading = false,
  actionDisabled,
  onAction,
  onQuantityChange,
  onNoteClick
}: {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  lines: OrderEditLine[];
  currency?: string;
  quantity: number;
  total: number;
  actionLabel: string;
  actionType?: "button" | "submit";
  actionLoading?: boolean;
  actionDisabled?: boolean;
  onAction?: () => void;
  onQuantityChange: (index: number, quantity: number) => void;
  onNoteClick: (index: number) => void;
}) {
  return (
    <aside className="flex max-h-[calc(100dvh-10rem)] min-h-[360px] flex-col rounded-app-lg border border-app-border bg-app-surface p-3 lg:[direction:rtl]">
      <div className="flex items-center justify-between gap-2 border-b border-app-border pb-3">
        <p className="text-sm font-bold text-app-ink">{title}</p>
        <p className="text-app-meta text-app-muted">{formatInteger(lines.length)} سطر</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-3 pe-1">
        {lines.length ? (
          <div className="grid gap-2">
            {lines.map((line, index) => (
              <div key={`${line.menuItemId}-${index}`} className="rounded-app-md border border-app-border bg-app-surface-muted p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-app-ink">{line.name}</p>
                    <p className="text-app-helper font-semibold text-app-muted">{money(line.unitPrice * line.quantity, currency)}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`حذف ${line.name}`}
                    title="حذف"
                    onClick={() => onQuantityChange(index, 0)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-app-md text-app-danger transition-colors hover:bg-app-danger-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-danger-soft"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <QuantityStepper value={line.quantity} onChange={(nextQuantity) => onQuantityChange(index, nextQuantity)} onStep={(delta) => onQuantityChange(index, line.quantity + delta)} allowZero />
                  <button
                    type="button"
                    onClick={() => onNoteClick(index)}
                    className={cn(
                      "inline-flex max-w-full items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft",
                      line.notes ? "bg-app-primary-soft text-app-primary" : "bg-app-surface text-app-muted hover:text-app-ink"
                    )}
                  >
                    <StickyNote className="h-3.5 w-3.5" />
                    <span className="max-w-32 truncate">{line.notes || "+ ملاحظة"}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <AppEmptyState title={emptyTitle} description={emptyDescription} />
        )}
      </div>
      <div className="sticky bottom-0 grid gap-2 border-t border-app-border bg-app-surface pt-3">
        <div className="flex items-center justify-between gap-3 text-sm font-bold text-app-ink">
          <span>عدد القطع: {formatInteger(quantity)}</span>
          <span>الإجمالي: {money(total, currency)}</span>
        </div>
        <AppButton type={actionType} onClick={onAction} loading={actionLoading} disabled={actionDisabled}>
          {actionLabel}
        </AppButton>
      </div>
    </aside>
  );
}

const compactStatusActions: Array<{ status: Exclude<OrderStatus, "DRAFT" | "COMPLETED" | "CANCELLED">; label: string }> = [
  { status: "PENDING", label: "معلّق" },
  { status: "CONFIRMED", label: "تأكيد" },
  { status: "PREPARING", label: "قيد التحضير" },
  { status: "READY", label: "جاهز" },
  { status: "SERVED", label: "تم التقديم" }
];

function UnifiedTableToolbar({
  table,
  order,
  lockedOrder,
  busy,
  restaurant,
  token,
  onAddItems,
  onComplete,
  onStatusChange,
  onCancel,
  onMove,
  onEditOrder,
  onEditTable,
  onStartOrder
}: {
  table: OpsTable;
  order: OpsOrder | null;
  lockedOrder: boolean;
  busy?: boolean;
  restaurant: Restaurant | null;
  token?: string;
  onAddItems: () => void;
  onComplete: () => void;
  onStatusChange: (status: OrderStatus) => void;
  onCancel: () => void;
  onMove: () => void;
  onEditOrder: () => void;
  onEditTable: () => void;
  onStartOrder?: () => void;
}) {
  const orderClosed = Boolean(order && (order.status === "COMPLETED" || order.status === "CANCELLED"));

  return (
    <div className="flex min-h-16 flex-wrap items-center justify-between gap-2 rounded-app-md border border-app-border bg-app-surface-muted px-3 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h1 className="truncate text-xl font-black leading-7 text-app-ink sm:text-2xl">طاولة {table.name}</h1>
        {order ? (
          <>
            <span className="hidden text-app-meta font-semibold text-app-muted sm:inline" aria-hidden="true">•</span>
            <span className="max-w-44 truncate text-sm font-bold text-app-muted">{cashierOrderLabel(order, table)}</span>
            <OrderStatusBadge status={order.status} />
          </>
        ) : (
          <AppBadge variant={table.status === "AVAILABLE" ? "success" : table.status === "DISABLED" ? "danger" : "warning"}>{table.status}</AppBadge>
        )}
        <span className="hidden text-app-meta font-semibold text-app-muted md:inline">{table.area || "بدون منطقة"}</span>
        <span className="hidden text-app-meta font-semibold text-app-muted md:inline">{formatInteger(table.capacity)} مقاعد</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {order ? (
          <>
            {!lockedOrder ? (
              <AppButton type="button" size="sm" onClick={onAddItems} iconStart={<Plus className="h-4 w-4" />}>
                إضافة أصناف
              </AppButton>
            ) : null}
            {!orderClosed ? (
              <AppButton type="button" size="sm" disabled={busy} onClick={onComplete}>
                إنهاء الطلب
              </AppButton>
            ) : null}
            <OrderReceiptPrintButton order={order} restaurant={restaurant} table={table} token={token} disabled={!order.items.length} />
          </>
        ) : onStartOrder ? (
          <AppButton type="button" size="sm" onClick={onStartOrder}>بدء طلب</AppButton>
        ) : null}
        <details className="relative">
          <summary
            aria-label="المزيد"
            title="المزيد"
            className="inline-flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-app-md border border-app-border bg-app-surface text-app-ink transition-colors hover:bg-app-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft [&::-webkit-details-marker]:hidden"
          >
            <MoreHorizontal className="h-4 w-4" />
          </summary>
          <div className="absolute left-0 z-20 mt-2 grid w-64 gap-2 rounded-app-md border border-app-border bg-app-surface p-2 text-start shadow-lg">
            {order ? (
              <>
                <AppButton type="button" variant="ghost" size="sm" onClick={onEditOrder} disabled={lockedOrder} className="justify-start">
                  تفاصيل/تعديل الطلب
                </AppButton>
                {!orderClosed ? (
                  <AppFieldShell label="تغيير الحالة" className="text-xs">
                    <AppSelect
                      aria-label="تغيير حالة الطلب"
                      value={compactStatusActions.some((action) => action.status === order.status) ? order.status : ""}
                      disabled={busy || lockedOrder}
                      onChange={(event) => {
                        if (event.target.value) onStatusChange(event.target.value as OrderStatus);
                      }}
                      className="h-9 text-xs"
                    >
                      <option value="">حالة الطلب</option>
                      {compactStatusActions.map((action) => (
                        <option key={action.status} value={action.status} disabled={order.status === action.status}>
                          {action.label}
                        </option>
                      ))}
                    </AppSelect>
                  </AppFieldShell>
                ) : null}
                {!lockedOrder ? (
                  <AppButton type="button" variant="ghost" size="sm" onClick={onMove} disabled={busy} className="justify-start">
                    نقل الطلب
                  </AppButton>
                ) : null}
                {!orderClosed ? (
                  <AppButton type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy || lockedOrder} className="justify-start text-app-danger hover:bg-app-danger-soft">
                    إلغاء الطلب
                  </AppButton>
                ) : null}
              </>
            ) : null}
            <AppButton type="button" variant="ghost" size="sm" onClick={onEditTable} className="justify-start">
              تعديل الطاولة
            </AppButton>
            <Link href="/owner/operations/tables" className="inline-flex h-9 items-center rounded-app-md px-3 text-xs font-semibold text-app-ink transition-colors hover:bg-app-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft">
              العودة للطاولات
            </Link>
          </div>
        </details>
      </div>
    </div>
  );
}

function cashierOrderLabel(order: OpsOrder, table: OpsTable) {
  const name = order.name?.trim();
  if (name && !looksInternalOrderId(name)) return name.length > 32 ? `${name.slice(0, 29)}...` : name;

  const time = formatOrderTime(order.orderedAt || order.createdAt);
  return time ? `#${table.name} - ${time}` : `#${table.name}`;
}

function looksInternalOrderId(value: string) {
  return /^order[_-]/i.test(value) || value.length > 42;
}

function tableIdFromPath(pathname: string) {
  const match = pathname.match(/\/owner\/operations\/tables\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function markTableSwitch(label: string) {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem("opsTableSwitchDebug") !== "1") return;
  window.performance.mark(label);
  console.debug(`[table-switch] ${label}`, Math.round(window.performance.now()));
}

function formatOrderTime(value: string | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString("ar-SY-u-nu-latn", { hour: "2-digit", minute: "2-digit" });
}

const tableNameCollator = new Intl.Collator("ar", { numeric: true, sensitivity: "base" });

function sortTablesForNavigation(tables: OpsTable[]) {
  return [...tables].sort((first, second) => tableNameCollator.compare(first.name, second.name) || first.id.localeCompare(second.id));
}

function readRecentTableIds(key: string) {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string").slice(0, recentTableHistoryLimit)
      : [];
  } catch {
    return [];
  }
}

function writeRecentTableIds(key: string, tableIds: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(tableIds.slice(0, recentTableHistoryLimit)));
}

function QuantityStepper({ value, onChange, onStep, allowZero = false }: { value: number; onChange: (value: number) => void; onStep: (delta: number) => void; allowZero?: boolean }) {
  const minimum = allowZero ? 0 : 1;

  return (
    <div className="inline-flex h-9 w-28 items-center overflow-hidden rounded-app-md border border-app-border bg-app-surface">
      <button
        type="button"
        aria-label="إنقاص الكمية"
        onClick={() => onStep(-1)}
        disabled={value <= minimum}
        className="grid h-full w-8 place-items-center text-app-muted transition-colors hover:bg-app-surface-muted hover:text-app-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="number"
        min={minimum}
        value={value}
        onChange={(event) => onChange(Math.max(minimum, Number(event.target.value)))}
        className="h-full min-w-0 flex-1 border-x border-app-border bg-transparent text-center text-sm font-bold text-app-ink outline-none"
      />
      <button
        type="button"
        aria-label="زيادة الكمية"
        onClick={() => onStep(1)}
        className="grid h-full w-8 place-items-center text-app-muted transition-colors hover:bg-app-surface-muted hover:text-app-ink"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

type MenuPickerTab = {
  id: string;
  name: string;
  count: number;
};

function useMenuPickerData(menuItems: MenuItem[], categories: Category[], query: string, activeCategoryId: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const text = `${item.name} ${item.description}`.toLowerCase();
      return !normalizedQuery || text.includes(normalizedQuery);
    });
  }, [menuItems, normalizedQuery]);

  return useMemo(() => {
    const sortedCategories = [...categories].sort((first, second) => first.order - second.order);
    const knownCategoryIds = new Set(sortedCategories.map((category) => category.id));
    const uncategorizedItems = filteredItems.filter((item) => !knownCategoryIds.has(item.categoryId));
    const categoryTabs: MenuPickerTab[] = [
      { id: "all", name: "الكل", count: filteredItems.length },
      ...sortedCategories
        .filter((category) => menuItems.some((item) => item.categoryId === category.id))
        .map((category) => ({
          id: category.id,
          name: category.name,
          count: filteredItems.filter((item) => item.categoryId === category.id).length
        })),
      ...(menuItems.some((item) => !knownCategoryIds.has(item.categoryId)) ? [{ id: "uncategorized", name: "بدون قسم", count: uncategorizedItems.length }] : [])
    ];
    const visibleItems = filteredItems
      .filter((item) => {
        if (activeCategoryId === "all") return true;
        if (activeCategoryId === "uncategorized") return !knownCategoryIds.has(item.categoryId);
        return item.categoryId === activeCategoryId;
      })
      .sort((first, second) => {
        const firstCategoryOrder = sortedCategories.find((category) => category.id === first.categoryId)?.order ?? Number.MAX_SAFE_INTEGER;
        const secondCategoryOrder = sortedCategories.find((category) => category.id === second.categoryId)?.order ?? Number.MAX_SAFE_INTEGER;
        return firstCategoryOrder - secondCategoryOrder || first.order - second.order;
      });

    return { categoryTabs, visibleItems };
  }, [activeCategoryId, categories, filteredItems, menuItems]);
}

function MenuItemSelectionPanel({
  query,
  onQueryChange,
  activeCategoryId,
  onCategoryChange,
  categoryTabs,
  visibleItems,
  allItemsCount,
  recipes,
  inventoryEnabled,
  currency,
  onQuickAdd,
  selectedQuantities = {}
}: {
  query: string;
  onQueryChange: (query: string) => void;
  activeCategoryId: string;
  onCategoryChange: (categoryId: string) => void;
  categoryTabs: MenuPickerTab[];
  visibleItems: MenuItem[];
  allItemsCount: number;
  recipes: RecipeIngredient[];
  inventoryEnabled: boolean;
  currency?: string;
  onQuickAdd: (item: MenuItem) => void;
  selectedQuantities?: Record<string, number>;
}) {
  return (
    <div>
      <label className="flex h-10 items-center gap-2 rounded-app-md border border-app-border bg-app-surface px-3 text-app-muted focus-within:border-app-primary focus-within:ring-4 focus-within:ring-app-primary-soft">
        <Search className="h-4 w-4 shrink-0" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="ابحث عن صنف..."
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-app-ink outline-none placeholder:text-app-muted"
        />
      </label>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
        {categoryTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onCategoryChange(tab.id)}
            className={cn(
              "shrink-0 rounded-app-md border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft",
              activeCategoryId === tab.id
                ? "border-app-primary bg-app-primary-soft text-app-primary"
                : "border-app-border bg-app-surface text-app-muted hover:border-app-border-strong hover:bg-app-surface-muted hover:text-app-ink"
            )}
          >
            {tab.name} ({formatInteger(tab.count)})
          </button>
        ))}
      </div>
      <div className="mt-3 max-h-[360px] overflow-y-auto pe-1">
        {allItemsCount ? (
          visibleItems.length ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {visibleItems.map((item) => {
                const hasRecipe = recipes.some((entry) => entry.menuItemId === item.id);
                const selectedQuantity = selectedQuantities[item.id] ?? 0;

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "grid min-h-16 grid-cols-[1fr_auto] items-center gap-2 rounded-app-md border bg-app-surface p-2 text-start transition-colors",
                      selectedQuantity ? "border-app-primary bg-app-primary-soft" : "border-app-border hover:border-app-border-strong"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onQuickAdd(item)}
                      className="min-w-0 text-start focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="block min-w-0 flex-1 truncate text-sm font-semibold text-app-ink">{item.name}</span>
                        {selectedQuantity ? (
                          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-app-primary px-1.5 text-xs font-black text-app-primary-foreground">
                            {formatInteger(selectedQuantity)}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-app-helper text-app-muted">{money(item.price, currency)}</span>
                      {inventoryEnabled && !hasRecipe ? (
                        <span className="mt-1 block text-[11px] font-semibold text-app-warning">لا توجد مكونات مخزون مرتبطة</span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      aria-label={`إضافة ${item.name}`}
                      title="إضافة سريعة"
                      onClick={() => onQuickAdd(item)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-app-md border border-app-border bg-app-surface text-app-primary transition-colors hover:bg-app-primary-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
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
