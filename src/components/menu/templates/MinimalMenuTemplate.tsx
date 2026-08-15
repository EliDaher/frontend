"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { formatInteger, formatMoney } from "@/lib/format";
import type { Category, MenuItem, Restaurant } from "@/types/menu";
import { Reveal } from "../Reveal";

type Props = {
  restaurant: Restaurant;
  categories: Category[];
  items: MenuItem[];
};

type ThemeStyle = CSSProperties & {
  "--primary": string;
  "--secondary": string;
};

export function MinimalMenuTemplate({ restaurant, categories, items }: Props) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalize(query);
  const style: ThemeStyle = {
    "--primary": restaurant.theme.primaryColor,
    "--secondary": restaurant.theme.secondaryColor,
    backgroundColor: restaurant.theme.backgroundColor,
    color: restaurant.theme.textColor
  };

  const groups = useMemo(
    () =>
      categories.map((category) => ({
        category,
        items: items.filter((item) => {
          const text = normalize(`${item.name} ${item.description} ${category.name}`);
          return item.categoryId === category.id && (!normalizedQuery || text.includes(normalizedQuery));
        })
      })),
    [categories, items, normalizedQuery]
  );

  return (
    <main className="page-enter min-h-screen" dir="rtl" style={style}>
      <section className="mx-auto max-w-3xl px-4 py-5">
        <Reveal as="header" className="border-b border-black/10 pb-5" distance={18}>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">Minimal Menu</p>
          <h1 className="mt-2 text-3xl font-black leading-tight">{restaurant.name}</h1>
          {restaurant.description ? <p className="mt-2 max-w-2xl text-sm font-semibold leading-7 opacity-75">{restaurant.description}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
            <span className="rounded-full border border-black/10 bg-white/70 px-3 py-1">{restaurant.currency}</span>
            <span className="rounded-full border border-black/10 bg-white/70 px-3 py-1">{formatInteger(items.length)} صنف</span>
          </div>
        </Reveal>

        <Reveal as="label" className="sticky top-0 z-10 mt-4 block bg-[inherit] py-3" delay={90} distance={14}>
          <Search className="pointer-events-none absolute right-7 mt-3 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="بحث سريع..."
            className="h-11 w-full rounded-md border border-black/10 bg-white/85 px-10 text-sm font-bold outline-none focus:border-[var(--primary)]"
          />
        </Reveal>

        <div className="space-y-7 pt-3">
          {groups.map((group, groupIndex) =>
            group.items.length ? (
              <Reveal as="section" key={group.category.id} delay={Math.min(groupIndex * 80, 320)} distance={18}>
                <h2 className="border-b border-black/10 pb-2 text-xl font-black">{group.category.name}</h2>
                <div className="divide-y divide-black/10">
                  {group.items.map((item, itemIndex) => (
                    <Reveal as="article" key={item.id} delay={Math.min(itemIndex * 35, 280)} distance={12} className="flex items-start justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <h3 className="font-black">{item.name}</h3>
                        {item.description ? <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 opacity-70">{item.description}</p> : null}
                      </div>
                      <p className="shrink-0 text-sm font-black text-[var(--primary)]">
                        {formatMoney(item.price, restaurant.currency)}
                      </p>
                    </Reveal>
                  ))}
                </div>
              </Reveal>
            ) : null
          )}
        </div>
      </section>
    </main>
  );
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[إأآا]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
}
