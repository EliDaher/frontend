"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "./OperationalPrimitives";

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
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedElement.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const animationFrame = window.requestAnimationFrame(() => {
      firstFocusableElement(panel)?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "Tab") {
        keepFocusInside(event, panelRef.current);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedElement.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-app-backdrop p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={cn(
          "max-h-[calc(100dvh-1.5rem)] w-full overflow-hidden rounded-app-xl border border-app-border bg-app-surface text-app-ink shadow-app-dialog sm:max-h-[calc(100dvh-2rem)]",
          maxWidthClasses[maxWidth]
        )}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-app-border px-4 py-3">
          <div>
            <h2 id={titleId} className="text-app-panel-title font-semibold text-app-ink">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-app-helper font-medium text-app-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق النافذة"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-app-md border border-app-border bg-app-surface text-app-muted transition-colors hover:border-app-border-strong hover:bg-app-surface-muted hover:text-app-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft sm:h-9 sm:w-9"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(100dvh-6.5rem)] overflow-y-auto p-4 sm:max-h-[calc(100dvh-7rem)]">{children}</div>
      </div>
    </div>
  );
}

function focusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
}

function firstFocusableElement(container: HTMLElement | null) {
  return container?.querySelector<HTMLElement>("[data-autofocus]") ?? focusableElements(container)[0] ?? container;
}

function keepFocusInside(event: KeyboardEvent, container: HTMLElement | null) {
  const focusable = focusableElements(container);
  if (!focusable.length) {
    event.preventDefault();
    container?.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
