export type PricedOrderLine = {
  quantity: number;
  unitPrice: number;
  total: number;
};

export function withUnitPrice<T extends PricedOrderLine>(line: T, unitPrice: number): T {
  const nextUnitPrice = nonNegative(unitPrice);
  return { ...line, unitPrice: nextUnitPrice, total: nextUnitPrice * safeQuantity(line.quantity) };
}

export function withLineTotal<T extends PricedOrderLine>(line: T, total: number): T {
  const nextTotal = nonNegative(total);
  return { ...line, total: nextTotal, unitPrice: nextTotal / safeQuantity(line.quantity) };
}

export function withQuantity<T extends PricedOrderLine>(line: T, quantity: number): T {
  const nextQuantity = safeQuantity(quantity);
  return { ...line, quantity: nextQuantity, total: nonNegative(line.unitPrice) * nextQuantity };
}

export function isValidPricedLine(line: PricedOrderLine) {
  return Number.isFinite(line.quantity) && line.quantity > 0 && Number.isFinite(line.unitPrice) && line.unitPrice >= 0 && Number.isFinite(line.total) && line.total >= 0;
}

function nonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function safeQuantity(value: number) {
  return Number.isFinite(value) ? Math.max(1, value) : 1;
}
