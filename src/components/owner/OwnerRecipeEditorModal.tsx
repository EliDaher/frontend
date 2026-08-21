"use client";

import type { FormEvent } from "react";
import { AppButton, AppFieldShell, AppInput, AppSelect, PopupForm } from "@/components/shared";
import type { MenuItem } from "@/types/menu";
import type { InventoryItem, RecipeDraftLine } from "@/types/ops";
import { Warning } from "./OwnerDashboardParts";

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
            <div key={index} className="rounded-app-lg border border-app-border bg-app-surface-muted p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_110px_90px]">
                <AppFieldShell label="مادة المخزون">
                  <AppSelect value={line.inventoryItemId} onChange={(event) => onUpdateLine(index, { inventoryItemId: event.target.value })}>
                    {inventoryItems.map((inventoryItem) => (
                      <option key={inventoryItem.id} value={inventoryItem.id}>
                        {inventoryItem.name} ({inventoryItem.currentQuantity} {inventoryItem.unit})
                      </option>
                    ))}
                  </AppSelect>
                </AppFieldShell>
                <AppFieldShell label="الكمية">
                  <AppInput
                    type="number"
                    min="0"
                    value={Number.isFinite(line.quantity) ? line.quantity : 0}
                    onChange={(event) => onUpdateLine(index, { quantity: Number(event.target.value) })}
                  />
                </AppFieldShell>
                <AppFieldShell label="الوحدة">
                  <AppInput value={line.unit} onChange={(event) => onUpdateLine(index, { unit: event.target.value })} />
                </AppFieldShell>
              </div>
              <div className="mt-3 flex justify-end">
                <AppButton type="button" variant="ghost" size="sm" onClick={() => onRemoveLine(index)} className="text-app-danger hover:bg-app-danger-soft">
                  حذف المكون
                </AppButton>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <AppButton
            type="button"
            variant="secondary"
            disabled={!inventoryItems.length}
            onClick={onAddLine}
          >
            إضافة مكون
          </AppButton>
          <AppButton type="submit" disabled={busy || !inventoryItems.length} loading={busy}>حفظ المكونات</AppButton>
        </div>
      </form>
    </PopupForm>
  );
}
