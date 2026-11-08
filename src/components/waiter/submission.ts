import { ApiError } from "@/lib/api-errors";
import type { OrderLine } from "./draft";
import type { BatchConfirmation, WaiterSession } from "./data-client";

export type WaiterBatch = {
  operationId: string;
  tableId: string;
  orderId: string;
  createdAt: string;
  items: OrderLine[];
  orderNote?: string;
  status: "pending" | "sent" | "review";
  error?: string;
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

  send(s: WaiterSession, recovery: Recovery): Promise<void> {
    const existing = this.running.get(s.cacheSessionId);
    if (existing) return existing;
    const promise = this.run(s, recovery).finally(() => { this.running.delete(s.cacheSessionId); });
    this.running.set(s.cacheSessionId, promise);
    return promise;
  }

  private async run(s: WaiterSession, r: Recovery) {
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
        try {
          const result = await this.post(s.token, {
            operationId: batch.operationId, tableId: batch.tableId, orderId: batch.orderId,
            createdAt: batch.createdAt,
            items: batch.items.map(({ menuItemId, quantity, notes }) => ({ menuItemId, quantity, notes })),
            ...(batch.orderNote !== undefined ? { orderNote: batch.orderNote } : {}),
          });
          if (!r.current()) break;
          r.confirmed(batch, result);
        } catch (error) {
          if (!r.current()) break;
          if (error instanceof ApiError && error.status === 401) { r.expired(); break; }
          if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429) {
            r.review(batch, error.message);
          } else {
            r.failed("لم يصل تأكيد الخادم. الدفعات محفوظة؛ اضغط إعادة إرسال الدفعات أو أعد الاتصال.");
            break;
          }
        }
      }
    } finally { if (r.current()) r.sending(false); }
  }
}
