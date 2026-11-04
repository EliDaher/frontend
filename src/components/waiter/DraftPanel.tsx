"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, CopyPlus, Minus, Plus, Trash2, MessageSquare } from "lucide-react";
import { normalizeQuantity, parseQuantity, type DraftLine } from "./draft";

export type DraftReveal = { localId: string; focusNote: boolean; sequence: number };
type Props = {
  orderNote: string; onOrderNoteChange: (note: string) => void;
  tableName: string; lines: DraftLine[]; expanded: boolean; reveal: DraftReveal | null;
  onToggle: () => void; onChange: (localId: string, patch: Partial<Pick<DraftLine, "quantity" | "notes">>) => void;
  onRemove: (localId: string) => void; onDuplicate: (localId: string) => void; onSend: () => void;
  onHeight: (height: number) => void;
};
const control = "grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-app-border bg-app-surface text-app-ink disabled:opacity-40";

export function DraftPanel({ orderNote, onOrderNoteChange, tableName, lines, expanded, reveal, onToggle, onChange, onRemove, onDuplicate, onSend, onHeight }: Props) {
  const panel = useRef<HTMLElement>(null), body = useRef<HTMLDivElement>(null);
  const orderNoteInput = useRef<HTMLTextAreaElement>(null);
  const rows = useRef(new Map<string, HTMLElement>()), notes = useRef(new Map<string, HTMLInputElement>());
  const [expandedLine, setExpandedLine] = useState<string | null>(null);
  const focusedReveal = useRef<number | null>(null);
  const [viewport, setViewport] = useState({ height: 0, bottom: 0 });
  const invalid = orderNote.length > 1000 || lines.some(line => parseQuantity(line.quantity) === null);
  const total = lines.reduce((sum, line) => sum + (parseQuantity(line.quantity) ?? 0), 0);
  function keepVisible(element: HTMLElement | null) {
    const container = body.current;
    if (!container || !element || !container.contains(element)) return;
    const target = element.getBoundingClientRect(), bounds = container.getBoundingClientRect();
    if (target.bottom > bounds.bottom - 8) container.scrollTop += target.bottom - bounds.bottom + 8;
    else if (target.top < bounds.top + 8) container.scrollTop -= bounds.top - target.top + 8;
  }
  useEffect(() => {
    const update = () => {
      const visual = window.visualViewport;
      setViewport({ height: visual?.height ?? window.innerHeight, bottom: Math.max(0, window.innerHeight - (visual ? visual.height + visual.offsetTop : window.innerHeight)) });
      requestAnimationFrame(() => keepVisible(document.activeElement as HTMLElement));
    };
    update(); window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update); window.visualViewport?.addEventListener("scroll", update);
    return () => { window.removeEventListener("resize", update); window.visualViewport?.removeEventListener("resize", update); window.visualViewport?.removeEventListener("scroll", update); };
  }, []);
  useEffect(() => {
    const observer = new ResizeObserver(() => { if (panel.current) onHeight(panel.current.getBoundingClientRect().height); });
    if (panel.current) observer.observe(panel.current);
    return () => { observer.disconnect(); onHeight(0); };
  }, [onHeight]);
  useLayoutEffect(() => {
    setExpandedLine(reveal?.focusNote ? reveal.localId : null);
  }, [reveal]);
  useLayoutEffect(() => {
    if (!expanded) return;
    const targetId = expandedLine || reveal?.localId;
    const row = targetId ? rows.current.get(targetId) : null;
    if (row && body.current) body.current.scrollTop += row.getBoundingClientRect().top - body.current.getBoundingClientRect().top;
    // Expand before focusing so note entry still belongs to the user's click on mobile.
    if (reveal?.focusNote && expandedLine === reveal.localId && focusedReveal.current !== reveal.sequence) {
      const input = notes.current.get(reveal.localId);
      if (input) {
        input.focus({ preventScroll: true });
        focusedReveal.current = reveal.sequence;
        keepVisible(input);
      }
    }
  }, [expanded, reveal, expandedLine]);

  return <aside ref={panel} aria-label="مسودة الطلب" className="fixed inset-x-0 bottom-0 z-30 flex flex-col border-t border-app-border bg-app-surface shadow-[0_-6px_24px_rgba(0,0,0,0.08)]" style={{ bottom: viewport.bottom, maxHeight: viewport.height ? viewport.height / 2 : "50dvh", paddingBottom: "env(safe-area-inset-bottom)" }}>
    <div className="mx-auto flex min-h-20 w-full max-w-2xl shrink-0 items-center justify-between gap-2 px-3 py-2">
      <button type="button" aria-expanded={expanded} aria-controls="waiter-draft-lines" onClick={onToggle} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-primary">
        {expanded ? <ChevronDown className="h-5 w-5 shrink-0" /> : <ChevronUp className="h-5 w-5 shrink-0" />}
        <span className="min-w-0"><strong className="block truncate text-sm">مسودة · طاولة {tableName}</strong><span className="text-xs text-app-muted">{total} وحدة{!expanded && " · عرض المسودة"}</span></span>
      </button>
      <button type="button" disabled={invalid} onClick={onSend} className="min-h-12 shrink-0 rounded-xl bg-app-primary px-4 text-sm font-bold text-app-primary-foreground disabled:opacity-40">إرسال الطلب</button>
    </div>
    {invalid && <p role="alert" className="mx-auto w-full max-w-2xl shrink-0 px-3 pb-2 text-xs text-app-danger">أدخل كمية صحيحة من 1 إلى 999 لكل صنف.</p>}
    {expanded && <div id="waiter-draft-lines" ref={body} className="min-h-0 overflow-y-auto overscroll-contain border-t border-app-border" onFocusCapture={event => requestAnimationFrame(() => keepVisible(event.target as HTMLElement))}>
      <div className="mx-auto grid max-w-2xl gap-3 p-3">
        <div className="rounded-xl border border-app-border bg-app-bg p-3">
          <label htmlFor="waiter-order-note" className="text-sm font-semibold">ملاحظة للطلب كامل</label>
          <div className="mt-2 flex items-end gap-2"><textarea ref={orderNoteInput} id="waiter-order-note" rows={2} maxLength={1000} value={orderNote} onChange={event => onOrderNoteChange(event.target.value)} placeholder="مثلاً: قدّم المشروبات أولاً" className="min-h-11 min-w-0 flex-1 resize-none rounded-lg border border-app-border bg-app-surface p-2 text-base" /><button type="button" aria-label="إنهاء ملاحظة الطلب" onPointerDown={event => event.preventDefault()} onClick={event => { orderNoteInput.current?.blur(); event.currentTarget.blur(); }} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-app-primary">تم</button></div>
        </div>
        {lines.map((line, index) => {
          const quantity = parseQuantity(line.quantity), label = `${line.name}، سطر ${index + 1}`, errorId = `quantity-error-${line.localId}`, isOpen = expandedLine === line.localId, detailsId = `draft-line-${line.localId}`;
          return <article key={line.localId} ref={node => { if (node) rows.current.set(line.localId, node); else rows.current.delete(line.localId); }} className="min-w-0 rounded-xl border border-app-border bg-app-bg">
            <button type="button" aria-label={`تفاصيل ${label}`} aria-expanded={isOpen} aria-controls={detailsId} onClick={() => setExpandedLine(current => current === line.localId ? null : line.localId)} className="flex min-h-12 w-full items-center gap-2 rounded-xl px-3 py-2 text-start">
              <strong className="min-w-0 flex-1 break-words text-sm">{line.name}</strong>
              {line.notes.trim() && <MessageSquare aria-label="توجد ملاحظة للصنف" className="h-4 w-4 shrink-0 text-app-primary" />}
              <span className={`shrink-0 rounded-md px-2 py-1 text-sm font-bold ${quantity === null ? "bg-app-danger-soft text-app-danger" : "bg-app-primary-soft text-app-primary"}`}>{quantity === null ? "كمية غير صالحة" : `× ${quantity}`}</span>
              {isOpen ? <ChevronUp aria-hidden="true" className="h-4 w-4 shrink-0" /> : <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0" />}
            </button>
            {isOpen && <div id={detailsId} className="border-t border-app-border px-3 pb-3">
            <div className="flex items-center justify-end gap-2"><button type="button" aria-label={`حذف ${label}`} onClick={() => onRemove(line.localId)} className={`${control} border-transparent text-app-danger`}><Trash2 className="h-4 w-4" /></button></div>
            <div className="mt-1 flex items-center justify-between gap-2"><span className="text-xs text-app-muted">الكمية</span><div className="flex items-center gap-1" dir="ltr">
              <button type="button" aria-label={`تقليل ${label}`} disabled={quantity === 1} onClick={() => onChange(line.localId, { quantity: String(quantity === null ? 1 : Math.max(1, quantity - 1)) })} className={control}><Minus className="h-4 w-4" /></button>
              <input aria-label={`كمية ${label}`} aria-invalid={quantity === null} aria-describedby={quantity === null ? errorId : undefined} type="text" inputMode="numeric" autoComplete="off" value={line.quantity} onChange={event => onChange(line.localId, { quantity: normalizeQuantity(event.target.value) })} onFocus={event => event.target.select()} className={`h-11 w-16 rounded-lg border bg-app-surface text-center text-base font-bold ${quantity === null ? "border-app-danger" : "border-app-border"}`} />
              <button type="button" aria-label={`زيادة ${label}`} disabled={quantity === 999} onClick={() => onChange(line.localId, { quantity: String(quantity === null ? 1 : Math.min(999, quantity + 1)) })} className={control}><Plus className="h-4 w-4" /></button>
            </div></div>
            {quantity === null && <p id={errorId} className="mt-1 text-xs text-app-danger">الكمية من 1 إلى 999، دون كسور.</p>}
            <div className="mt-2 flex items-center gap-2" role="group" aria-label={`اختصارات كمية ${label}`}>
              <span className="shrink-0 text-xs text-app-muted">اختيار سريع</span>
              <div className="grid min-w-0 flex-1 grid-cols-4 gap-1">{[1, 2, 4, 10].map(preset => <button key={preset} type="button" aria-label={`كمية ${preset} لـ${label}`} aria-pressed={quantity === preset} onClick={() => onChange(line.localId, { quantity: String(preset) })} className={`min-h-11 rounded-lg border text-sm font-semibold ${quantity === preset ? "border-app-primary bg-app-primary-soft text-app-primary" : "border-app-border bg-app-surface"}`}>{preset}</button>)}</div>
            </div>
            <div className="mt-2 flex items-center gap-1"><input ref={node => { if (node) notes.current.set(line.localId, node); else notes.current.delete(line.localId); }} aria-label={`ملاحظة ${label}`} placeholder="ملاحظة، مثلاً: بدون بندورة" maxLength={500} value={line.notes} onChange={event => onChange(line.localId, { notes: event.target.value })} className="min-h-11 min-w-0 flex-1 rounded-lg border border-app-border bg-app-surface px-3 py-2 text-base" /><button type="button" aria-label={`إنهاء ملاحظة ${label}`} onPointerDown={event => event.preventDefault()} onClick={event => { notes.current.get(line.localId)?.blur(); event.currentTarget.blur(); setExpandedLine(null); }} className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-app-primary">تم</button></div>
            <button type="button" onClick={() => onDuplicate(line.localId)} className="mt-1 flex min-h-11 items-center gap-2 text-xs font-semibold text-app-primary"><CopyPlus className="h-4 w-4" />نسخة بملاحظة مختلفة</button>
            </div>}
          </article>;
        })}
      </div>
    </div>}
  </aside>;
}
