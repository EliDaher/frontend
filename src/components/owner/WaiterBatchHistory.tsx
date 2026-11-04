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
}) { const [rows, setRows] = useState<Batch[]>([]), [error, setError] = useState(""); useEffect(() => { setRows([]); if (!token || !orderId)
    return; let active = true; const load = () => adminRequest<Batch[]>(`/api/owner/waiters/orders/${orderId}/batches`, token).then(data => { if (active) {
    setRows(data);
    setError("");
} }).catch(() => { if (active)
    setError("تعذر تحميل سجل إضافات النوّادل"); }); void load(); const timer = setInterval(() => void load(), 15000); return () => { active = false; clearInterval(timer); }; }, [token, orderId]); if (!orderId || (!rows.length && !error))
    return null; return <details className="my-3 rounded-xl border bg-app-surface p-3"><summary className="cursor-pointer py-2 font-bold">سجل إضافات النوّادل ({rows.length})</summary>{error && <p role="alert">{error}</p>}{rows.map(b => <article key={b.operationId} className="border-b py-3"><p className="font-semibold">{b.waiterName}</p><p className="text-sm">أُنشئت: {new Date(b.createdAt).toLocaleString("ar")} · اعتُمدت: {new Date(b.acceptedAt).toLocaleString("ar")}</p>{b.orderNote && <p className="whitespace-pre-wrap break-words rounded-lg bg-app-primary-soft p-2">ملاحظة للطلب: {b.orderNote}</p>}{b.items.map((i, n) => <p key={n}>{i.quantity} × {i.name}{i.notes && ` · ${i.notes}`}</p>)}</article>)}</details>; }
