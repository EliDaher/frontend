"use client";

import { useId, useState } from "react";
import { ChevronDown, StickyNote } from "lucide-react";
import { AppButton, AppFieldShell, AppInput, PopupForm } from "@/components/shared";
import { PaymentEditor, type PaymentDraft } from "./PaymentEditor";

type CheckoutDialogProps = {
  description: string;
  total: number;
  value: PaymentDraft;
  onChange: (value: PaymentDraft) => void;
  customerName: string;
  onCustomerNameChange: (customerName: string) => void;
  note: string;
  onNoteChange: (note: string) => void;
  exchangeRate?: number;
  baseCurrency?: string;
  registers: Array<{ id: string; name: string }>;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function CheckoutDialog({ description, total, value, onChange, customerName, onCustomerNameChange, note, onNoteChange, exchangeRate, baseCurrency, registers, busy, onClose, onConfirm }: CheckoutDialogProps) {
  const noteId = useId();
  const [noteOpen, setNoteOpen] = useState(Boolean(note));
  return (
    <PopupForm
      open
      title="إنهاء الطلب"
      description={description}
      maxWidth="checkout"
      onClose={() => { if (!busy) onClose(); }}
      footer={(
        <div className="flex items-center justify-end gap-2">
          <AppButton type="button" variant="secondary" onClick={onClose} disabled={busy}>إلغاء</AppButton>
          <AppButton type="button" onClick={onConfirm} loading={busy} disabled={busy}>إنهاء الطلب</AppButton>
        </div>
      )}
    >
      <div className="grid min-w-0 gap-3">
        <PaymentEditor layout="rows" total={total} value={value} onChange={onChange} exchangeRate={exchangeRate} baseCurrency={baseCurrency} registers={registers} afterSummary={(
          <AppFieldShell className="min-w-0 md:max-w-md" label="اسم الزبون (اختياري)">
            <AppInput value={customerName} onChange={event => onCustomerNameChange(event.target.value)} placeholder="اكتب اسم الزبون" autoComplete="off" disabled={busy} />
          </AppFieldShell>
        )} />
        <div className="min-w-0">
          <button type="button" aria-expanded={noteOpen} aria-controls={noteId} onClick={() => setNoteOpen(!noteOpen)} className="inline-flex min-h-9 items-center gap-2 rounded-app-md px-1 text-app-label font-medium text-app-muted hover:text-app-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-primary-soft">
            <StickyNote className="h-4 w-4" aria-hidden="true" />
            {noteOpen ? "ملاحظة الدفع" : note ? "عرض الملاحظة" : "إضافة ملاحظة"}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${noteOpen ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          <div id={noteId} hidden={!noteOpen}>
            <AppFieldShell className="mt-1" label="ملاحظة الدفع (اختياري)">
              <AppInput value={note} onChange={event => onNoteChange(event.target.value)} placeholder="أضف تفاصيل عن الدفعة…" disabled={busy} />
            </AppFieldShell>
          </div>
        </div>
      </div>
    </PopupForm>
  );
}
