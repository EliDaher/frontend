"use client";
import { useEffect, useState } from "react";
import { adminRequest } from "@/lib/api";
type Batch = {
    operationId: string;
    waiterName: string;
    orderNote?: string;
    createdAt: string;
    acceptedAt: string;
    items: {
        name: string;
        quantity: number;
        notes: string;
    }[];
};
export function WaiterBatchHistory({ token, orderId }: {
    token: string;
    orderId?: string;
}) {
    const [rows, setRows] = useState<Batch[]>([]), [error, setError] = useState("");
    useEffect(() => {
        setRows([]); setError("");
        if (!token || !orderId) return;
        let active = true, busy = false, cursor = 0;
        const seen = new Map<string, Batch>();
        const load = async () => {
            if (busy) return;
            busy = true;
            try {
                let more = true;
                while (active && more) {
                    const result = await adminRequest<{ batches: Batch[]; cursor: number; legacy: boolean; hasMore: boolean }>(`/api/owner/waiters/orders/${encodeURIComponent(orderId)}/batches?incremental=1&after=${cursor}`, token);
                    if (!active) return;
                    if (result.legacy) seen.clear();
                    for (const batch of result.batches) seen.set(batch.operationId, batch);
                    if (result.hasMore && result.cursor <= cursor) throw new Error("History cursor did not advance");
                    cursor = result.cursor; more = result.hasMore;
                    setRows([...seen.values()].sort((a, b) => a.acceptedAt.localeCompare(b.acceptedAt)));
                    setError("");
                }
            } catch { if (active) setError("تعذر تحميل سجل إضافات النوّادل"); }
            finally { busy = false; }
        };
        void load();
        const timer = setInterval(() => void load(), 15_000);
        return () => { active = false; clearInterval(timer); };
    }, [token, orderId]);
    if (!orderId || (!rows.length && !error))
    return null; return <details className="my-3 rounded-xl border bg-app-surface p-3"><summary className="cursor-pointer py-2 font-bold">سجل إضافات النوّادل ({rows.length})</summary>{error && <p role="alert">{error}</p>}{rows.map(b => <article key={b.operationId} className="border-b py-3"><p className="font-semibold">{b.waiterName}</p><p className="text-sm">أُنشئت: {new Date(b.createdAt).toLocaleString("ar")} · اعتُمدت: {new Date(b.acceptedAt).toLocaleString("ar")}</p>{b.orderNote && <p className="whitespace-pre-wrap break-words rounded-lg bg-app-primary-soft p-2">ملاحظة للطلب: {b.orderNote}</p>}{b.items.map((i, n) => <p key={n}>{i.quantity} × {i.name}{i.notes && ` · ${i.notes}`}</p>)}</article>)}</details>; }
