import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { invoiceReconciliationPatch, shouldApplyServerInvoiceToLocal } from "../src/offline/invoice-cache-rules.ts";

describe("invoice cache hydration rules", () => {
  it("applies server invoices when there is no local copy", () => {
    assert.equal(shouldApplyServerInvoiceToLocal(undefined, "restaurant-a"), true);
  });

  it("allows server confirmation to reconcile a pending local invoice", () => {
    assert.equal(shouldApplyServerInvoiceToLocal({ restaurantId: "restaurant-a", syncStatus: "pending" }, "restaurant-a"), true);
  });

  it("does not replace an invoice from another restaurant", () => {
    assert.equal(shouldApplyServerInvoiceToLocal({ restaurantId: "restaurant-b", syncStatus: "synced" }, "restaurant-a"), false);
  });

  it("does not overwrite a local invoice in conflict", () => {
    assert.equal(shouldApplyServerInvoiceToLocal({ restaurantId: "restaurant-a", syncStatus: "conflict" }, "restaurant-a"), false);
  });

  it("records total mismatches during reconciliation", () => {
    assert.deepEqual(invoiceReconciliationPatch({ total: 125 }, { total: 120 }), {
      reconciliationWarning: "invoice_total_mismatch",
      localTotalBeforeReconcile: 120
    });
  });

  it("does not warn when local and server totals match", () => {
    assert.deepEqual(invoiceReconciliationPatch({ total: 120 }, { total: 120 }), {});
  });
});
