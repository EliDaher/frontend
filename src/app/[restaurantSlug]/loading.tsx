export default function LoadingMenu() {
  return (
    <main className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-4xl animate-pulse pb-10">
        <div className="relative h-52 bg-stone-200 sm:h-72">
          <div className="absolute bottom-4 right-4 h-[72px] w-[72px] rounded-lg bg-white/80 shadow-lift" />
          <div className="absolute bottom-8 right-24 h-7 w-44 rounded bg-white/70" />
        </div>
        <div className="space-y-3 border-b border-black/10 bg-white/80 p-4">
          <div className="h-12 rounded-md bg-stone-200" />
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-9 w-24 shrink-0 rounded-full bg-stone-200" />
            ))}
          </div>
        </div>
        <div className="space-y-4 px-3 pt-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="grid min-h-32 grid-cols-[88px_1fr] gap-3 rounded-lg border border-black/10 bg-white p-2.5 shadow-sm">
              <div className="h-[88px] w-[88px] rounded-md bg-stone-200" />
              <div className="space-y-3 pt-1">
                <div className="h-5 w-3/4 rounded bg-stone-200" />
                <div className="h-4 w-full rounded bg-stone-200" />
                <div className="h-4 w-2/3 rounded bg-stone-200" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
