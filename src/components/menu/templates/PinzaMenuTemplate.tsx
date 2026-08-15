"use client";

import Image from "next/image";
import { Flame, Phone, Search, Sparkles, Star } from "lucide-react";
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

type FilterId = "all" | "popular" | string;

type ThemeStyle = CSSProperties & {
  "--primary": string;
  "--secondary": string;
  "--page-bg": string;
  "--page-text": string;
};

const badgeMeta: Record<string, { label: string; icon: typeof Star }> = {
  popular: { label: "الأكثر طلباً", icon: Star },
  new: { label: "جديد", icon: Sparkles },
  spicy: { label: "حار", icon: Flame }
};

export function PinzaMenuTemplate({ restaurant, categories, items }: Props) {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");
  const normalizedQuery = normalize(query);
  const style: ThemeStyle = {
    "--primary": restaurant.theme.primaryColor,
    "--secondary": restaurant.theme.secondaryColor,
    "--page-bg": restaurant.theme.backgroundColor || "#fbf8f2",
    "--page-text": restaurant.theme.textColor || "#14110f",
    backgroundColor: restaurant.theme.backgroundColor || "#fbf8f2",
    color: restaurant.theme.textColor || "#14110f"
  };

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        !normalizedQuery || normalize(`${item.name} ${item.description}`).includes(normalizedQuery);
      const matchesFilter =
        activeFilter === "all" ||
        (activeFilter === "popular" && isPopular(item)) ||
        item.categoryId === activeFilter;

      return matchesSearch && matchesFilter;
    });
  }, [items, activeFilter, normalizedQuery]);

  return (
    <main className="page-enter min-h-screen overflow-x-hidden bg-[var(--page-bg)] text-[var(--page-text)]" dir="rtl" style={style}>
      <header className="sticky top-0 z-30 border-b border-black/10 bg-[var(--page-bg)]/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Logo restaurant={restaurant} />
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--primary)]">Food Menu</p>
              <h1 className="truncate text-lg font-black sm:text-xl">{restaurant.name}</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 sm:inline-flex">
              متاح الآن
            </span>
            {restaurant.phone ? (
              <a
                href={`tel:${restaurant.phone}`}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-black px-4 text-sm font-black text-white transition hover:-translate-y-0.5"
              >
                <Phone className="h-4 w-4" />
                اتصال
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 pb-24">
        <Reveal distance={30}>
          <Hero restaurant={restaurant} itemsCount={items.length} />
        </Reveal>

        <Reveal className="sticky top-[65px] z-20 -mx-4 border-y border-black/10 bg-[var(--page-bg)]/95 px-4 py-3 backdrop-blur-xl" delay={120} distance={16}>
          <label className="relative block">
            <Search className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-black/35" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث عن منتج أو وصف..."
              className="h-12 w-full rounded-2xl border border-black/10 bg-white px-12 text-sm font-bold text-black outline-none transition placeholder:text-black/35 focus:border-[var(--primary)] focus:ring-4 focus:ring-black/5"
            />
          </label>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="تصنيفات المنيو">
            <FilterPill active={activeFilter === "all"} label="الكل" onClick={() => setActiveFilter("all")} />
            <FilterPill active={activeFilter === "popular"} label="الأكثر طلبًا" onClick={() => setActiveFilter("popular")} featured />
            {categories.map((category) => (
              <FilterPill
                key={category.id}
                active={activeFilter === category.id}
                label={category.name}
                onClick={() => setActiveFilter(category.id)}
              />
            ))}
          </nav>
        </Reveal>

        <div className="mt-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleItems.map((item, index) => (
            <ProductCard key={item.id} item={item} currency={restaurant.currency} delay={Math.min(index * 45, 360)} />
          ))}
        </div>

        {!visibleItems.length ? (
          <div className="mt-8 rounded-3xl border border-dashed border-black/20 bg-white/70 p-8 text-center">
            <p className="text-lg font-black">لا توجد منتجات مطابقة</p>
            <p className="mt-2 text-sm font-semibold text-black/55">جرّب البحث بكلمة مختلفة أو اختر تصنيفاً آخر.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function Hero({ restaurant, itemsCount }: { restaurant: Restaurant; itemsCount: number }) {
  return (
    <section className="relative mt-4 min-h-[360px] overflow-hidden rounded-[32px] bg-black text-white shadow-[0_28px_70px_rgba(20,17,15,0.18)]">
      {restaurant.coverImage ? (
        <Image
          src={restaurant.coverImage}
          alt={restaurant.name}
          fill
          priority
          sizes="(max-width: 768px) 100vw, 1280px"
          className="object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.25),transparent_26%),linear-gradient(135deg,var(--primary),var(--secondary))]" />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.78),rgba(0,0,0,0.12))]" />
      <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8">
        <span className="inline-flex rounded-full bg-white/15 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] backdrop-blur">
          Modern Food Gallery
        </span>
        <h2 className="mt-4 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">{restaurant.name}</h2>
        {restaurant.description ? (
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-white/82 sm:text-base">{restaurant.description}</p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-black">
          <span className="rounded-full bg-white px-3 py-2 text-black">{formatInteger(itemsCount)} منتج</span>
          {restaurant.currency ? <span className="rounded-full bg-white/15 px-3 py-2 text-white backdrop-blur">{restaurant.currency}</span> : null}
        </div>
      </div>
    </section>
  );
}

function ProductCard({ item, currency, delay = 0 }: { item: MenuItem; currency: string; delay?: number }) {
  return (
    <Reveal as="article" delay={delay} className="group overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_18px_45px_rgba(20,17,15,0.1)] transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_26px_70px_rgba(20,17,15,0.16)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-black/5">
        {item.image ? (
          <Image
            src={item.image}
            alt={item.name}
            fill
            sizes="(max-width: 520px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center bg-[linear-gradient(135deg,var(--primary),var(--secondary))] text-lg font-black text-white">
            Food
          </div>
        )}
        {isPopular(item) ? (
          <span className="absolute right-3 top-3 rounded-full bg-black px-3 py-1 text-xs font-black text-white">
            الأكثر طلبًا
          </span>
        ) : null}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-black leading-7 text-black">{item.name}</h3>
          <p className="shrink-0 rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-black text-white">
            {formatMoney(item.price, currency)}
          </p>
        </div>
        {item.description ? <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-black/58">{item.description}</p> : null}
        {item.badges.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {item.badges.map((badge) => {
              const meta = badgeMeta[badge] ?? { label: badge, icon: Sparkles };
              const Icon = meta.icon;
              return (
                <span key={badge} className="inline-flex items-center gap-1 rounded-full bg-black/[0.06] px-2 py-1 text-xs font-black text-black/70">
                  <Icon className="h-3 w-3 text-[var(--primary)]" />
                  {meta.label}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    </Reveal>
  );
}

function FilterPill({
  active,
  label,
  featured = false,
  onClick
}: {
  active: boolean;
  label: string;
  featured?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 shrink-0 rounded-full border px-4 text-sm font-black transition ${
        active
          ? "border-black bg-black text-white shadow-sm"
          : featured
            ? "border-[var(--primary)] bg-[var(--primary)]/10 text-black hover:bg-[var(--primary)] hover:text-white"
            : "border-black/10 bg-white text-black/68 hover:border-black/30"
      }`}
    >
      {label}
    </button>
  );
}

function Logo({ restaurant }: { restaurant: Restaurant }) {
  return (
    <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-black text-lg font-black text-white">
      {restaurant.logo ? (
        <Image src={restaurant.logo} alt={restaurant.name} width={48} height={48} className="h-full w-full object-cover" />
      ) : (
        restaurant.name.slice(0, 1)
      )}
    </div>
  );
}

function isPopular(item: MenuItem) {
  return item.badges.some((badge) => {
    const value = String(badge);
    const normalized = value.toLowerCase();
    return normalized === "popular" || normalized === "most popular" || value === "الأكثر طلباً";
  });
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[إأآا]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
}
