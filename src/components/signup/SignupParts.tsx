import { ImageIcon, LayoutDashboard, QrCode, Search, ShieldCheck } from "lucide-react";
import type { ComponentType } from "react";
import {
  AppFieldShell,
  cn
} from "@/components/shared";

type Icon = ComponentType<{ className?: string }>;

const previewItems = [
  { name: "برغر دجاج كرسبي", category: "الأكثر طلباً", price: "28,000 SYP", badge: "Popular" },
  { name: "لاتيه فانيلا", category: "مشروبات", price: "14,000 SYP", badge: "New" },
  { name: "بيتزا رانش", category: "عروض اليوم", price: "42,000 SYP", badge: "Pinza" }
];

export function ProductPreview() {
  return (
    <div className="grid gap-3">
      <div className="rounded-app-lg border border-app-border bg-app-surface p-3">
        <div className="rounded-app-md border border-app-border bg-app-ink p-4 text-white">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-white/55">Owner Dashboard</p>
              <p className="mt-1 text-lg font-semibold">إدارة المنيو</p>
            </div>
            <LayoutDashboard className="h-5 w-5 text-white/75" />
          </div>
          <div className="mt-4 grid gap-2">
            <PreviewBar label="الأصناف" value="128 / 500" width="70%" />
            <PreviewBar label="الأقسام" value="12 / 50" width="42%" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MiniStat icon={ImageIcon} label="رفع صور" />
            <MiniStat icon={ShieldCheck} label="موافقة يدوية" />
          </div>
        </div>
      </div>

      <div className="rounded-app-lg border border-app-border bg-app-surface p-3">
        <div className="overflow-hidden rounded-app-md border border-app-border bg-app-bg">
          <div className="bg-app-ink p-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-white/55">HONOR CAFE</p>
                <h3 className="mt-1 text-2xl font-semibold">قائمة اليوم</h3>
                <p className="mt-2 text-xs leading-5 text-white/70">بحث سريع، أقسام واضحة، وصور تجعل الطلب أسهل.</p>
              </div>
              <div className="grid h-11 w-11 place-items-center rounded-app-md bg-white text-app-ink">
                <QrCode className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="border-b border-app-border bg-app-surface p-3">
            <div className="flex h-10 items-center gap-2 rounded-app-md border border-app-border bg-app-surface-muted px-3 text-sm font-medium text-app-muted">
              <Search className="h-4 w-4" />
              ابحث عن صنف أو مشروب...
            </div>
            <div className="mt-3 flex gap-2 overflow-hidden">
              {["الكل", "الأكثر طلباً", "مشروبات", "عروض"].map((category, index) => (
                <span key={category} className={cn("shrink-0 rounded-app-sm px-3 py-1 text-xs font-semibold", index === 1 ? "bg-app-primary text-app-primary-foreground" : "bg-app-surface-muted text-app-muted")}>
                  {category}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-2 p-3">
            {previewItems.map((item) => (
              <div key={item.name} className="grid grid-cols-[64px_1fr] gap-3 rounded-app-md border border-app-border bg-app-surface p-2">
                <div className="rounded-app-sm bg-app-primary-soft" />
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-semibold text-app-ink">{item.name}</p>
                    <span className="rounded-app-sm bg-app-primary-soft px-2 py-0.5 text-[10px] font-semibold text-app-primary">{item.badge}</span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-app-muted">{item.category}</p>
                  <p className="mt-1 text-sm font-semibold text-app-ink">{item.price}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
  prefix,
  placeholder,
  hint,
  valid,
  autoComplete,
  wide = false,
  required = true
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  prefix?: string;
  placeholder?: string;
  hint?: string;
  valid?: boolean;
  autoComplete?: string;
  wide?: boolean;
  required?: boolean;
}) {
  return (
    <AppFieldShell
      label={label}
      helperText={hint}
      errorText={valid === false ? hint : undefined}
      className={wide ? "sm:col-span-2" : undefined}
    >
      <div className={cn("flex overflow-hidden rounded-app-md border bg-app-surface transition focus-within:ring-4", valid === false ? "border-app-danger focus-within:border-app-danger focus-within:ring-app-danger-soft" : "border-app-border focus-within:border-app-primary focus-within:ring-app-primary-soft")}>
        {prefix ? <span className="grid h-10 place-items-center border-e border-app-border bg-app-surface-muted px-3 text-app-muted">{prefix}</span> : null}
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={type}
          required={required}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="h-10 min-w-0 flex-1 bg-transparent px-3 text-app-body font-medium text-app-ink outline-none placeholder:text-app-muted"
        />
      </div>
    </AppFieldShell>
  );
}

export function Proof({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-app-md border border-app-border bg-app-surface p-4">
      <p className="text-xl font-semibold text-app-ink">{value}</p>
      <p className="mt-1 text-app-helper font-medium text-app-muted">{label}</p>
    </div>
  );
}

export function FeatureCard({ icon: IconComponent, title, text }: { icon: Icon; title: string; text: string }) {
  return (
    <article className="rounded-app-md border border-app-border bg-app-surface p-5">
      <div className="grid h-10 w-10 place-items-center rounded-app-md bg-app-primary-soft text-app-primary">
        <IconComponent className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-app-panel-title font-semibold text-app-ink">{title}</h3>
      <p className="mt-2 text-app-body leading-7 text-app-muted">{text}</p>
    </article>
  );
}

function PreviewBar({ label, value, width }: { label: string; value: string; width: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold">
        <span>{label}</span>
        <span className="text-white/55">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-app-sm bg-white/10">
        <div className="h-full rounded-app-sm bg-white" style={{ width }} />
      </div>
    </div>
  );
}

function MiniStat({ icon: IconComponent, label }: { icon: Icon; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-app-md bg-white/10 p-2 text-xs font-semibold">
      <IconComponent className="h-4 w-4 text-white/70" />
      {label}
    </div>
  );
}
