const englishNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2
});

const englishIntegerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
});

export function formatNumber(value: number | string | undefined | null, maximumFractionDigits = 2) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0";

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits
  }).format(amount);
}

export function formatInteger(value: number | string | undefined | null) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0";

  return englishIntegerFormatter.format(amount);
}

export function formatMoney(value: number | string | undefined | null, currency = "") {
  const amount = Number(value || 0);
  const formatted = Number.isFinite(amount) ? englishNumberFormatter.format(amount) : "0";

  return `${formatted} ${currency}`.trim();
}

export function formatDate(value: string | number | Date | undefined | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toLocaleDateString("ar-SY-u-nu-latn");
}
