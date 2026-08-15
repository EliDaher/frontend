import { AlertCircle, Boxes, CheckCircle2, Save, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { formatInteger, formatMoney } from "@/lib/format";
import type { MenuItem } from "@/types/menu";

export function Panel({
  title,
  description,
  action,
  children
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">{title}</h2>
          <p className="mt-1 text-sm font-bold leading-6 text-slate-500">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder = ""
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1 text-sm font-black">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-md border border-slate-200 bg-white px-3 font-bold outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
      />
    </label>
  );
}

export function ImageUpload({ label, onUpload }: { label: string; onUpload: (file: File) => void }) {
  return (
    <label className="block rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-sm font-black text-slate-700 transition hover:border-amber-300 hover:bg-amber-50">
      <span>{label}</span>
      <input
        type="file"
        accept="image/*"
        className="mt-2 block w-full text-xs font-bold text-slate-500 file:me-3 file:rounded-md file:border-0 file:bg-slate-950 file:px-3 file:py-2 file:text-xs file:font-black file:text-white"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );
}

export function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 text-sm font-black">
      <span>{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-24 w-full rounded-md border border-slate-200 bg-white p-3 font-bold outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
      />
    </label>
  );
}

export function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="space-y-1 text-sm font-black">
      <span>{label}</span>
      <input
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        min="0"
        className="h-12 w-full rounded-md border border-slate-200 bg-white px-3 font-bold outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
      />
    </label>
  );
}

export function SelectField({
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
    <label className="space-y-1 text-sm font-black">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-md border border-slate-200 bg-white px-3 font-bold outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="space-y-1 text-sm font-black">
      <span>{label}</span>
      <input value={value} readOnly className="h-12 w-full rounded-md border border-slate-200 bg-slate-50 px-3 font-bold text-slate-500" />
    </label>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 text-sm font-black">
      <span>{label}</span>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-12 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 font-bold outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
        />
        <input value={value} onChange={(event) => onChange(event.target.value)} type="color" className="h-12 w-14 rounded-md border border-slate-200 bg-white" />
      </div>
    </label>
  );
}

export function Toggle({
  checked,
  label,
  disabled = false,
  onChange
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`inline-flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-black transition ${
        checked ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600"
      } ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:border-amber-300"}`}
    >
      <input type="checkbox" className="h-4 w-4" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

export function PrimaryButton({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-4 font-black text-white shadow-[0_12px_24px_rgba(245,158,11,0.22)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none sm:w-auto"
    >
      {children}
    </button>
  );
}

export function MessageBox({ message }: { message: { type: "success" | "error"; text: string } }) {
  const success = message.type === "success";
  return (
    <div className={`mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm font-black ${success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
      {success ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      {message.text}
    </div>
  );
}

export function Warning({ text }: { text: string }) {
  return (
    <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-900">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      {text}
    </div>
  );
}

export function FormErrors({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-bold leading-6 text-red-800">
      {errors.map((error) => (
        <p key={error}>{error}</p>
      ))}
    </div>
  );
}

export function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
      {active ? "المنيو فعال" : "المنيو متوقف"}
    </span>
  );
}

export function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 shrink-0 rounded-full border px-3 text-sm font-black transition ${
        active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-amber-300"
      }`}
    >
      {label}
    </button>
  );
}

export function ItemRow({
  item,
  currency,
  categoryName,
  recipeCount,
  canEditRecipe,
  onRecipe,
  onEdit,
  onDelete
}: {
  item: MenuItem;
  currency: string;
  categoryName: string;
  recipeCount: number;
  canEditRecipe: boolean;
  onRecipe: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className={`rounded-lg border bg-white p-3 shadow-sm ${item.isAvailable ? "border-slate-200" : "border-slate-200 opacity-65"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-black">{item.name}</h3>
            {item.isFeatured ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-black text-amber-700">مميز</span> : null}
            {!item.isAvailable ? <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-500">مخفي</span> : null}
          </div>
          <p className="mt-1 text-xs font-bold text-slate-500">{categoryName}</p>
          {item.description ? <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">{item.description}</p> : null}
          <p className="mt-2 font-black text-amber-700">
            {formatMoney(item.price, currency)}
          </p>
          <p className={`mt-2 text-xs font-black ${recipeCount ? "text-emerald-700" : "text-slate-400"}`}>
            {recipeCount ? `${formatInteger(recipeCount)} مكونات مرتبطة` : "لا توجد مكونات مخزون"}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {canEditRecipe ? (
            <IconButton label="المكونات" onClick={onRecipe}>
              <Boxes className="h-4 w-4" />
            </IconButton>
          ) : null}
          <IconButton label="تعديل" onClick={onEdit}>
            <Save className="h-4 w-4" />
          </IconButton>
          <IconButton label="حذف" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
    </article>
  );
}

export function ListRow({
  title,
  meta,
  muted = false,
  children
}: {
  title: string;
  meta: string;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm ${muted ? "opacity-65" : ""}`}>
      <div className="min-w-0">
        <p className="truncate font-black">{title}</p>
        <p className="text-xs font-bold text-slate-500">{meta}</p>
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </div>
  );
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <p className="font-black text-slate-800">{title}</p>
      <p className="mt-2 text-sm font-semibold text-slate-500">{text}</p>
    </div>
  );
}

export function IconButton({ label, children, onClick }: { label: string; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
    >
      {children}
    </button>
  );
}
