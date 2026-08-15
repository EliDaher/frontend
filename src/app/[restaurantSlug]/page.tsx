import { MenuTemplateRenderer } from "@/components/menu/MenuTemplateRenderer";
import { getMenu, getRestaurant } from "@/lib/api";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ restaurantSlug: string }>;
};

export default async function RestaurantMenuPage({ params }: PageProps) {
  const { restaurantSlug } = await params;

  try {
    const [restaurant, menu] = await Promise.all([getRestaurant(restaurantSlug), getMenu(restaurantSlug)]);
    return <MenuTemplateRenderer restaurant={restaurant} categories={menu.categories} items={menu.items} />;
  } catch {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-950 px-5 text-center text-white" dir="rtl">
        <section className="max-w-md">
          <p className="text-sm font-semibold text-amber-300">المنيو غير متاح حالياً</p>
          <h1 className="mt-3 text-3xl font-black leading-tight">لم نتمكن من تحميل منيو هذا المطعم.</h1>
          <p className="mt-4 leading-7 text-stone-300">قد يكون الرابط غير صحيح أو أن المطعم غير فعال حالياً. الرجاء المحاولة لاحقاً.</p>
        </section>
      </main>
    );
  }
}
