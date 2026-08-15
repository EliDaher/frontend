import type { ReactNode } from "react";

export function SharedPanel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="font-black">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function SharedField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  min
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  min?: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-black">
      <span>{label}</span>
      <input
        value={value}
        type={type}
        min={min}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-md border border-slate-200 bg-white px-3 font-bold outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
      />
    </label>
  );
}

export function SharedSelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm font-black">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-md border border-slate-200 bg-white px-3 font-bold outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SharedTextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm font-black">
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-24 rounded-md border border-slate-200 bg-white p-3 font-bold outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100" />
    </label>
  );
}

export function SharedPrimaryButton({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  return (
    <button disabled={disabled} className="inline-flex h-11 items-center justify-center rounded-md bg-amber-500 px-4 text-sm font-black text-white disabled:bg-slate-300">
      {children}
    </button>
  );
}

export function SharedSecondaryButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-black text-slate-700">
      {children}
    </button>
  );
}

export function SharedMessage({ text, tone = "error" }: { text: string; tone?: "error" | "success" | "info" }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-slate-200 bg-slate-50 text-slate-700"
  };

  return <p className={`rounded-lg border p-3 text-sm font-black ${styles[tone]}`}>{text}</p>;
}

export function SharedEmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="font-black">{title}</p>
      <p className="mt-2 text-sm font-bold text-slate-500">{text}</p>
    </div>
  );
}

export function SharedListRow({ title, meta, children }: { title: string; meta: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="min-w-0">
        <p className="truncate font-black">{title}</p>
        <p className="text-xs font-bold text-slate-500">{meta}</p>
      </div>
      {children ? <div className="flex shrink-0 gap-2">{children}</div> : null}
    </div>
  );
}
