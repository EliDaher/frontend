"use client";

import { X } from "lucide-react";
import { useEffect, useId } from "react";
import type { ReactNode } from "react";

type PopupFormMaxWidth = "sm" | "md" | "lg" | "xl";

type PopupFormProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  maxWidth?: PopupFormMaxWidth;
  children: ReactNode;
};

const maxWidthClasses: Record<PopupFormMaxWidth, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl"
};

export function PopupForm({
  open,
  onClose,
  title,
  description,
  maxWidth = "lg",
  children
}: PopupFormProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={onClose}
    >
      <div
        className={`max-h-[calc(100vh-2rem)] w-full ${maxWidthClasses[maxWidth]} overflow-hidden rounded-lg bg-white shadow-2xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 id={titleId} className="font-black text-slate-950">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm font-bold leading-6 text-slate-500">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close popup"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-slate-950"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(100vh-7rem)] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
