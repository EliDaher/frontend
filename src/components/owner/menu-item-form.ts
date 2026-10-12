import type { Category, MenuItem } from "../../types/menu";

export type ItemDraft = Omit<MenuItem, "id" | "createdAt" | "updatedAt">;
export type ItemField = "name" | "price" | "categoryId" | "order";
export type ItemFieldErrors = Partial<Record<ItemField, string>>;

export function validateMenuItem(item: ItemDraft, categories: Category[]): ItemFieldErrors {
  const errors: ItemFieldErrors = {};
  if (!item.name.trim()) errors.name = "اسم الصنف مطلوب.";
  if (!Number.isFinite(item.price) || item.price <= 0) errors.price = "السعر يجب أن يكون أكبر من صفر.";
  if (!item.categoryId) errors.categoryId = "اختر قسماً للصنف.";
  else if (!categories.some((category) => category.id === item.categoryId)) errors.categoryId = "القسم المحدد غير موجود.";
  if (!Number.isInteger(item.order) || item.order < 0) errors.order = "الترتيب يجب أن يكون عدداً صحيحاً صفراً أو أكبر.";
  return errors;
}

export async function submitMenuItem(options: {
  lock: { current: boolean };
  draft: ItemDraft;
  categories: Category[];
  editingId: string;
  premium: boolean;
  write: (payload: ItemDraft) => Promise<{ id?: string; ok?: boolean }>;
  onStart: () => void;
  onSuccess: (result: { item: MenuItem; nextDraft: ItemDraft | null; message: string }) => void;
  onError: (error: unknown) => void;
  onFinish: () => void;
}) {
  if (options.lock.current || Object.keys(validateMenuItem(options.draft, options.categories)).length) return false;
  options.lock.current = true;
  options.onStart();
  try {
    const payload = {
      ...options.draft,
      name: options.draft.name.trim(),
      description: options.draft.description.trim(),
      image: options.draft.image.trim(),
      isFeatured: options.premium && options.draft.isFeatured
    };
    const result = await options.write(payload);
    const editing = Boolean(options.editingId);
    if (editing ? result?.ok !== true : !result?.id) {
      throw new Error("لم يصل تأكيد واضح للحفظ. تحقق من قائمة الأصناف قبل إعادة المحاولة.");
    }
    options.onSuccess({
      item: { ...payload, id: editing ? options.editingId : result.id! },
      nextDraft: editing ? null : {
        name: "", price: 0, description: "", image: "",
        categoryId: options.draft.categoryId, order: options.draft.order,
        isAvailable: true, isFeatured: false, badges: []
      },
      message: editing ? "تم تحديث الصنف بنجاح" : "تمت إضافة الصنف بنجاح"
    });
    return true;
  } catch (error) {
    options.onError(error);
    return false;
  } finally {
    options.lock.current = false;
    options.onFinish();
  }
}
