type AvailableCategory = { id: string; isActive: boolean };

export function resolveNewItemCategory(
  categories: AvailableCategory[],
  remembered: Record<string, string>,
  restaurantId?: string,
  explicitCategory?: string
) {
  const available = categories.filter((category) => category.isActive);
  const valid = (id?: string) => available.some((category) => category.id === id);
  if (valid(explicitCategory)) return explicitCategory!;
  const previous = restaurantId ? remembered[restaurantId] : undefined;
  if (valid(previous)) return previous!;
  return available[0]?.id ?? "";
}
