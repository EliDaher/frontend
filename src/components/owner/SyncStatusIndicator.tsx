"use client";

import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw, RotateCw } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { cn } from "@/components/shared";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { retryFailedOperations } from "@/offline/outbox";
import { startSync } from "@/offline/sync-engine";
import type { SyncAction, SyncEntityType, SyncStatus } from "@/offline/schema";

export function SyncStatusIndicator({ tenantId, token }: { tenantId?: string; token?: string }) {
  const [storedToken, setStoredToken] = useState(token ?? "");
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const popoverId = useId();
  useEffect(() => {
    setStoredToken(token ?? window.localStorage.getItem("menu-owner-token") ?? "");
  }, [token]);

  const status = useSyncStatus(tenantId, storedToken);
  const offline = !status.browserOnline || !status.apiReachable;
  const failed = status.failed + status.conflict;
  const waiting = status.totalWaiting;
  const syncing = status.syncing > 0 || status.syncInProgress;

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  async function retryNow() {
    if (!tenantId || !storedToken || retrying) return;
    setRetrying(true);
    try {
      await retryFailedOperations(tenantId);
      await startSync(tenantId, storedToken);
    } finally {
      setRetrying(false);
    }
  }

  if (failed > 0) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex h-10 items-center gap-2 rounded-app-md border border-app-danger-soft bg-app-danger-soft px-3 text-xs font-semibold text-app-danger transition-colors hover:border-app-danger focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={open ? popoverId : undefined}
          aria-label="تفاصيل فشل المزامنة"
        >
          <AlertTriangle className="h-4 w-4" />
          {failed} فشل
        </button>
        {open ? (
          <div
            id={popoverId}
            role="dialog"
            aria-label="تفاصيل فشل المزامنة"
            className="absolute end-0 top-12 z-50 w-[min(360px,calc(100vw-2rem))] rounded-app-lg border border-app-border bg-app-surface p-3 text-start text-app-ink shadow-app-dialog"
          >
            <div className="flex items-center justify-between gap-3 border-b border-app-border pb-2">
              <div>
                <p className="text-sm font-semibold text-app-ink">عمليات لم تُحفظ</p>
                <p className="mt-0.5 text-app-helper text-app-muted">راجع السبب ثم أعد المحاولة عند الإمكان.</p>
              </div>
              <button
                type="button"
                onClick={retryNow}
                disabled={retrying || !storedToken}
                className="inline-flex h-10 items-center gap-2 rounded-app-md border border-app-border bg-app-surface px-2 text-xs font-semibold text-app-ink transition-colors hover:bg-app-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft disabled:cursor-not-allowed disabled:bg-app-surface-muted disabled:text-app-muted sm:h-9"
              >
                <RotateCw className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
                إعادة
              </button>
            </div>
            <div className="mt-2 max-h-80 space-y-2 overflow-y-auto">
              {status.issues.length ? status.issues.map((issue) => (
                <div key={issue.operationId} className="rounded-app-md border border-app-border bg-app-surface-muted p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-app-ink">{actionLabel(issue.entityType, issue.action)} · {issue.entityLabel}</p>
                      <p className="mt-1 text-app-helper font-semibold text-app-danger">{localizedError(issue.code, issue.message)}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-app-sm border px-2 py-1 text-[11px] font-semibold leading-none",
                        issue.status === "conflict"
                          ? "border-app-danger-soft bg-app-danger-soft text-app-danger"
                          : "border-app-warning-soft bg-app-warning-soft text-app-warning"
                      )}
                    >
                      {statusLabel(issue.status)}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-1 text-[11px] font-medium text-app-muted">
                    <span>آخر محاولة: {formatDateTime(issue.lastAttemptAt ?? issue.createdAt)}</span>
                    <span>عدد المحاولات: {issue.retryCount}</span>
                    {issue.blockedBy.length ? <span>السبب: عملية سابقة لم تنجح بعد.</span> : null}
                  </div>
                </div>
              )) : (
                <p className="rounded-app-md bg-app-surface-muted p-3 text-app-helper font-medium text-app-muted">لا توجد تفاصيل محفوظة لهذه العمليات.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (offline) {
    return (
      <span className="inline-flex h-10 items-center gap-2 rounded-app-md border border-app-border bg-app-surface-muted px-3 text-xs font-semibold text-app-muted">
        <CloudOff className="h-4 w-4" />
        دون اتصال {waiting > 0 ? `· ${waiting}` : ""}
      </span>
    );
  }

  if (syncing) {
    return (
      <span className="inline-flex h-10 items-center gap-2 rounded-app-md border border-app-warning-soft bg-app-warning-soft px-3 text-xs font-semibold text-app-warning">
        <RefreshCw className="h-4 w-4 animate-spin" />
        مزامنة
      </span>
    );
  }

  if (waiting > 0) {
    return (
      <span className="inline-flex h-10 items-center gap-2 rounded-app-md border border-app-warning-soft bg-app-warning-soft px-3 text-xs font-semibold text-app-warning">
        <RefreshCw className="h-4 w-4" />
        {waiting} بانتظار المزامنة
      </span>
    );
  }

  return (
    <span className="hidden h-10 items-center gap-2 rounded-app-md border border-app-success-soft bg-app-success-soft px-3 text-xs font-semibold text-app-success sm:inline-flex">
      <CheckCircle2 className="h-4 w-4" />
      متزامن
    </span>
  );
}

const entityLabels: Record<SyncEntityType, string> = {
  table: "طاولة",
  order: "طلب",
  inventoryItem: "مادة مخزون",
  inventoryTransaction: "حركة مخزون",
  recipeIngredient: "وصفة",
  supplier: "مورد",
  invoice: "فاتورة",
  payment: "دفعة",
  expense: "مصروف",
  cashRegister: "صندوق",
  cashMovement: "حركة صندوق",
  account: "حساب",
  journalEntry: "قيد",
  category: "قسم",
  menuItem: "صنف"
};

const actionLabels: Record<SyncAction, string> = {
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
  completeOrder: "إنهاء",
  cancelOrder: "إلغاء",
  adjustInventory: "تسوية",
  saveRecipe: "حفظ وصفة"
};

function actionLabel(entityType: SyncEntityType, action: SyncAction) {
  return `${actionLabels[action]} ${entityLabels[entityType]}`;
}

function statusLabel(status: SyncStatus) {
  if (status === "conflict") return "تعارض";
  if (status === "failed") return "فشل";
  if (status === "pending") return "معلّق";
  if (status === "syncing") return "مزامنة";
  return "تم";
}

function localizedError(code: string, fallback: string) {
  const messages: Record<string, string> = {
    table_occupied: "الطاولة أصبحت مشغولة قبل حفظ العملية.",
    cash_register_missing: "الصندوق المحدد غير موجود أو تم حذفه.",
    missing_order_dependency: "الطلب لم يُحفظ على السيرفر بعد، لذلك لم يتم حفظ هذه العملية.",
    permission_denied: "لا توجد صلاحية كافية لحفظ هذه العملية.",
    validation_error: "بيانات العملية غير مكتملة أو غير مقبولة.",
    blocked_dependency: "بانتظار حل عملية سابقة على نفس الطلب أو الطاولة.",
    version_conflict: "تم تعديل هذا السجل من جهاز آخر قبل المزامنة.",
    missing_entity: "السجل غير موجود على السيرفر.",
    network_error: "تعذر الاتصال بالسيرفر. ستتم إعادة المحاولة.",
    stale_sync: "انقطعت المزامنة قبل اكتمال الحفظ، ستتم إعادة المحاولة.",
    sync_transaction_order_error: "حدث خطأ داخلي في ترتيب حفظ المزامنة. أعد المحاولة بعد تحديث النظام."
  };
  return messages[code] ?? fallback;
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "غير معروف";
  return parsed.toLocaleString("ar", { dateStyle: "short", timeStyle: "short" });
}
