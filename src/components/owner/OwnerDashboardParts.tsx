import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/components/shared";

export function MessageBox({ message }: { message: { type: "success" | "error"; text: string } }) {
  const success = message.type === "success";
  return (
    <div
      className={cn(
        "mb-4 flex items-start gap-2 rounded-app-md border p-3 text-app-body font-semibold",
        success ? "border-app-success-soft bg-app-success-soft text-app-success" : "border-app-danger-soft bg-app-danger-soft text-app-danger"
      )}
    >
      {success ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      {message.text}
    </div>
  );
}

export function Warning({ text }: { text: string }) {
  return (
    <div className="mb-3 flex items-start gap-2 rounded-app-md border border-app-warning-soft bg-app-warning-soft p-3 text-app-body font-semibold text-app-warning">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      {text}
    </div>
  );
}

export function FormErrors({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <div className="rounded-app-md border border-app-danger-soft bg-app-danger-soft p-3 text-app-body font-semibold text-app-danger">
      {errors.map((error) => (
        <p key={error}>{error}</p>
      ))}
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
      className="grid h-10 w-10 place-items-center rounded-app-md border border-app-border bg-app-surface text-app-muted transition-colors hover:border-app-border-strong hover:bg-app-surface-muted hover:text-app-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft"
    >
      {children}
    </button>
  );
}
