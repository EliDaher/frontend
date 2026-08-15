import Image from "next/image";
import { Flame, MapPin, Phone, Sparkles, Star } from "lucide-react";
import { formatInteger, formatMoney } from "@/lib/format";
import type { MenuItem, Restaurant } from "@/types/menu";

type Variant = "minimal" | "classic" | "premium" | "cafe";

const badgeLabels = {
  popular: { label: "الأكثر طلباً", icon: Star },
  new: { label: "جديد", icon: Sparkles },
  spicy: { label: "حار", icon: Flame }
};

export function CategoryButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-black transition ${
        active
          ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-sm"
          : "border-black/10 bg-white/85 text-zinc-800 hover:border-[var(--primary)]"
      }`}
    >
      {label}
    </button>
  );
}

export function Hero({ restaurant, categoriesCount, itemsCount, variant }: { restaurant: Restaurant; categoriesCount: number; itemsCount: number; variant: Variant }) {
  const premium = variant === "premium";
  const minimal = variant === "minimal";

  if (minimal) {
    return (
      <header className="border-b border-black/10 bg-white px-4 py-6">
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-[var(--primary)] text-xl font-black text-white">
            {restaurant.name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black">{restaurant.name}</h1>
            {restaurant.description ? <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 opacity-70">{restaurant.description}</p> : null}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <InfoChip label={`${formatInteger(categoriesCount)} قسم`} />
          <InfoChip label={`${formatInteger(itemsCount)} صنف`} />
          {restaurant.currency ? <InfoChip label={restaurant.currency} /> : null}
        </div>
      </header>
    );
  }

  return (
    <header className={premium ? "relative overflow-hidden bg-zinc-950 text-white" : "bg-white"}>
      <div className={`${premium ? "h-72 sm:h-96" : variant === "cafe" ? "h-64 sm:h-80" : "h-52 sm:h-72"} relative overflow-hidden`}>
        {restaurant.coverImage ? (
          <Image src={restaurant.coverImage} alt={restaurant.name} fill priority sizes="(max-width: 768px) 100vw, 1024px" className="object-cover" />
        ) : (
          <div className="h-full bg-[linear-gradient(135deg,var(--primary),var(--secondary))]" />
        )}
        <div className={`absolute inset-0 ${premium ? "bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.24),transparent_28%),linear-gradient(to_top,rgba(0,0,0,0.88),rgba(0,0,0,0.24))]" : "bg-[linear-gradient(to_top,rgba(0,0,0,0.74),rgba(0,0,0,0.18),rgba(0,0,0,0.04))]"}`} />
        <div className="absolute bottom-4 left-4 right-4 flex items-end gap-3">
          <div className={`${premium ? "rounded-lg border-white/25 bg-white/10 backdrop-blur" : "rounded-lg bg-white"} grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden border border-white/55 shadow-[0_18px_40px_rgba(0,0,0,0.25)] sm:h-20 sm:w-20`}>
            {restaurant.logo ? (
              <Image src={restaurant.logo} alt={`${restaurant.name} logo`} width={80} height={80} className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl font-black text-[var(--primary)]">{restaurant.name.slice(0, 1)}</span>
            )}
          </div>
          <div className="min-w-0 pb-1 text-white">
            <h1 className={`${premium ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl"} font-black leading-tight`}>{restaurant.name}</h1>
            {restaurant.description ? <p className="mt-1 line-clamp-2 max-w-xl text-sm font-bold leading-6 text-white/85">{restaurant.description}</p> : null}
          </div>
        </div>
      </div>

      <div className={`grid gap-3 px-4 py-4 text-sm sm:grid-cols-[1fr_auto] ${premium ? "border-b border-white/10 bg-white/[0.04]" : "border-b border-black/10"}`}>
        <div className="flex min-w-0 flex-wrap gap-2">
          <InfoChip label={`${formatInteger(categoriesCount)} قسم`} dark={premium} />
          <InfoChip label={`${formatInteger(itemsCount)} صنف`} dark={premium} />
          {restaurant.currency ? <InfoChip label={restaurant.currency} dark={premium} /> : null}
        </div>
        <div className="flex min-w-0 flex-wrap gap-2 opacity-85">
          {restaurant.phone ? <ContactChip icon="phone" label={restaurant.phone} dark={premium} /> : null}
          {restaurant.address ? <ContactChip icon="map" label={restaurant.address} dark={premium} /> : null}
        </div>
      </div>
    </header>
  );
}

function InfoChip({ label, dark = false }: { label: string; dark?: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-3 py-2 text-xs font-black shadow-sm ${dark ? "border-white/10 bg-white/10" : "border-black/10 bg-white/70"}`}>
      {label}
    </span>
  );
}

function ContactChip({ icon, label, dark }: { icon: "phone" | "map"; label: string; dark: boolean }) {
  const Icon = icon === "phone" ? Phone : MapPin;
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 ${dark ? "border-white/10 bg-white/10" : "border-black/10 bg-white/55"}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function MenuItemCard({ item, currency, variant, featured = false }: { item: MenuItem; currency: string; variant: Variant; featured?: boolean }) {
  const premium = variant === "premium";
  const minimal = variant === "minimal";
  const cafe = variant === "cafe";

  if (minimal) {
    return (
      <article className="rounded-md border border-black/10 bg-white p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-black leading-6">{item.name}</h3>
            {item.description ? <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 opacity-70">{item.description}</p> : null}
          </div>
          <p className="shrink-0 rounded-md bg-[var(--primary)] px-2.5 py-1 text-xs font-black text-white">
            {formatMoney(item.price, currency)}
          </p>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`group grid min-h-32 gap-3 rounded-lg border p-2.5 transition ${
        cafe ? "grid-cols-[120px_1fr] sm:grid-cols-[140px_1fr]" : "grid-cols-[88px_1fr] sm:grid-cols-[104px_1fr]"
      } ${
        premium
          ? "border-white/10 bg-white/[0.08] shadow-[0_18px_45px_rgba(0,0,0,0.28)] backdrop-blur hover:-translate-y-1 hover:bg-white/[0.12]"
          : "border-black/10 bg-white/92 shadow-[0_12px_28px_rgba(15,23,42,0.08)] hover:-translate-y-0.5"
      } ${featured ? "ring-1 ring-[var(--secondary)]/45" : ""}`}
    >
      <div className={`${cafe ? "h-[120px] w-[120px] sm:h-[140px] sm:w-[140px]" : "h-[88px] w-[88px] sm:h-[104px] sm:w-[104px]"} relative overflow-hidden rounded-md bg-black/5`}>
        {item.image ? (
          <Image src={item.image} alt={item.name} fill sizes={cafe ? "140px" : "104px"} className="object-cover transition duration-300 group-hover:scale-105" />
        ) : (
          <div className="grid h-full place-items-center bg-[color-mix(in_srgb,var(--primary)_18%,white)] text-sm font-bold text-[var(--primary)]">
            صورة
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 text-base font-black leading-6 sm:text-lg">{item.name}</h3>
          <p className="shrink-0 rounded-md bg-[var(--primary)] px-2.5 py-1 text-xs font-black text-white shadow-sm sm:text-sm">
            {formatMoney(item.price, currency)}
          </p>
        </div>
        {item.description ? <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-6 opacity-75">{item.description}</p> : null}
        {item.badges.length || item.isFeatured ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {item.isFeatured ? <Badge icon={Sparkles} label="مميز" /> : null}
            {item.badges.map((badge) => {
              const BadgeIcon = badgeLabels[badge].icon;
              return <Badge key={badge} icon={BadgeIcon} label={badgeLabels[badge].label} />;
            })}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Badge({ icon: Icon, label }: { icon: typeof Sparkles; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--primary)]/30 bg-white/10 px-2 py-1 text-xs font-bold text-[var(--primary)]">
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
