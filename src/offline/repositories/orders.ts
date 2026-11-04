import { normalizeSettlement, type PaymentPart, type SettlementMode } from "@/lib/payments";
import { adminBackgroundRequest } from "@/lib/api";
import type { CashMovement, Invoice, JournalEntry, OperationalPayment, OpsOrder, OpsOrderLine, OpsTable, PaymentMethod } from "@/types/ops";
import { offlineDb } from "../db";
import { createLocalEntityId, getDeviceId } from "../device";
import { shouldProtectHydratedRecord } from "../hydration";
import { queueOperation } from "../outbox";
import type { LocalOrder } from "../schema";
import { startSync } from "../sync-engine";
import type { OfflineContext } from "./tables";

export type OrderLineInput = {
  menuItemId: string;
  quantity: number;
  notes: string;
  modifiers: string[];
};

export type OrderCreateInput = {
  name: string;
  tableId: string;
  type: OpsOrder["type"];
  source: OpsOrder["source"];
  status?: OpsOrder["status"];
  orderedAt: string;
  items: OrderLineInput[];
  discount: number;
  tax: number;
  serviceCharge: number;
  paymentMethod: PaymentMethod;
  notes: string;
};

export type OrderUpdateInput = Partial<Omit<OrderCreateInput, "source">> & {
  status?: OpsOrder["status"];
};

export type CompleteOrderInput = {
  customerName?: string;
  settlementMode?: SettlementMode;
  payments?: PaymentPart[];
  paymentMethod: PaymentMethod;
  paidAmount: number;
  cashRegisterId?: string;
  note: string;
};

const orderRefreshes = new Map<string, Promise<OpsOrder[]>>();

export async function hydrateOrders(context: OfflineContext) {
  void refreshOrders(context);
  return listLocalOrders(context.tenantId);
}

export async function refreshOrders(context: OfflineContext, strict = false) {
  if (strict) return pullOrders(context, true);
  const current = orderRefreshes.get(context.tenantId);
  if (current) return current;

  const refresh = pullOrders(context)
    .catch(() => listLocalOrders(context.tenantId))
    .finally(() => {
      orderRefreshes.delete(context.tenantId);
    });
  orderRefreshes.set(context.tenantId, refresh);
  return refresh;
}

async function pullOrders(context: OfflineContext, strict = false) {
  try {
    const remoteOrders = await adminBackgroundRequest<OpsOrder[]>("/api/owner/ops/orders", context.token);
    const now = new Date().toISOString();
    const deviceId = await getDeviceId();
    await offlineDb.transaction("rw", offlineDb.orders, offlineDb.syncQueue, offlineDb.syncConflicts, async () => {
      for (const order of remoteOrders) {
        const local = await offlineDb.orders.get(order.id);
        const protectedLocal = await shouldProtectHydratedRecord({
          tenantId: context.tenantId,
          entityType: "order",
          entityId: order.id,
          local
        });
        if (protectedLocal) continue;

        await offlineDb.orders.put({
          ...order,
          restaurantId: context.tenantId,
          deviceId,
          syncStatus: "synced",
          lastSyncedAt: now,
          version: orderVersion(order)
        });
      }
    });
    return listLocalOrders(context.tenantId);
  } catch (error) {
    if (strict) throw error;
    return listLocalOrders(context.tenantId);
  }
}

export async function listLocalOrders(tenantId: string) {
  const orders = await offlineDb.orders.where("restaurantId").equals(tenantId).filter((order) => !order.deletedAt).toArray();
  return orders.sort((first, second) => String(second.createdAt ?? "").localeCompare(String(first.createdAt ?? "")));
}

export async function getLocalOrder(tenantId: string, orderId: string) {
  const order = await offlineDb.orders.get(orderId);
  return order?.restaurantId === tenantId && !order.deletedAt ? order : null;
}

export async function createLocalOrder(context: OfflineContext, input: OrderCreateInput) {
  const now = new Date().toISOString();
  const deviceId = await getDeviceId();
  const orderId = createLocalEntityId("order");
  const items = await hydrateLocalOrderItems(context.tenantId, input.items);
  const totals = calculateTotals(items, input.discount, input.tax, input.serviceCharge);
  const table = input.tableId ? await offlineDb.opsTables.get(input.tableId) : null;
  const restaurant = await offlineDb.restaurants.get(context.tenantId);
  const order: LocalOrder = {
    id: orderId,
    currency: restaurant?.currency,
    restaurantId: context.tenantId,
    name: input.name || defaultOrderName(table?.name ?? "", input.orderedAt),
    tableId: input.tableId,
    type: input.type,
    source: input.source,
    status: input.status ?? "PENDING",
    items,
    ...totals,
    paidAmount: 0,
    paymentStatus: "UNPAID",
    paymentMethod: input.paymentMethod,
    notes: input.notes,
    orderedAt: input.orderedAt,
    invoiceId: "",
    paymentId: "",
    createdAt: now,
    updatedAt: now,
    version: 0,
    syncStatus: "pending",
    deviceId,
    createdById: context.userId
  };

  await offlineDb.transaction("rw", offlineDb.orders, offlineDb.opsTables, offlineDb.syncQueue, offlineDb.deviceState, async () => {
    await offlineDb.orders.put(order);
    if (table && !table.deletedAt) {
      await offlineDb.opsTables.put({
        ...table,
        status: "OCCUPIED",
        currentOrderId: orderId,
        updatedAt: now,
        syncStatus: table.syncStatus === "pending" ? "pending" : "synced"
      });
    }
    await queueOperation({
      entityType: "order",
      entityId: orderId,
      action: "create",
      payload: input,
      tenantId: context.tenantId,
      userId: context.userId
    });
  });

  void startSync(context.tenantId, context.token);
  return order;
}

export async function updateLocalOrder(context: OfflineContext, orderId: string, input: OrderUpdateInput) {
  const current = await requireLocalOrder(context.tenantId, orderId);
  assertOrderEditable(current);
  const now = new Date().toISOString();
  const items = input.items ? await hydrateLocalOrderItems(context.tenantId, input.items) : current.items;
  const discount = input.discount ?? current.discount;
  const tax = input.tax ?? current.tax;
  const serviceCharge = input.serviceCharge ?? current.serviceCharge;
  const totals = input.items || input.discount !== undefined || input.tax !== undefined || input.serviceCharge !== undefined
    ? calculateTotals(items, discount, tax, serviceCharge)
    : {
        subTotal: current.subTotal,
        discount: current.discount,
        tax: current.tax,
        serviceCharge: current.serviceCharge,
        total: current.total
      };
  const nextTableId = input.tableId ?? current.tableId;
  const nextOrder: LocalOrder = {
    ...current,
    name: input.name ?? current.name,
    tableId: nextTableId,
    type: input.type ?? current.type,
    status: input.status ?? current.status,
    orderedAt: input.orderedAt ?? current.orderedAt,
    items,
    ...totals,
    paymentMethod: input.paymentMethod ?? current.paymentMethod,
    notes: input.notes ?? current.notes,
    updatedAt: now,
    syncStatus: "pending"
  };

  await offlineDb.transaction("rw", offlineDb.orders, offlineDb.opsTables, offlineDb.syncQueue, offlineDb.deviceState, async () => {
    if (nextTableId !== current.tableId) {
      await moveTableOccupancy(context.tenantId, orderId, current.tableId, nextTableId, now);
    }
    await offlineDb.orders.put(nextOrder);
    await queueOperation({
      entityType: "order",
      entityId: orderId,
      action: "update",
      payload: input,
      baseVersion: localOrderBaseVersion(current),
      tenantId: context.tenantId,
      userId: context.userId
    });
  });

  void startSync(context.tenantId, context.token);
  return nextOrder;
}

export async function completeLocalOrder(context: OfflineContext, orderId: string, input: CompleteOrderInput) {
  const { customerName: rawCustomerName, ...completion } = input;
  const customerName = rawCustomerName?.trim();
  input = customerName ? { ...completion, customerName } : completion;
  const current = await requireLocalOrder(context.tenantId, orderId);
  if (current.status === "CANCELLED") throw new Error("لا يمكن إنهاء طلب ملغى.");
  if (current.invoiceId) return current;
  if (input.payments !== undefined) {
    const restaurant = await offlineDb.restaurants.get(context.tenantId);
    if ((current.currency ?? restaurant?.currency) !== "SYP") throw new Error("هذا الطلب ليس مسعراً بالليرة السورية.");
    if (input.payments.some(row => row.currency === "USD") && !restaurant?.usdExchangeRate) throw new Error("احفظ سعر الصرف أولاً.");
  }
  const settlement = input.payments !== undefined ? normalizeSettlement(current.total, input.settlementMode ?? "FULL", input.payments) : null;
  if (settlement) input = { ...input, paidAmount: settlement.paidAmount, paymentMethod: settlement.paidAmount === 0 ? "DEBT" : settlement.payments[0]?.method ?? "CASH" };
  if (input.paymentMethod === "SPLIT" && input.paidAmount <= 0) throw new Error("أدخل المبلغ المدفوع قبل إنهاء طلب الدفع المقسّم.");

  const now = new Date().toISOString();
  const paidAmount = input.paymentMethod === "DEBT" ? 0 : input.paidAmount ?? current.total;
  if (paidAmount > current.total) throw new Error("المبلغ المدفوع أكبر من إجمالي الطلب.");
  const remainingAmount = Math.max(current.total - paidAmount, 0);
  const invoiceId = `order_${orderId}`;
  const paymentId = paidAmount > 0 ? `order_${orderId}` : "";
  const nextOrder: LocalOrder = {
    ...current,
    status: "COMPLETED",
    ...(customerName ? { customerName } : {}),
    ...(settlement ? { payments: settlement.payments, settlementMode: input.settlementMode } : {}),
    paidAmount,
    paymentStatus: remainingAmount === 0 ? "PAID" : paidAmount > 0 ? "PARTIAL" : "UNPAID",
    paymentMethod: input.paymentMethod,
    invoiceId,
    paymentId,
    completedAt: now,
    inventoryDeductedAt: "",
    closedById: context.userId,
    updatedAt: now,
    syncStatus: "pending"
  };

  await offlineDb.transaction("rw", [
    offlineDb.orders,
    offlineDb.opsTables,
    offlineDb.invoices,
    offlineDb.payments,
    offlineDb.cashMovements,
    offlineDb.cashRegisters,
    offlineDb.journalEntries,
    offlineDb.syncQueue,
    offlineDb.deviceState
  ], async () => {
    const latest = await offlineDb.orders.get(orderId);
    if (latest?.invoiceId) return;
    await offlineDb.orders.put(nextOrder);
    await releaseOrderTable(context.tenantId, orderId, current.tableId, now);
    await putLocalCompletionArtifacts(context, nextOrder, input, invoiceId, paymentId, paidAmount, remainingAmount, now);
    await queueOperation({
      entityType: "order",
      entityId: orderId,
      action: "completeOrder",
      payload: input,
      baseVersion: localOrderBaseVersion(current),
      tenantId: context.tenantId,
      userId: context.userId
    });
  });

  void startSync(context.tenantId, context.token);
  return nextOrder;
}

export async function cancelLocalOrder(context: OfflineContext, orderId: string, reason: string) {
  const current = await requireLocalOrder(context.tenantId, orderId);
  if (current.status === "CANCELLED") return current;
  const now = new Date().toISOString();
  const nextOrder: LocalOrder = {
    ...current,
    status: "CANCELLED",
    notes: [current.notes, `Cancelled: ${reason}`].filter(Boolean).join("\n"),
    updatedAt: now,
    syncStatus: "pending"
  };

  await offlineDb.transaction("rw", [offlineDb.orders, offlineDb.opsTables, offlineDb.invoices, offlineDb.payments, offlineDb.cashMovements, offlineDb.cashRegisters, offlineDb.journalEntries, offlineDb.syncQueue, offlineDb.deviceState], async () => {
    if (current.invoiceId) {
      const invoice = await offlineDb.invoices.get(current.invoiceId);
      if (invoice) {
        await offlineDb.invoices.put({ ...invoice, status: "VOID", updatedAt: now, syncStatus: "pending" });
        await offlineDb.invoices.put({ ...invoice, id: `refund_order_${orderId}`, type: "REFUND", status: "PAID", remainingAmount: 0, notes: reason, createdAt: now, updatedAt: now, syncStatus: "pending" });
      }
      const payments = (await offlineDb.payments.where("orderId").equals(orderId).filter(p => p.restaurantId === context.tenantId && p.type === "SALE").toArray()).sort((a, b) => a.id.localeCompare(b.id));
      for (const [index, payment] of payments.entries()) {
        const source = await offlineDb.cashMovements.get(payment.id);
        const id = index === 0 ? `cancel_order_${orderId}` : `cancel_order_${orderId}_${index}`;
        await offlineDb.payments.put({ ...payment, id, type: "REFUND", invoiceId: `refund_order_${orderId}`, note: reason, paidAt: now, createdAt: now, syncStatus: "pending" });
        await offlineDb.cashMovements.put({ id, restaurantId: context.tenantId, cashRegisterId: source?.cashRegisterId ?? "", amount: payment.amount, method: payment.method, ...(payment.currency ? { currency: payment.currency, originalAmount: payment.originalAmount, exchangeRate: payment.exchangeRate } : {}), type: "OUT", referenceType: "ORDER_CANCEL", referenceId: orderId, note: reason, createdAt: now, syncStatus: "pending" });
        if (source?.cashRegisterId) {
          const register = await offlineDb.cashRegisters.get(source.cashRegisterId);
          if (register) await offlineDb.cashRegisters.put({ ...register, currentBalance: register.currentBalance - payment.amount, syncStatus: "pending" });
        }
      }
      await offlineDb.journalEntries.put({ id: `reverse_order_${orderId}`, restaurantId: context.tenantId, status: "POSTED", referenceType: "ORDER_CANCEL", referenceId: orderId, lines: buildSaleJournalLines(current.paidAmount, Math.max(current.total - current.paidAmount, 0), current.total).map(line => ({ ...line, debit: line.credit, credit: line.debit })), memo: reason, postedAt: now, createdAt: now, syncStatus: "pending" });
    }
    await offlineDb.orders.put(nextOrder);
    await releaseOrderTable(context.tenantId, orderId, current.tableId, now);
    const settlements = await offlineDb.syncQueue.where("tenantId").equals(context.tenantId).filter(op => op.status !== "synced" && op.entityType === "payment" && op.payload.invoiceId === current.invoiceId).toArray();
    await queueOperation({
      entityType: "order",
      entityId: orderId,
      action: "cancelOrder",
      dependencyIds: settlements.map(op => op.operationId),
      payload: { reason },
      baseVersion: localOrderBaseVersion(current),
      tenantId: context.tenantId,
      userId: context.userId
    });
  });

  void startSync(context.tenantId, context.token);
  return nextOrder;
}

async function hydrateLocalOrderItems(tenantId: string, lines: OrderLineInput[]) {
  const items: OpsOrderLine[] = [];
  for (const line of lines) {
    const menuItem = await offlineDb.menuItems.get(line.menuItemId);
    if (!menuItem || menuItem.restaurantId !== tenantId) throw new Error(`الصنف غير موجود محليًا: ${line.menuItemId}`);
    const quantity = numberValue(line.quantity);
    const unitPrice = numberValue(menuItem.price);
    items.push({
      menuItemId: line.menuItemId,
      name: menuItem.name,
      quantity,
      unitPrice,
      notes: line.notes,
      modifiers: line.modifiers,
      total: quantity * unitPrice
    });
  }
  return items;
}

async function requireLocalOrder(tenantId: string, orderId: string) {
  const order = await offlineDb.orders.get(orderId);
  if (!order || order.restaurantId !== tenantId || order.deletedAt) throw new Error("الطلب غير موجود محليًا.");
  return order;
}

function assertOrderEditable(order: LocalOrder) {
  if (["COMPLETED", "CANCELLED"].includes(order.status) || order.invoiceId || order.paymentId) {
    throw new Error("لا يمكن تعديل طلب مكتمل أو مرتبط ماليًا.");
  }
}

async function moveTableOccupancy(tenantId: string, orderId: string, previousTableId: string, nextTableId: string, now: string) {
  if (previousTableId) {
    await releaseOrderTable(tenantId, orderId, previousTableId, now);
  }
  if (nextTableId) {
    const nextTable = await offlineDb.opsTables.get(nextTableId);
    if (!nextTable || nextTable.restaurantId !== tenantId) throw new Error("الطاولة الجديدة غير موجودة.");
    if (nextTable.status === "DISABLED") throw new Error("لا يمكن نقل الطلب إلى طاولة معطلة.");
    if (nextTable.currentOrderId && nextTable.currentOrderId !== orderId) throw new Error("الطاولة الجديدة تحتوي على طلب مفتوح.");
    await offlineDb.opsTables.put({ ...nextTable, status: "OCCUPIED", currentOrderId: orderId, updatedAt: now });
  }
}

async function releaseOrderTable(tenantId: string, orderId: string, tableId: string, now: string) {
  if (!tableId) return;
  const table = await offlineDb.opsTables.get(tableId);
  if (!table || table.restaurantId !== tenantId || table.currentOrderId !== orderId) return;
  await offlineDb.opsTables.put({ ...table, status: "AVAILABLE", currentOrderId: "", updatedAt: now });
}

async function putLocalCompletionArtifacts(
  context: OfflineContext,
  order: LocalOrder,
  input: CompleteOrderInput,
  invoiceId: string,
  paymentId: string,
  paidAmount: number,
  remainingAmount: number,
  now: string
) {
  const invoice: Invoice = {
    id: invoiceId,
    ...(order.customerName ? { customerName: order.customerName } : {}),
    ...(order.currency ? { currency: order.currency } : {}),
    ...(order.payments ? { payments: order.payments, settlementMode: order.settlementMode } : {}),
    type: "SALE",
    status: remainingAmount === 0 ? "PAID" : paidAmount > 0 ? "PARTIAL" : "UNPAID",
    orderId: order.id,
    supplierId: "",
    items: order.items.map((item) => ({ itemId: item.menuItemId, name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, total: item.total })),
    subTotal: order.subTotal,
    discount: order.discount,
    tax: order.tax,
    serviceCharge: order.serviceCharge,
    total: order.total,
    paidAmount,
    remainingAmount,
    paymentMethod: input.paymentMethod,
    dueDate: "",
    notes: input.note,
    createdAt: now,
    updatedAt: now
  };
  await offlineDb.invoices.put({ ...invoice, restaurantId: context.tenantId, syncStatus: "pending", createdById: context.userId });

  const rows = order.payments ?? (paidAmount > 0 ? [{ amount: paidAmount, method: input.paymentMethod, cashRegisterId: input.cashRegisterId ?? "" }] : []);
  for (const [index, row] of rows.entries()) {
    const id = index === 0 ? paymentId : `${paymentId}_${index}`;
    await offlineDb.payments.put({ ...row, id, invoiceId, orderId: order.id, supplierId: "", type: "SALE", note: input.note, paidAt: now, createdAt: now, restaurantId: context.tenantId, syncStatus: "pending", createdById: context.userId });
    await offlineDb.cashMovements.put({ ...row, id, type: "IN", referenceType: "PAYMENT", referenceId: id, note: input.note, createdAt: now, restaurantId: context.tenantId, syncStatus: "pending", createdById: context.userId });
    if (row.cashRegisterId) {
      const register = await offlineDb.cashRegisters.get(row.cashRegisterId);
      if (!register || register.restaurantId !== context.tenantId) throw new Error("الصندوق غير موجود.");
      await offlineDb.cashRegisters.put({ ...register, currentBalance: numberValue(register.currentBalance) + row.amount, syncStatus: "pending" });
    }
  }

  const journal: JournalEntry = {
    id: `order_${order.id}`,
    status: "POSTED",
    referenceType: "ORDER",
    referenceId: order.id,
    lines: buildSaleJournalLines(paidAmount, remainingAmount, order.total),
    memo: `Order ${order.id}`,
    postedAt: now,
    createdAt: now
  };
  await offlineDb.journalEntries.put({ ...journal, restaurantId: context.tenantId, syncStatus: "pending", createdById: context.userId });
}

function buildSaleJournalLines(paidAmount: number, remainingAmount: number, total: number) {
  const lines: JournalEntry["lines"] = [];
  if (paidAmount > 0) lines.push({ accountId: "cash", debit: paidAmount, credit: 0, memo: "Payment received" });
  if (remainingAmount > 0) lines.push({ accountId: "accounts_receivable", debit: remainingAmount, credit: 0, memo: "Receivable" });
  lines.push({ accountId: "sales", debit: 0, credit: total, memo: "Sales revenue" });
  return lines;
}

function calculateTotals(items: OpsOrderLine[], discount: number, tax: number, serviceCharge: number) {
  const subTotal = items.reduce((sum, item) => sum + numberValue(item.total), 0);
  if (discount > subTotal) throw new Error("الخصم لا يمكن أن يتجاوز الإجمالي.");
  return {
    subTotal,
    discount,
    tax,
    serviceCharge,
    total: Math.max(subTotal - discount + tax + serviceCharge, 0)
  };
}

function defaultOrderName(tableName: string, orderedAt: string) {
  const parsed = new Date(orderedAt);
  const time = Number.isNaN(parsed.getTime())
    ? new Date().toISOString().slice(11, 16)
    : `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
  return `${tableName || "طلب"} - ${time}`;
}

function orderVersion(order: OpsOrder) {
  const explicitVersion = Number(order.version);
  if (Number.isFinite(explicitVersion) && explicitVersion > 0) return explicitVersion;
  return versionFromDates(order.updatedAt, order.createdAt);
}

function localOrderBaseVersion(order: LocalOrder) {
  const explicitVersion = Number(order.version);
  if (Number.isFinite(explicitVersion) && explicitVersion >= 0) return explicitVersion;
  return versionFromDates(order.updatedAt, order.createdAt);
}

function versionFromDates(updatedAt?: string, createdAt?: string) {
  const value = Date.parse(updatedAt ?? createdAt ?? "");
  return Number.isFinite(value) ? value : 0;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
