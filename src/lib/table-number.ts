export const duplicateTableNameMessage = "رقم الطاولة مستخدم بالفعل، اختر رقمًا آخر";

// Keep named-table semantics: do not fold case, punctuation or internal spaces.
export function normalizeTableName(name: string) {
  const value = name.trim();
  if (!/^[0-9٠-٩۰-۹]+$/.test(value)) return value;
  const digits = value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
  return digits.replace(/^0+(?=[0-9])/, "");
}

const tableSortCollator = new Intl.Collator("ar", { numeric: true, sensitivity: "variant" });

// Sort keys never replace display names or uniqueness identities.
export function sortTablesByNumber<T extends { name: string }>(tables: readonly T[]): T[] {
  const entries = tables.map((table, index) => {
    const normalized = normalizeTableName(table.name);
    return { table, index, normalized, numeric: /^[0-9]+$/.test(normalized) };
  });
  entries.sort((first, second) => {
    let comparison: number;
    if (first.numeric && second.numeric) {
      // Compare exact integers without Number precision loss.
      comparison = first.normalized.length - second.normalized.length ||
        (first.normalized < second.normalized ? -1 : first.normalized > second.normalized ? 1 : 0);
    } else if (first.numeric !== second.numeric) {
      comparison = first.numeric ? -1 : 1;
    } else {
      comparison = tableSortCollator.compare(first.normalized, second.normalized);
    }
    // Equivalent numbers retain their input order, including on cache refresh.
    return comparison || first.index - second.index;
  });
  return entries.map((entry) => entry.table);
}

type CachedTableIdentity = { id: string; name: string; restaurantId?: string; deletedAt?: unknown };

export function validateTableForm(
  form: { name: string; capacity: number }, tables: CachedTableIdentity[], restaurantId: string, editingId = ""
) {
  const errors: { name?: string; capacity?: string } = {};
  const normalized = normalizeTableName(form.name);
  if (!normalized) errors.name = "اسم/رقم الطاولة مطلوب";
  else if (tables.some((table) => table.id !== editingId && !table.deletedAt &&
    (!table.restaurantId || table.restaurantId === restaurantId) && normalizeTableName(table.name) === normalized)) {
    errors.name = duplicateTableNameMessage;
  }
  if (!Number.isInteger(form.capacity) || form.capacity < 1) errors.capacity = "السعة يجب أن تكون عدداً صحيحاً أكبر من صفر";
  return errors;
}

export function isDuplicateTableNumberError(error: unknown) {
  const candidate = error as { status?: number; code?: string; message?: string } | null;
  return candidate?.status === 409 && (candidate.code === "duplicate_table_number" || candidate.message === duplicateTableNameMessage);
}

export function confirmedTableId(result: { id?: string; ok?: boolean } | null | undefined, editingId?: string) {
  if (editingId ? result?.ok === true : typeof result?.id === "string" && Boolean(result.id)) return editingId || result!.id!;
  throw new Error("لم يصل تأكيد واضح للحفظ. تحقق من قائمة الطاولات قبل إعادة المحاولة.");
}

export function requireTableAdministrationOnline(online: boolean) {
  if (!online) throw new Error("إدارة الطاولات تتطلب اتصالاً بالإنترنت. لم يتم حفظ التغييرات.");
}

export async function saveConfirmedTable(
  write: () => Promise<{ id?: string; ok?: boolean }>,
  refreshCache: (id: string) => Promise<boolean>,
  editingId?: string
) {
  const id = confirmedTableId(await write(), editingId);
  try {
    return { id, cacheUpdated: await refreshCache(id) };
  } catch {
    // The server already confirmed the write. Never suggest resubmitting it
    // merely because a subsequent cache read or local cache update failed.
    return { id, cacheUpdated: false };
  }
}

export function tableAdministrationPayload<T extends { name: string; currentOrderId: string }>(input: T, editing: boolean) {
  const { currentOrderId, ...fields } = input;
  const normalizedFields = { ...fields, name: fields.name.trim() };
  // Current-order association is not an editable administration field.
  // Omit it on PATCH so a stale cached form cannot detach a server order.
  return editing ? normalizedFields : { ...normalizedFields, currentOrderId };
}
