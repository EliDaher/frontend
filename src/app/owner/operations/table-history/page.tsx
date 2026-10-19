import { Suspense } from "react";
import { TableHistoryOpsPage } from "@/components/owner/ops/TableHistoryOpsPage";
export default function Page() { return <Suspense fallback={<p>جارٍ تحميل سجل الطاولات…</p>}><TableHistoryOpsPage /></Suspense>; }
