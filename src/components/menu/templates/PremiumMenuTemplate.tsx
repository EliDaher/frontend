"use client";

import Image from "next/image";
import { Crown, Search, Sparkles, Star } from "lucide-react";
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

const badgeLabels = {
  popular: "الأكثر طلباً",
  new: "جديد",
  spicy: "حار"
};

export function PremiumMenuTemplate({ restaurant, categories, items }: Props) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const normalizedQuery = normalize(query);
  const featuredItems = items.filter((item) => item.isFeatured).slice(0, 6);
  const style: ThemeStyle = {
    "--primary": restaurant.theme.primaryColor,
    "--secondary": restaurant.theme.secondaryColor,
    backgroundColor: "#07070a",
    color: "#ffffff"
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
    <main className="page-enter min-h-screen overflow-hidden bg-[#07070a] text-white" dir="rtl" style={style}>
      <section className="mx-auto max-w-6xl pb-24">
        <Reveal as="header" className="relative min-h-[420px] overflow-hidden px-4 py-8 sm:px-6" distance={30}>
          {restaurant.coverImage ? <Image src={restaurant.coverImage} alt={restaurant.name} fill priority sizes="100vw" className="object-cover opacity-45" /> : null}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(212,175,55,0.32),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(124,58,237,0.26),transparent_30%),linear-gradient(to_bottom,rgba(7,7,10,0.65),#07070a)]" />
          <div className="relative z-10 flex min-h-[360px] flex-col justify-end">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-[var(--secondary)] backdrop-blur">
              <Crown className="h-4 w-4" />
              Premium Experience
            </span>
            <h1 className="mt-5 max-w-3xl text-5xl font-black leading-tight sm:text-7xl">{restaurant.name}</h1>
            {restaurant.description ? <p className="mt-4 max-w-2xl text-base font-semibold leading-8 text-white/75">{restaurant.description}</p> : null}
          </div>
        </Reveal>

        <Reveal className="sticky top-0 z-20 mx-3 rounded-2xl border border-white/10 bg-black/55 p-3 shadow-[0_25px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl" delay={120} distance={18}>
          <label className="relative block">
            <Search className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/45" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث في التجربة الفاخرة..."
              className="h-12 w-full rounded-xl border border-white/10 bg-white/10 px-12 text-sm font-bold text-white outline-none placeholder:text-white/45 focus:border-[var(--secondary)]"
            />
          </label>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <PremiumChip active={categoryId === "all"} label="الكل" onClick={() => setCategoryId("all")} />
            {categories.map((category) => (
              <PremiumChip key={category.id} active={categoryId === category.id} label={category.name} onClick={() => setCategoryId(category.id)} />
            ))}
          </div>
        </Reveal>

        {featuredItems.length ? (
          <Reveal as="section" className="px-3 pt-8" delay={180}>
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[var(--secondary)]" />
              <h2 className="text-2xl font-black">Featured Products</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featuredItems.map((item, index) => (
                <PremiumCard key={item.id} item={item} currency={restaurant.currency} featured delay={Math.min(index * 55, 330)} />
              ))}
            </div>
          </Reveal>
        ) : null}

        <section className="grid gap-4 px-3 pt-8 sm:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((item, index) => (
            <PremiumCard key={item.id} item={item} currency={restaurant.currency} delay={Math.min(index * 45, 360)} />
          ))}
        </section>
      </section>
    </main>
  );
}

function PremiumCard({ item, currency, featured = false, delay = 0 }: { item: MenuItem; currency: string; featured?: boolean; delay?: number }) {
  return (
    <Reveal as="article" delay={delay} className={`group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.07] shadow-[0_24px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl transition duration-300 hover:-translate-y-2 hover:rotate-[0.35deg] hover:bg-white/[0.11] ${featured ? "ring-1 ring-[var(--secondary)]/50" : ""}`}>
      <div className="relative h-48 bg-white/5">
        {item.image ? (
          <Image src={item.image} alt={item.name} fill sizes="(max-width: 768px) 100vw, 360px" className="object-cover opacity-90 transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.22),transparent_26%),linear-gradient(135deg,var(--primary),var(--secondary))] text-lg font-black">
            Premium
          </div>
        )}
        {featured ? <span className="absolute right-3 top-3 rounded-full bg-[var(--secondary)] px-3 py-1 text-xs font-black text-black">مميز</span> : null}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-black leading-7">{item.name}</h3>
          <p className="shrink-0 rounded-full border border-[var(--secondary)]/50 bg-[var(--secondary)]/15 px-3 py-1 text-xs font-black text-[var(--secondary)]">
            {formatMoney(item.price, currency)}
          </p>
        </div>
        {item.description ? <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-white/65">{item.description}</p> : null}
        {item.badges.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {item.badges.map((badge) => (
              <span key={badge} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs font-bold text-white/80">
                <Star className="h-3 w-3 text-[var(--secondary)]" />
                {badgeLabels[badge]}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Reveal>
  );
}

function PremiumChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 shrink-0 rounded-full border px-4 text-sm font-black transition ${
        active ? "border-[var(--secondary)] bg-[var(--secondary)] text-black" : "border-white/10 bg-white/10 text-white/75 hover:bg-white/15"
      }`}
    >
      {label}
    </button>
  );
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[إأآا]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
}
