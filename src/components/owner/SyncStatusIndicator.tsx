"use client";

import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { retryFailedOperations } from "@/offline/outbox";
import { startSync } from "@/offline/sync-engine";
import type { SyncAction, SyncEntityType, SyncStatus } from "@/offline/schema";

export function SyncStatusIndicator({ tenantId, token }: { tenantId?: string; token?: string }) {
  const [storedToken, setStoredToken] = useState(token ?? "");
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    setStoredToken(token ?? window.localStorage.getItem("menu-owner-token") ?? "");
  }, [token]);

  const status = useSyncStatus(tenantId, storedToken);
  const offline = !status.browserOnline || !status.apiReachable;
  const failed = status.failed + status.conflict;
  const waiting = status.totalWaiting;
  const syncing = status.syncing > 0 || status.syncInProgress;

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
          className="inline-flex h-10 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-black text-red-700"
          aria-expanded={open}
          aria-label="تفاصيل فشل المزامنة"
        >
          <AlertTriangle className="h-4 w-4" />
          {failed} فشل
        </button>
        {open ? (
          <div className="absolute left-0 top-12 z-50 w-[min(360px,calc(100vw-2rem))] rounded-md border border-red-100 bg-white p-3 text-right shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
              <div>
                <p className="text-sm font-black text-slate-950">عمليات لم تُحفظ</p>
                <p className="mt-0.5 text-xs font-bold text-slate-500">راجع السبب ثم أعد المحاولة عند الإمكان.</p>
              </div>
              <button
                type="button"
                onClick={retryNow}
                disabled={retrying || !storedToken}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCw className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
                إعادة
              </button>
            </div>
            <div className="mt-2 max-h-80 space-y-2 overflow-y-auto">
              {status.issues.length ? status.issues.map((issue) => (
                <div key={issue.operationId} className="rounded-md border border-slate-100 bg-slate-50 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{actionLabel(issue.entityType, issue.action)} · {issue.entityLabel}</p>
                      <p className="mt-1 text-xs font-bold text-red-700">{localizedError(issue.code, issue.message)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black ${issue.status === "conflict" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {statusLabel(issue.status)}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-1 text-[11px] font-bold text-slate-500">
                    <span>آخر محاولة: {formatDateTime(issue.lastAttemptAt ?? issue.createdAt)}</span>
                    <span>عدد المحاولات: {issue.retryCount}</span>
                    {issue.blockedBy.length ? <span>السبب: عملية سابقة لم تنجح بعد.</span> : null}
                  </div>
                </div>
              )) : (
                <p className="rounded-md bg-slate-50 p-3 text-xs font-bold text-slate-600">لا توجد تفاصيل محفوظة لهذه العمليات.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (offline) {
    return (
      <span className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-100 px-3 text-xs font-black text-slate-700">
        <CloudOff className="h-4 w-4" />
        دون اتصال {waiting > 0 ? `· ${waiting}` : ""}
      </span>
    );
  }

  if (syncing) {
    return (
      <span className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-black text-amber-700">
        <RefreshCw className="h-4 w-4 animate-spin" />
        مزامنة
      </span>
    );
  }

  if (waiting > 0) {
    return (
      <span className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-black text-amber-700">
        <RefreshCw className="h-4 w-4" />
        {waiting} بانتظار المزامنة
      </span>
    );
  }

  return (
    <span className="hidden h-10 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-700 sm:inline-flex">
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
