"use client";

import type { FormEvent } from "react";
import { PopupForm } from "@/components/shared";
import type { MenuItem } from "@/types/menu";
import type { InventoryItem, RecipeDraftLine } from "@/types/ops";
import { Field, NumberField, PrimaryButton, SelectField, Warning } from "./OwnerDashboardParts";

export function OwnerRecipeEditorModal({
  item,
  inventoryItems,
  recipeDraft,
  busy,
  onClose,
  onSubmit,
  onUpdateLine,
  onRemoveLine,
  onAddLine
}: {
  item: MenuItem | null;
  inventoryItems: InventoryItem[];
  recipeDraft: RecipeDraftLine[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateLine: (index: number, patch: Partial<RecipeDraftLine>) => void;
  onRemoveLine: (index: number) => void;
  onAddLine: () => void;
}) {
  if (!item) return null;

  return (
    <PopupForm
      open={Boolean(item)}
      onClose={onClose}
      title={item.name}
      description="هذه الكميات تخصم من المخزون عند إتمام الطلب فقط."
      maxWidth="lg"
    >
      <form onSubmit={onSubmit}>
        {!inventoryItems.length ? (
          <Warning text="أضف مواد مخزون أولاً قبل ربطها بأصناف المنيو." />
        ) : null}

        <div className="grid gap-3">
          {recipeDraft.map((line, index) => (
            <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_110px_90px]">
                <SelectField
                  label="مادة المخزون"
                  value={line.inventoryItemId}
                  options={inventoryItems.map((inventoryItem) => ({ value: inventoryItem.id, label: `${inventoryItem.name} (${inventoryItem.currentQuantity} ${inventoryItem.unit})` }))}
                  onChange={(inventoryItemId) => onUpdateLine(index, { inventoryItemId })}
                />
                <NumberField label="الكمية" value={line.quantity} onChange={(quantity) => onUpdateLine(index, { quantity })} />
                <Field label="الوحدة" value={line.unit} onChange={(unit) => onUpdateLine(index, { unit })} />
              </div>
              <div className="mt-3 flex justify-end">
                <button type="button" onClick={() => onRemoveLine(index)} className="h-9 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-black text-red-700">
                  حذف المكون
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!inventoryItems.length}
            onClick={onAddLine}
            className="h-11 rounded-md border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-50"
          >
            إضافة مكون
          </button>
          <PrimaryButton disabled={busy || !inventoryItems.length}>حفظ المكونات</PrimaryButton>
        </div>
      </form>
    </PopupForm>
  );
}
