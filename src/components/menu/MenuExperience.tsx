"use client";

import { ArrowUp, Search, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { formatInteger } from "@/lib/format";
import type { Category, MenuItem, Restaurant } from "@/types/menu";
import { CategoryButton, Hero, MenuItemCard } from "./MenuExperienceParts";
import { normalizeSearch } from "./menuSearch";

type Variant = "minimal" | "classic" | "premium" | "cafe";

type Props = {
  restaurant: Restaurant;
  categories: Category[];
  items: MenuItem[];
  variant: Variant;
};

type ThemeVars = CSSProperties & {
  "--primary": string;
  "--secondary": string;
  "--background": string;
  "--text": string;
};

export function MenuExperience({ restaurant, categories, items, variant }: Props) {
  const [query, setQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState("all");
  const normalizedQuery = normalizeSearch(query);
  const premium = variant === "premium";
  const minimal = variant === "minimal";

  const groupedItems = useMemo(() => {
    return categories.map((category) => ({
      category,
      items: items.filter((item) => {
        const matchesCategory = item.categoryId === category.id;
        const matchesQuery =
          !normalizedQuery ||
          normalizeSearch(item.name).includes(normalizedQuery) ||
          normalizeSearch(item.description).includes(normalizedQuery) ||
          normalizeSearch(category.name).includes(normalizedQuery);

        return matchesCategory && matchesQuery;
      })
    }));
  }, [categories, items, normalizedQuery]);

  const featuredItems = premium ? items.filter((item) => item.isFeatured).slice(0, 6) : [];
  const resultCount = groupedItems.reduce((count, group) => count + group.items.length, 0);
  const showResults = groupedItems.some((group) => group.items.length > 0);
  const theme = restaurant.theme;

  const style: ThemeVars = {
    "--primary": theme.primaryColor,
    "--secondary": theme.secondaryColor,
    "--background": theme.backgroundColor,
    "--text": theme.textColor,
    backgroundColor: theme.backgroundColor,
    color: theme.textColor
  };

  function jumpToCategory(categoryId: string) {
    setActiveCategoryId(categoryId);
    if (categoryId === "all") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    document.getElementById(`category-${categoryId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main style={style} className={`min-h-screen overflow-x-hidden ${premium ? "bg-zinc-950 text-white" : ""}`} dir="rtl">
      <section className={`mx-auto pb-28 ${premium ? "max-w-5xl" : "max-w-4xl"}`}>
        <Hero restaurant={restaurant} categoriesCount={categories.length} itemsCount={items.length} variant={variant} />

        <div className={`sticky top-0 z-20 border-b px-4 py-3 shadow-sm backdrop-blur-md ${
          premium ? "border-white/10 bg-zinc-950/85" : "border-black/10 bg-white/90"
        }`}>
          <div className="mb-3 flex items-center justify-between gap-3 text-xs font-bold opacity-75">
            <span>{formatInteger(resultCount)} صنف متاح</span>
            <span className="truncate">{query ? `نتائج البحث عن "${query}"` : "اختر قسماً أو ابحث مباشرة"}</span>
          </div>

          <label className="relative block">
            <Search className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث عن طبق، مشروب، أو قسم..."
              className="h-12 w-full rounded-md border border-black/10 bg-white px-12 text-base font-bold text-zinc-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)] outline-none transition placeholder:text-sm placeholder:font-semibold placeholder:text-zinc-400 focus:border-[var(--primary)] focus:ring-4 focus:ring-black/5"
            />
            {query ? (
              <button
                type="button"
                aria-label="مسح البحث"
                onClick={() => setQuery("")}
                className="absolute left-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </label>

          <nav className="hide-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="أقسام المنيو">
            <CategoryButton active={activeCategoryId === "all"} label="الكل" onClick={() => jumpToCategory("all")} />
            {categories.map((category) => (
              <CategoryButton key={category.id} active={activeCategoryId === category.id} label={category.name} onClick={() => jumpToCategory(category.id)} />
            ))}
          </nav>
        </div>

        {featuredItems.length ? (
          <section className="px-3 pt-5 sm:px-4">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[var(--secondary)]" />
              <h2 className="text-2xl font-black">اختيارات مميزة</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {featuredItems.map((item) => (
                <MenuItemCard key={item.id} item={item} currency={restaurant.currency} variant="premium" featured />
              ))}
            </div>
          </section>
        ) : null}

        <div className={`space-y-8 px-3 pt-5 sm:px-4 sm:pt-6 ${minimal ? "space-y-5" : ""}`}>
          {showResults ? (
            groupedItems.map((group) =>
              group.items.length ? (
                <section key={group.category.id} id={`category-${group.category.id}`} className="scroll-mt-36">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className={`${minimal ? "text-xl" : "text-2xl"} font-black leading-tight`}>{group.category.name}</h2>
                    <span className={`rounded-full border px-3 py-1 text-xs font-black opacity-80 ${
                      premium ? "border-white/10 bg-white/10" : "border-black/10 bg-white/70"
                    }`}>
                      {formatInteger(group.items.length)}
                    </span>
                  </div>
                  <div className={minimal ? "grid gap-2" : variant === "cafe" ? "grid gap-4 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-2"}>
                    {group.items.map((item) => (
                      <MenuItemCard key={item.id} item={item} currency={restaurant.currency} variant={variant} />
                    ))}
                  </div>
                </section>
              ) : null
            )
          ) : (
            <div className={`rounded-lg border border-dashed p-8 text-center shadow-sm ${premium ? "border-white/15 bg-white/10" : "border-black/20 bg-white/75"}`}>
              <p className="text-lg font-black">لا توجد نتائج مطابقة.</p>
              <p className="mt-2 text-sm leading-6 opacity-70">جرّب كلمة مختلفة أو امسح البحث لعرض المنيو كاملاً.</p>
            </div>
          )}
        </div>
      </section>

      <button
        type="button"
        aria-label="الرجوع للأعلى"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 grid h-12 w-12 place-items-center rounded-full bg-[var(--primary)] text-white shadow-[0_18px_36px_rgba(0,0,0,0.22)] transition hover:-translate-y-1"
      >
        <ArrowUp className="h-5 w-5" />
      </button>
    </main>
  );
}
