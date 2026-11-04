export type OrderLine = { menuItemId: string; name: string; quantity: number; notes: string };
export type DraftLine = Omit<OrderLine, "quantity"> & { localId: string; quantity: string };
type StoredLine = Omit<OrderLine, "quantity"> & { localId?: string; quantity: string | number };

export function normalizeQuantity(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, digit => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}
export function parseQuantity(value: string): number | null {
  const normalized = normalizeQuantity(value);
  if (!/^[0-9]+$/.test(normalized)) return null;
  const quantity = Number(normalized);
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 999 ? quantity : null;
}
// Legacy numeric quantities and repeated menu items receive stable, independent keys.
export function restoreDraft(lines: readonly StoredLine[], makeId = () => crypto.randomUUID()): DraftLine[] {
  const used = new Set<string>();
  return lines.map(line => {
    const localId = line.localId && !used.has(line.localId) ? line.localId : makeId();
    used.add(localId);
    return { ...line, localId, quantity: String(line.quantity) };
  });
}
export function addDraftItem(lines: readonly DraftLine[], item: { id: string; name: string }, makeId = () => crypto.randomUUID()): { lines: DraftLine[]; localId: string } {
  return addDraftQuantity(lines, item, 1, makeId);
}
export function addDraftQuantity(lines: readonly DraftLine[], item: { id: string; name: string }, amount: number, makeId = () => crypto.randomUUID()): { lines: DraftLine[]; localId: string } {
  if (!Number.isInteger(amount) || amount < 1 || amount > 999) throw new Error("الكمية من 1 إلى 999");
  const plain = lines.find(line => line.menuItemId === item.id && !line.notes.trim());
  if (plain) {
    const quantity = parseQuantity(plain.quantity);
    return { lines: lines.map(line => line.localId === plain.localId ? { ...line, quantity: String(quantity === null ? amount : Math.min(999, quantity + amount)) } : line), localId: plain.localId };
  }
  const result = addDraftItemWithNote(lines, item, makeId);
  return { ...result, lines: result.lines.map(line => line.localId === result.localId ? { ...line, quantity: String(amount) } : line) };
}
// Adding with a note always starts a separate serving; existing plain quantities stay intact.
export function addDraftItemWithNote(lines: readonly DraftLine[], item: { id: string; name: string }, makeId = () => crypto.randomUUID()): { lines: DraftLine[]; localId: string } {
  if (lines.length >= 100) throw new Error("أرسل هذه الدفعة أولاً ثم أضف بقية الأصناف");
  const line: DraftLine = { localId: makeId(), menuItemId: item.id, name: item.name, quantity: "1", notes: "" };
  return { lines: [...lines, line], localId: line.localId };
}
export function duplicateDraftLine(lines: readonly DraftLine[], localId: string, makeId = () => crypto.randomUUID()): { lines: DraftLine[]; localId: string } {
  const source = lines.find(line => line.localId === localId);
  if (!source) throw new Error("الصنف غير موجود في المسودة");
  if (lines.length >= 100) throw new Error("أرسل هذه الدفعة أولاً ثم أضف بقية الأصناف");
  const copy = { ...source, localId: makeId(), quantity: "1", notes: "" };
  return { lines: [...lines, copy], localId: copy.localId };
}
export function draftToOrderLines(lines: readonly DraftLine[]): OrderLine[] {
  return lines.map(line => {
    const quantity = parseQuantity(line.quantity);
    if (quantity === null) throw new Error("أدخل كمية صحيحة من 1 إلى 999 لكل صنف");
    return { menuItemId: line.menuItemId, name: line.name, quantity, notes: line.notes };
  });
}
