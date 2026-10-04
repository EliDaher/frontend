import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildReceipt } from "../src/components/owner/ops/receipt.ts";

const restaurant = {
  id: "restaurant-a",
  name: "Main Restaurant",
  receiptRestaurantName: "Receipt Name",
  receiptLocation: "Damascus",
  vatNumber: "VAT-1",
  currency: "SYP"
};

const order = {
  id: "order_abcdef",
  name: "Table 1",
  tableId: "table-1",
  type: "DINE_IN",
  source: "POS",
  status: "COMPLETED",
  items: [
    { menuItemId: "item-live", name: "Live item", quantity: 9, unitPrice: 99, notes: "", modifiers: [], total: 891 }
  ],
  subTotal: 891,
  discount: 0,
  tax: 0,
  serviceCharge: 0,
  total: 891,
  paidAmount: 891,
  paymentStatus: "PAID",
  paymentMethod: "CASH",
  notes: "",
  orderedAt: "2026-09-26T08:00:00.000Z",
  invoiceId: "order_abcdef",
  paymentId: "order_abcdef",
  createdAt: "2026-09-26T08:00:00.000Z",
  updatedAt: "2026-09-26T08:05:00.000Z"
};

const invoice = {
  id: "order_abcdef",
  type: "SALE",
  status: "PAID",
  orderId: order.id,
  supplierId: "",
  items: [
    { itemId: "item-snapshot", name: "Snapshot item", quantity: 2, unitPrice: 150, total: 300 }
  ],
  subTotal: 300,
  discount: 10,
  tax: 15,
  serviceCharge: 5,
  total: 310,
  paidAmount: 310,
  remainingAmount: 0,
  paymentMethod: "CASH",
  dueDate: "",
  notes: "",
  createdAt: "2026-09-26T08:06:00.000Z",
  updatedAt: "2026-09-26T08:06:00.000Z"
};

describe("order receipt snapshots", () => {
  it("prints from the local pending invoice snapshot when available", () => {
    const receipt = buildReceipt(order, restaurant, { id: "table-1", name: "1" }, { ...invoice, syncStatus: "pending" });

    assert.equal(receipt.items[0].name, "Snapshot item");
    assert.equal(receipt.baseAmount, 290);
    assert.equal(receipt.consumerTax, 15);
    assert.equal(receipt.localAdminTax, 5);
    assert.equal(receipt.payableAmount, 310);
    assert.equal(receipt.confirmationStatus, "فاتورة محلية - بانتظار المزامنة");
  });

  it("marks synced invoices as confirmed receipts", () => {
    const receipt = buildReceipt(order, restaurant, null, { ...invoice, syncStatus: "synced" });

    assert.equal(receipt.confirmationStatus, "فاتورة مؤكدة");
    assert.equal(receipt.invoiceNo, "abcde");
  });

  it("does not use later live order item changes when an invoice snapshot exists", () => {
    const changedOrder = {
      ...order,
      items: [{ menuItemId: "mutated", name: "Mutated live order", quantity: 1, unitPrice: 1, notes: "", modifiers: [], total: 1 }],
      total: 1
    };
    const receipt = buildReceipt(changedOrder, restaurant, null, { ...invoice, syncStatus: "synced" });

    assert.deepEqual(receipt.items.map((item) => item.name), ["Snapshot item"]);
    assert.equal(receipt.payableAmount, 310);
  });
});
