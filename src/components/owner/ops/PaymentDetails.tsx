import type { NormalizedPaymentPart } from "@/lib/payments";
import { formatMoney } from "@/lib/format";
import { paymentMethodLabel } from "./OpsPageShared";
export function PaymentDetails({ payments }: { payments?: NormalizedPaymentPart[] }) {
  if (!payments?.length) return null;
  return <div className="grid gap-1 text-app-helper text-app-muted">{payments.map((payment, index) => <p key={index}>{paymentMethodLabel(payment.method)} · {formatMoney(payment.originalAmount, payment.currency)}{payment.currency === "USD" ? ` · سعر الصرف ${payment.exchangeRate} · ${formatMoney(payment.amount, "SYP")}` : ""}</p>)}</div>;
}
