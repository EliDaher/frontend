import { ImageIcon, LayoutDashboard, QrCode, Search, ShieldCheck } from "lucide-react";
import type { ComponentType } from "react";

type Icon = ComponentType<{ className?: string }>;

const previewItems = [
  { name: "برغر دجاج كرسبي", category: "الأكثر طلباً", price: "28,000 SYP", badge: "Popular" },
  { name: "لاتيه فانيلا", category: "مشروبات", price: "14,000 SYP", badge: "New" },
  { name: "بيتزا رانش", category: "عروض اليوم", price: "42,000 SYP", badge: "Pinza" }
];

export function ProductPreview() {
  return (
    <div className="grid gap-3 lg:grid-cols-[0.75fr_1fr]">
      <div className="rounded-lg border border-white/70 bg-white/80 p-3 shadow-[0_24px_70px_rgba(80,52,20,0.14)] backdrop-blur">
        <div className="rounded-md bg-slate-950 p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-amber-300">Owner Dashboard</p>
              <p className="mt-1 text-lg font-black">إدارة المنيو</p>
            </div>
            <LayoutDashboard className="h-6 w-6 text-amber-300" />
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

      <div className="rounded-lg border border-white/70 bg-white/85 p-3 shadow-[0_24px_70px_rgba(80,52,20,0.16)] backdrop-blur">
        <div className="overflow-hidden rounded-md border border-slate-200 bg-[#fffaf2]">
          <div className="bg-[linear-gradient(135deg,#14110f,#c87910)] p-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-amber-200">HONOR CAFE</p>
                <h3 className="mt-1 text-2xl font-black">قائمة اليوم</h3>
                <p className="mt-2 text-xs font-bold leading-5 text-white/80">بحث سريع، أقسام واضحة، وصور تجعل الطلب أسهل.</p>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-md bg-white text-slate-950">
                <QrCode className="h-6 w-6" />
              </div>
            </div>
          </div>
          <div className="border-b border-slate-200 bg-white p-3">
            <div className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-500">
              <Search className="h-4 w-4" />
              ابحث عن صنف أو مشروب...
            </div>
            <div className="mt-3 flex gap-2 overflow-hidden">
              {["الكل", "الأكثر طلباً", "مشروبات", "عروض"].map((category, index) => (
                <span key={category} className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${index === 1 ? "bg-slate-950 text-white" : "bg-amber-50 text-amber-800"}`}>
                  {category}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-2 p-3">
            {previewItems.map((item) => (
              <div key={item.name} className="grid grid-cols-[72px_1fr] gap-3 rounded-md border border-slate-200 bg-white p-2 shadow-sm">
                <div className="rounded bg-[linear-gradient(135deg,#fbbf24,#f97316)]" />
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-black text-slate-950">{item.name}</p>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">{item.badge}</span>
                  </div>
                  <p className="mt-1 text-xs font-bold text-slate-500">{item.category}</p>
                  <p className="mt-1 text-sm font-black text-amber-700">{item.price}</p>
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
    <label className={`space-y-1 text-sm font-black ${wide ? "sm:col-span-2" : ""}`}>
      <span>{label}</span>
      <div className={`flex overflow-hidden rounded-md border bg-white transition focus-within:ring-4 ${valid === false ? "border-red-300 focus-within:ring-red-100" : "border-slate-200 focus-within:border-amber-400 focus-within:ring-amber-100"}`}>
        {prefix ? <span className="grid h-12 place-items-center border-l border-slate-200 bg-slate-50 px-3 text-slate-500">{prefix}</span> : null}
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={type}
          required={required}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="h-12 min-w-0 flex-1 bg-transparent px-3 font-bold text-slate-950 outline-none placeholder:text-slate-400"
        />
      </div>
      {hint ? <p className={`text-xs font-bold ${valid === false ? "text-red-600" : valid ? "text-emerald-700" : "text-slate-500"}`}>{hint}</p> : null}
    </label>
  );
}

export function Proof({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-white/70 bg-white/70 p-4 shadow-sm backdrop-blur">
      <p className="text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-black text-slate-500">{label}</p>
    </div>
  );
}

export function FeatureCard({ icon: IconComponent, title, text }: { icon: Icon; title: string; text: string }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
      <div className="grid h-11 w-11 place-items-center rounded-md bg-amber-100 text-amber-800">
        <IconComponent className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-sm font-bold leading-7 text-slate-600">{text}</p>
    </article>
  );
}

function PreviewBar({ label, value, width }: { label: string; value: string; width: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs font-black">
        <span>{label}</span>
        <span className="text-zinc-300">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-amber-300" style={{ width }} />
      </div>
    </div>
  );
}

function MiniStat({ icon: IconComponent, label }: { icon: Icon; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-white/10 p-2 text-xs font-black">
      <IconComponent className="h-4 w-4 text-amber-300" />
      {label}
    </div>
  );
}
