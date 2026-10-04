export type LocalInvoiceCacheSnapshot = {
  restaurantId?: string;
  syncStatus?: string;
  total?: unknown;
};

export type RemoteInvoiceCacheSnapshot = {
  total?: unknown;
};

export function shouldApplyServerInvoiceToLocal(local: LocalInvoiceCacheSnapshot | undefined, tenantId: string) {
  if (!local) return true;
  if (local.restaurantId && local.restaurantId !== tenantId) return false;
  return local.syncStatus !== "conflict";
}

export function invoiceReconciliationPatch(remote: RemoteInvoiceCacheSnapshot, local: LocalInvoiceCacheSnapshot | undefined) {
  if (!local) return {};
  const localTotal = Number(local.total);
  const remoteTotal = Number(remote.total);
  if (!Number.isFinite(localTotal) || !Number.isFinite(remoteTotal) || Math.abs(localTotal - remoteTotal) < 0.0001) return {};
  return {
    reconciliationWarning: "invoice_total_mismatch",
    localTotalBeforeReconcile: localTotal
  };
}
