import type { ReactNode } from "react";

export function Field({ label, value, onChange, type = "text", dark = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; dark?: boolean }) {
  return (
    <label className="mt-3 block space-y-1 text-sm font-black">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        className={`h-11 w-full rounded-md border px-3 font-bold outline-none transition focus:ring-4 ${
          dark
            ? "border-white/10 bg-white/10 text-white focus:border-amber-300 focus:ring-amber-300/15"
            : "border-slate-200 bg-white text-slate-950 focus:border-amber-400 focus:ring-amber-100"
        }`}
      />
    </label>
  );
}

export function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 text-sm font-black">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 font-bold outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="space-y-1 text-sm font-black">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(Number(event.target.value))} type="number" min="0" className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 font-bold outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100" />
    </label>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 text-sm font-black">
      <span>{label}</span>
      <div className="flex gap-2">
        <input value={value} onChange={(event) => onChange(event.target.value)} className="h-11 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 font-bold outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100" />
        <input value={value} onChange={(event) => onChange(event.target.value)} type="color" className="h-11 w-14 rounded-md border border-slate-200 bg-white" />
      </div>
    </label>
  );
}

export function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-black">{title}</h2>
        <p className="mt-1 text-sm font-bold leading-6 text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function PrimaryButton({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  return (
    <button disabled={disabled} className="inline-flex h-11 items-center gap-2 rounded-md bg-amber-500 px-4 font-black text-white shadow-[0_12px_24px_rgba(245,158,11,0.22)] transition hover:-translate-y-0.5 disabled:opacity-60">
      {children}
    </button>
  );
}

export function IconButton({ label, children, onClick }: { label: string; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50">
      {children}
    </button>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">{children}</div>;
}

export function ListRow({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <p className="truncate font-black">{title}</p>
        <p className="text-xs font-bold text-slate-500">{meta}</p>
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </div>
  );
}

export function badgeLabel(badge: "popular" | "new" | "spicy") {
  return {
    popular: "الأكثر طلباً",
    new: "جديد",
    spicy: "حار"
  }[badge];
}
