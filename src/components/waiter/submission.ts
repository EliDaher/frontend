import { ApiError } from "@/lib/api-errors";
import type { OrderLine } from "./draft";
import type { BatchConfirmation, WaiterSession } from "./data-client";
import { persistBatch, waiterOwner } from "./outbox";

export type WaiterBatch = {
  operationId: string;
  tableId: string;
  orderId: string;
  createdAt: string;
  items: OrderLine[];
  orderNote?: string;
  status: "pending" | "sent" | "review";
  error?: string;
  retryCount?: number;
  nextAttemptAt?: number;
  draftLineIds?: string[];
};
type Recovery = {
  pending(): WaiterBatch[];
  current(): boolean;
  online(): boolean;
  waitForRefresh(): Promise<void>;
  sending(value: boolean): void;
  confirmed(batch: WaiterBatch, result: BatchConfirmation): void;
  review(batch: WaiterBatch, message: string): void;
  failed(message: string): void;
  expired(): void;
};

// One finite pass per user action/page opening/reconnection. No polling or recursive retries.
export class PendingBatchSender {
  private running = new Map<string, Promise<void>>();
  private post: (token: string, body: object) => Promise<BatchConfirmation>;
  constructor(post: (token: string, body: object) => Promise<BatchConfirmation>) { this.post = post; }
  busy(s: WaiterSession) { return this.running.has(s.cacheSessionId); }

  send(s: WaiterSession, recovery: Recovery, force = true): Promise<void> {
    const existing = this.running.get(s.cacheSessionId);
    if (existing) return existing;
    const promise = this.run(s, recovery, force).finally(() => { this.running.delete(s.cacheSessionId); });
    this.running.set(s.cacheSessionId, promise);
    return promise;
  }

  private async run(s: WaiterSession, r: Recovery, force: boolean) {
    if (!r.current()) return;
    if (!r.online()) {
      r.failed("الدفعات محفوظة بانتظار الاتصال. يمكنك إعادة الإرسال يدوياً.");
      return;
    }
    r.sending(true);
    try {
      await r.waitForRefresh();
      for (const batch of r.pending().filter(b => b.status === "pending")) {
        if (!r.current()) break;
        if (!force && (batch.nextAttemptAt ?? 0) > Date.now()) continue;
        try {
          const result = await this.post(s.token, {
            operationId: batch.operationId, tableId: batch.tableId, orderId: batch.orderId,
            createdAt: batch.createdAt,
            items: batch.items.map(({ menuItemId, quantity, notes }) => ({ menuItemId, quantity, notes })),
            ...(batch.orderNote !== undefined ? { orderNote: batch.orderNote } : {}),
          });
          if (!r.current()) break;
          await persistBatch(waiterOwner(s.user.restaurantId, s.user.id), { ...batch, status: "sent" });
          r.confirmed(batch, result);
        } catch (error) {
          if (!r.current()) break;
          if (error instanceof ApiError && error.status === 401) { r.expired(); break; }
          if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429) {
            await persistBatch(waiterOwner(s.user.restaurantId, s.user.id), { ...batch, status: "review", error: error.message });
            r.review(batch, error.message);
          } else {
            const retryCount = (batch.retryCount ?? 0) + 1;
            const attention = Date.now() - Date.parse(batch.createdAt) >= 24 * 3600000 && retryCount > 1;
            const errorMessage = "لم يصل تأكيد الخادم. الدفعة محفوظة وتحتاج مراجعة قبل إعادة الإرسال.";
            await persistBatch(waiterOwner(s.user.restaurantId, s.user.id), { ...batch, retryCount,
              nextAttemptAt: Date.now() + Math.min(900000, 30000 * 2 ** Math.min(retryCount - 1, 5)) * (1 + Math.random() * .2),
              status: attention ? "review" : "pending", ...(attention ? { error: errorMessage } : {}) });
            if (attention) r.review(batch, errorMessage);
            r.failed("لم يصل تأكيد الخادم. الدفعات محفوظة؛ اضغط إعادة إرسال الدفعات أو أعد الاتصال.");
            break;
          }
        }
      }
    } finally { if (r.current()) r.sending(false); }
  }
}
