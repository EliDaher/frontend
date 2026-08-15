"use client";

import Image from "next/image";
import { MapPin, Phone, Search } from "lucide-react";
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

export function ClassicMenuTemplate({ restaurant, categories, items }: Props) {
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
    <main className="page-enter min-h-screen" dir="rtl" style={style}>
      <section className="mx-auto max-w-5xl px-4 py-5">
        <Reveal as="header" className="rounded-lg border border-black/10 bg-white/85 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Logo restaurant={restaurant} />
            <div className="min-w-0">
              <p className="text-xs font-black text-[var(--primary)]">Classic Menu</p>
              <h1 className="truncate text-3xl font-black">{restaurant.name}</h1>
              {restaurant.description ? <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 opacity-70">{restaurant.description}</p> : null}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold opacity-75">
            {restaurant.phone ? <Info icon={<Phone className="h-4 w-4" />} text={restaurant.phone} /> : null}
            {restaurant.address ? <Info icon={<MapPin className="h-4 w-4" />} text={restaurant.address} /> : null}
          </div>
        </Reveal>

        <Reveal className="sticky top-0 z-10 mt-4 rounded-lg border border-black/10 bg-white/95 p-3 shadow-sm backdrop-blur" delay={110} distance={16}>
          <label className="relative block">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث في المنيو..."
              className="h-11 w-full rounded-md border border-black/10 bg-white px-10 text-sm font-bold text-slate-900 outline-none focus:border-[var(--primary)]"
            />
          </label>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <CategoryChip active={categoryId === "all"} label="كل الأقسام" onClick={() => setCategoryId("all")} />
            {categories.map((category) => (
              <CategoryChip key={category.id} active={categoryId === category.id} label={category.name} onClick={() => setCategoryId(category.id)} />
            ))}
          </div>
        </Reveal>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {visibleItems.map((item, index) => (
            <Reveal as="article" key={item.id} delay={Math.min(index * 45, 360)} className="grid grid-cols-[82px_1fr] gap-3 rounded-lg border border-black/10 bg-white/90 p-2.5 shadow-sm transition hover:-translate-y-0.5">
              <div className="relative h-[82px] w-[82px] overflow-hidden rounded-md bg-slate-100">
                {item.image ? <Image src={item.image} alt={item.name} fill sizes="82px" className="object-cover" /> : <div className="grid h-full place-items-center text-xs font-black text-[var(--primary)]">صورة</div>}
              </div>
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-black leading-6">{item.name}</h3>
                  <p className="shrink-0 rounded-md bg-[var(--primary)] px-2 py-1 text-xs font-black text-white">
                    {formatMoney(item.price, restaurant.currency)}
                  </p>
                </div>
                {item.description ? <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 opacity-70">{item.description}</p> : null}
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </main>
  );
}

function Logo({ restaurant }: { restaurant: Restaurant }) {
  return (
    <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-[var(--primary)] text-xl font-black text-white">
      {restaurant.logo ? <Image src={restaurant.logo} alt={restaurant.name} width={64} height={64} className="h-full w-full object-cover" /> : restaurant.name.slice(0, 1)}
    </div>
  );
}

function Info({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-3 py-1">
      {icon}
      {text}
    </span>
  );
}

function CategoryChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 shrink-0 rounded-full border px-3 text-sm font-black ${
        active ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-black/10 bg-white text-slate-700"
      }`}
    >
      {label}
    </button>
  );
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[إأآا]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
}
