import { Banknote, Wallet } from "lucide-react";
import { cashSections, formatCashMoney, type CashSummary } from "@/lib/cash-balances";
import { cn } from "@/components/shared";

type Props = {
  title: string;
  description?: string;
  summary: CashSummary;
  kind?: "balance" | "period" | "sales";
  accountingCurrency?: string;
  compact?: boolean;
};

export function CashBalanceBreakdown({ title, description, summary, kind = "balance", accountingCurrency = "SYP", compact = false }: Props) {
  const hasUnknown = summary.unclassifiedCount > 0 || summary.unclassifiedNet !== 0 || summary.reconciliation !== 0;
  return <section className="min-w-0 rounded-md border border-zinc-200 bg-white p-3 sm:p-4" aria-label={title}>
    <h2 className="text-app-section-title font-semibold text-app-ink">{title}</h2>
    {description && <p className="mt-1 text-app-helper text-app-muted">{description}</p>}
    <div className={cn("mt-4 grid min-w-0 gap-3", !compact && "lg:grid-cols-2")}>
      {([{ method: "CASH", label: "نقدي", Icon: Banknote }, { method: "SHAM_CASH", label: "شام كاش", Icon: Wallet }] as const).map(group => (
        <section key={group.method} aria-label={group.label} data-cash-method={group.method} className="min-w-0 overflow-hidden rounded-md border border-zinc-200 bg-white">
          <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2.5">
            <group.Icon className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
            <h3 className="text-sm font-bold text-zinc-900">{group.label}</h3>
          </div>
          <div className="grid min-w-0 grid-cols-2 divide-x divide-x-reverse divide-zinc-200">
            {cashSections.filter(section => section.method === group.method).map(section => {
              const totals = summary.sections[section.key];
              return <div key={section.key} aria-label={section.label} className="min-w-0 p-3" data-cash-section={section.key}>
                <h4 className="text-app-label font-semibold text-zinc-600">{section.currency === "USD" ? "الدولار الأمريكي" : "الليرة السورية"}</h4>
                {kind !== "balance" && <p className="mt-3 text-app-helper text-zinc-500">{kind === "sales" ? "صافي المقبوضات" : "صافي الفترة"}</p>}
                <p className={cn("mt-2 break-words text-xl font-bold tabular-nums sm:text-2xl", totals.net < 0 ? "text-red-700" : "text-zinc-950")}>{formatCashMoney(totals.net, section.currency)}</p>
                {kind !== "balance" && <dl className="mt-3 grid gap-1 border-t border-zinc-200 pt-2 text-app-helper text-zinc-600">
                  <div className="flex flex-wrap justify-between gap-x-2"><dt>{kind === "sales" ? "مقبوضات" : "داخل"}</dt><dd className="font-semibold text-zinc-800">{formatCashMoney(totals.incoming, section.currency)}</dd></div>
                  <div className="flex flex-wrap justify-between gap-x-2"><dt>{kind === "sales" ? "مرتجعات" : "خارج"}</dt><dd className="font-semibold text-zinc-800">{formatCashMoney(totals.outgoing, section.currency)}</dd></div>
                </dl>}
              </div>;
            })}
          </div>
        </section>
      ))}
    </div>
    <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md bg-zinc-900 px-4 py-3 text-white">
      <div className="min-w-0"><h3 className="text-app-label font-semibold">{kind === "balance" ? "المجموع العام" : kind === "sales" ? "صافي المبيعات بالقيمة المحاسبية" : "صافي الفترة بالقيمة المحاسبية"}{accountingCurrency === "SYP" ? " — ليرة سورية" : ""}</h3><p className="mt-1 text-xs text-zinc-300">وفق أسعار الصرف المحفوظة لكل عملية</p></div>
      <p className={cn("break-words text-xl font-bold tabular-nums sm:text-2xl", summary.accountingNet < 0 && "text-red-300")} data-accounting-total>{formatCashMoney(summary.accountingNet, accountingCurrency)}</p>
    </div>
    {hasUnknown && <div className="mt-3 rounded-md border border-zinc-300 bg-zinc-50 p-3 text-app-helper text-zinc-700" role="status">
      <p className="font-bold">{kind === "balance" ? "رصيد سابق غير مصنف" : "حركات غير مصنفة"}: {formatCashMoney(summary.unclassifiedNet, accountingCurrency)}</p>
      <p className="mt-1">مشمول في المجموع المحاسبي؛ بياناته لا تكفي لتوزيعه على الأقسام الأربعة.</p>
    </div>}
  </section>;
}
