"use client";

import Image from "next/image";
import { Coffee, MapPin, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { formatMoney } from "@/lib/format";
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

export function CafeMenuTemplate({ restaurant, categories, items }: Props) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const normalizedQuery = normalize(query);
  const style: ThemeStyle = {
    "--primary": restaurant.theme.primaryColor,
    "--secondary": restaurant.theme.secondaryColor,
    backgroundColor: restaurant.theme.backgroundColor,
    color: restaurant.theme.textColor
  };

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        const matchesCategory = categoryId === "all" || item.categoryId === categoryId;
        const matchesSearch = !normalizedQuery || normalize(`${item.name} ${item.description}`).includes(normalizedQuery);
        return matchesCategory && matchesSearch;
      }),
    [items, categoryId, normalizedQuery]
  );

  return (
    <main className="page-enter min-h-screen overflow-hidden" dir="rtl" style={style}>
      <section className="mx-auto max-w-5xl pb-24">
        <Reveal as="header" className="relative min-h-[360px] overflow-hidden rounded-b-[32px] bg-[#3b2418] text-white shadow-[0_24px_70px_rgba(88,45,20,0.25)]" distance={30}>
          {restaurant.coverImage ? (
            <Image src={restaurant.coverImage} alt={restaurant.name} fill priority sizes="100vw" className="object-cover" />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.25),transparent_24%),linear-gradient(135deg,var(--primary),var(--secondary))]" />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(45,22,10,0.9),rgba(45,22,10,0.35))]" />
          <div className="absolute bottom-6 left-5 right-5">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-black backdrop-blur">
              <Coffee className="h-4 w-4" />
              Cafe Menu
            </span>
            <h1 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">{restaurant.name}</h1>
            {restaurant.description ? <p className="mt-3 max-w-2xl text-sm font-bold leading-7 text-white/85">{restaurant.description}</p> : null}
            {restaurant.address ? (
              <p className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-white/80">
                <MapPin className="h-4 w-4" />
                {restaurant.address}
              </p>
            ) : null}
          </div>
        </Reveal>

        <Reveal className="sticky top-0 z-10 mx-3 -mt-6 rounded-2xl border border-black/10 bg-white/95 p-3 shadow-[0_18px_50px_rgba(88,45,20,0.15)] backdrop-blur" delay={120} distance={18}>
          <label className="relative block">
            <Search className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث عن قهوة، حلى، أو طبق..."
              className="h-12 w-full rounded-xl border border-stone-200 bg-stone-50 px-12 text-sm font-bold text-stone-900 outline-none focus:border-[var(--primary)]"
            />
          </label>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <CafeChip active={categoryId === "all"} label="الكل" onClick={() => setCategoryId("all")} />
            {categories.map((category) => (
              <CafeChip key={category.id} active={categoryId === category.id} label={category.name} onClick={() => setCategoryId(category.id)} />
            ))}
          </div>
        </Reveal>

        <div className="grid gap-4 px-3 pt-6 sm:grid-cols-2">
          {visibleItems.map((item, index) => (
            <Reveal as="article" key={item.id} delay={Math.min(index * 45, 360)} className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_16px_35px_rgba(88,45,20,0.12)] transition hover:-translate-y-1">
              <div className="relative h-44 bg-stone-100">
                {item.image ? (
                  <Image src={item.image} alt={item.name} fill sizes="(max-width: 768px) 100vw, 420px" className="object-cover" />
                ) : (
                  <div className="grid h-full place-items-center bg-[linear-gradient(135deg,var(--primary),var(--secondary))] text-lg font-black text-white">Cafe</div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-black leading-7 text-stone-950">{item.name}</h3>
                  <p className="shrink-0 rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-black text-white">
                    {formatMoney(item.price, restaurant.currency)}
                  </p>
                </div>
                {item.description ? <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-stone-600">{item.description}</p> : null}
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </main>
  );
}

function CafeChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 shrink-0 rounded-full px-4 text-sm font-black transition ${
        active ? "bg-[var(--primary)] text-white shadow-sm" : "bg-stone-100 text-stone-700 hover:bg-stone-200"
      }`}
    >
      {label}
    </button>
  );
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[إأآا]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
}
