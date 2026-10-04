export type MergeableOrderLine = {
  menuItemId: string;
  name?: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
  modifiers?: string[];
};

export function canMergeOrderLines(existing: MergeableOrderLine, incoming: MergeableOrderLine) {
  return (
    existing.menuItemId === incoming.menuItemId &&
    Number(existing.unitPrice) === Number(incoming.unitPrice) &&
    normalizedNote(existing.notes) === normalizedNote(incoming.notes) &&
    normalizedModifiers(existing.modifiers) === normalizedModifiers(incoming.modifiers)
  );
}

export function mergeOrderLines<T extends MergeableOrderLine>(existingLines: T[], incomingLines: T[]) {
  return incomingLines.reduce<T[]>((result, incoming) => addOrMergeOrderLine(result, incoming), existingLines.map((line) => ({ ...line })));
}

export function addOrMergeOrderLine<T extends MergeableOrderLine>(lines: T[], incoming: T) {
  const quantity = safeQuantity(incoming.quantity);
  const nextIncoming = { ...incoming, quantity };
  const matchIndex = lines.findIndex((line) => canMergeOrderLines(line, nextIncoming));

  if (matchIndex === -1) return [...lines, nextIncoming];

  return lines.map((line, index) => (
    index === matchIndex ? { ...line, quantity: safeQuantity(line.quantity) + quantity } : line
  ));
}

export function updateLineQuantity<T extends MergeableOrderLine>(lines: T[], index: number, quantity: number) {
  if (quantity <= 0) return lines.filter((_, lineIndex) => lineIndex !== index);
  return lines.map((line, lineIndex) => (lineIndex === index ? { ...line, quantity: safeQuantity(quantity) } : line));
}

export function lineItemsQuantity(lines: MergeableOrderLine[]) {
  return lines.reduce((sum, line) => sum + safeQuantity(line.quantity), 0);
}

export function lineItemsTotal(lines: MergeableOrderLine[]) {
  return lines.reduce((sum, line) => sum + safeQuantity(line.quantity) * Number(line.unitPrice || 0), 0);
}

function safeQuantity(value: number) {
  return Math.max(1, Number.isFinite(value) ? Math.floor(value) : 1);
}

function normalizedNote(value: string | undefined) {
  return (value ?? "").trim();
}

function normalizedModifiers(value: string[] | undefined) {
  return JSON.stringify([...(value ?? [])].sort());
}
