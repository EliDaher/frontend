"use client";
import { MessageSquarePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { adminRequest } from "@/lib/api";
import { ApiError } from "@/lib/api-errors";
import { sortTablesByNumber } from "@/lib/table-number";
import { DraftPanel, type DraftReveal } from "./DraftPanel";
import {
  addDraftQuantity,
  addDraftItemWithNote,
  duplicateDraftLine,
  draftToOrderLines,
  restoreDraft,
  type DraftLine,
  type OrderLine as Line,
} from "./draft";
type Batch = {
  operationId: string;
  tableId: string;
  orderId: string;
  createdAt: string;
  items: Line[];
  orderNote?: string;
  status: "pending" | "sent" | "review";
  error?: string;
};
type Data = {
  tables: {
    id: string;
    name: string;
    area: string;
    status: string;
    currentOrderId: string;
  }[];
  orders: {
    id: string;
    tableId: string;
    items: Line[];
  }[];
  items: {
    id: string;
    name: string;
    categoryId: string;
    isAvailable: boolean;
    order: number;
  }[];
  categories: {
    id: string;
    name: string;
    order: number;
  }[];
};
type Session = {
  token: string;
  user: {
    id: string;
    restaurantId: string;
    name: string;
  };
  restaurantName: string;
};
type Saved = {
  drafts: Record<string, DraftLine[]>;
  orderNotes: Record<string, string>;
  batches: Batch[];
  data?: Data;
};
const sessionKey = (slug: string) => `waiter-session:${slug}`;
const dataKey = (s: Session) =>
  `waiter-data:${s.user.restaurantId}:${s.user.id}`;
const empty = (): Saved => ({ drafts: {}, orderNotes: {}, batches: [] });
export function WaiterApp({ slug }: { slug: string }) {
  const [session, setSession] = useState<Session | null>(null),
    [saved, setSaved] = useState<Saved>(empty),
    [ready, setReady] = useState(false);
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [tab, setTab] = useState("tables"),
    [tableId, setTableId] = useState(""),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [message, setMessage] = useState(""),
    [draftExpanded, setDraftExpanded] = useState(true),
    [sending, setSending] = useState(false),
    [loginBusy, setLoginBusy] = useState(false);
  const [draftHeight, setDraftHeight] = useState(0);
  const [draftReveal, setDraftReveal] = useState<DraftReveal | null>(null);
  const revealSequence = useRef(0);
  const savedRef = useRef(saved),
    sessionRef = useRef(session),
    lock = useRef(false);
  function store(next: Saved) {
    const current = sessionRef.current;
    if (!current) return;
    try {
      localStorage.setItem(dataKey(current), JSON.stringify(next));
      savedRef.current = next;
      setSaved(next);
    } catch {
      setMessage("تعذر الحفظ على الجوال. وفّر مساحة تخزين ثم أعد المحاولة.");
      throw new Error("storage unavailable");
    }
  }
  function activate(s: Session) {
    let next = empty();
    try {
      next = JSON.parse(localStorage.getItem(dataKey(s)) || "null") || empty();
      next.orderNotes ??= {};
      next.drafts = Object.fromEntries(
        Object.entries(next.drafts).map(([id, lines]) => [
          id,
          restoreDraft(lines),
        ]),
      );
      localStorage.setItem(dataKey(s), JSON.stringify(next));
      localStorage.setItem(sessionKey(slug), JSON.stringify(s));
    } catch {
      setMessage("تعذر قراءة البيانات المحفوظة");
    }
    sessionRef.current = s;
    savedRef.current = next;
    setSaved(next);
    setSession(s);
  }
  function logout() {
    sessionRef.current = null;
    setSession(null);
    localStorage.removeItem(sessionKey(slug));
    setSaved(empty());
    setTableId("");
  }
  useEffect(() => {
    try {
      const raw = localStorage.getItem(sessionKey(slug));
      if (raw) activate(JSON.parse(raw));
    } catch {}
    setReady(true);
  }, [slug]);
  async function refresh(s: Session) {
    const data = await adminRequest<Data>("/api/waiter/bootstrap", s.token);
    if (sessionRef.current?.token === s.token)
      store({ ...savedRef.current, data });
  }
  async function sync() {
    const s = sessionRef.current;
    if (!s || lock.current || !navigator.onLine) return;
    lock.current = true;
    setSending(true);
    try {
      for (const batch of savedRef.current.batches.filter(
        (b) => b.status === "pending",
      )) {
        if (sessionRef.current?.token !== s.token) break;
        try {
          await adminRequest("/api/waiter/batches", s.token, {
            method: "POST",
            body: JSON.stringify({
              operationId: batch.operationId,
              tableId: batch.tableId,
              orderId: batch.orderId,
              createdAt: batch.createdAt,
              items: batch.items.map(({ menuItemId, quantity, notes }) => ({
                menuItemId,
                quantity,
                notes,
              })),
              ...(batch.orderNote !== undefined
                ? { orderNote: batch.orderNote }
                : {}),
            }),
          });
          if (sessionRef.current?.token !== s.token) break;
          store({
            ...savedRef.current,
            batches: savedRef.current.batches.map((b) =>
              b.operationId === batch.operationId
                ? { ...b, status: "sent", error: undefined }
                : b,
            ),
          });
        } catch (e) {
          if (sessionRef.current?.token !== s.token) break;
          if (e instanceof ApiError && e.status === 401) {
            setMessage(
              "انتهت الجلسة أو عُطل الحساب. سجل الدخول مجدداً؛ الدفعات محفوظة.",
            );
            logout();
            break;
          }
          if (
            e instanceof ApiError &&
            e.status >= 400 &&
            e.status < 500 &&
            e.status !== 429
          ) {
            store({
              ...savedRef.current,
              batches: savedRef.current.batches.map((b) =>
                b.operationId === batch.operationId
                  ? { ...b, status: "review", error: e.message }
                  : b,
              ),
            });
          } else {
            setMessage(
              "الدفعات محفوظة؛ سنعيد الإرسال تلقائياً عند توفر الاتصال.",
            );
            break;
          }
        }
      }
      if (sessionRef.current?.token === s.token) await refresh(s);
      if (
        sessionRef.current?.token === s.token &&
        !savedRef.current.batches.some((b) => b.status === "pending")
      )
        setMessage(
          savedRef.current.batches.some((b) => b.status === "review")
            ? "هناك دفعة تحتاج مراجعة؛ تحقق منها أدناه."
            : "",
        );
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setMessage("انتهت الجلسة أو عُطل الحساب");
        logout();
      }
    } finally {
      lock.current = false;
      setSending(false);
    }
  }
  useEffect(() => {
    if (!session) return;
    void sync();
    const resume = () => void sync();
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    const timer = setInterval(resume, 15000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
    };
  }, [session?.token]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginBusy(true);
    setMessage("");
    try {
      activate(
        await adminRequest<Session>("/api/waiter/login", undefined, {
          method: "POST",
          body: JSON.stringify({ slug, username, password }),
        }),
      );
      setPassword("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "تعذر الدخول");
    } finally {
      setLoginBusy(false);
    }
  }
  const data = saved.data,
    table = data?.tables.find((t) => t.id === tableId),
    order = data?.orders.find((o) => o.id === table?.currentOrderId),
    draft = saved.drafts[tableId] || [];
  function change(lines: DraftLine[]) {
    try {
      store({
        ...savedRef.current,
        drafts: { ...savedRef.current.drafts, [tableId]: lines },
      });
    } catch {}
  }
  function select(id: string) {
    setTableId(id);
    setTab("menu");
    setQuery("");
    setDraftExpanded(true);
    setDraftReveal(null);
  }
  function revealLine(localId: string, focusNote = false) {
    setDraftExpanded(true);
    setDraftReveal({ localId, focusNote, sequence: ++revealSequence.current });
  }
  function add(id: string, withNote = false, quantity = 1) {
    if (!tableId) {
      setMessage("اختر الطاولة أولاً ثم أضف الصنف");
      setTab("tables");
      return;
    }
    const item = data?.items.find((i) => i.id === id);
    if (!item) return;
    try {
      const lines = savedRef.current.drafts[tableId] || [];
      const result = withNote
        ? addDraftItemWithNote(lines, item)
        : addDraftQuantity(lines, item, quantity);
      change(result.lines);
      revealLine(result.localId, withNote);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر إضافة الصنف");
    }
  }
  function updateLine(
    localId: string,
    patch: Partial<Pick<DraftLine, "quantity" | "notes">>,
  ) {
    change(
      (savedRef.current.drafts[tableId] || []).map((line) =>
        line.localId === localId ? { ...line, ...patch } : line,
      ),
    );
  }
  function duplicateLine(localId: string) {
    try {
      const result = duplicateDraftLine(
        savedRef.current.drafts[tableId] || [],
        localId,
      );
      change(result.lines);
      revealLine(result.localId, true);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "تعذر إضافة نسخة الصنف",
      );
    }
  }
  function changeOrderNote(note: string) {
    try {
      store({
        ...savedRef.current,
        orderNotes: { ...savedRef.current.orderNotes, [tableId]: note },
      });
    } catch {}
  }
  function submit() {
    const currentDraft = savedRef.current.drafts[tableId] || [];
    if (!currentDraft.length || !table) return;
    try {
      const items = draftToOrderLines(currentDraft);
      const orderNote = (savedRef.current.orderNotes[tableId] || "").trim();
      const next = {
        ...savedRef.current,
        drafts: { ...savedRef.current.drafts, [tableId]: [] },
        orderNotes: { ...savedRef.current.orderNotes, [tableId]: "" },
        batches: [
          ...savedRef.current.batches,
          {
            operationId: crypto.randomUUID(),
            tableId,
            orderId: table.currentOrderId || "",
            createdAt: new Date().toISOString(),
            items,
            ...(orderNote ? { orderNote } : {}),
            status: "pending" as const,
          },
        ],
      };
      store(next);
      setMessage("حُفظت الدفعة؛ بانتظار تأكيد الخادم");
      void sync();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر إرسال الطلب");
    }
  }
  const button =
    "min-h-12 rounded-xl border border-app-border bg-app-surface px-4 py-3 font-semibold disabled:opacity-50";
  if (!ready) return null;
  return (
    <main
      dir="rtl"
      className="min-h-screen bg-app-bg p-3 text-app-ink"
      style={{
        paddingBottom:
          session && tab === "menu" && draft.length ? draftHeight + 24 : 24,
      }}
    >
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="sticky top-0 z-10 rounded-xl bg-app-bg py-2">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-bold">
              {session ? session.restaurantName : "دخول النادل"}
            </h1>
            {session && (
              <button className={button} onClick={logout}>
                خروج
              </button>
            )}
          </div>
          {session && (
            <p>
              {session.user.name}
              {table ? ` · طاولة ${table.name}` : ""}
            </p>
          )}
        </header>
        {message && (
          <p role="status" className="rounded-xl bg-app-primary-soft p-3">
            {message}
          </p>
        )}
        {!session ? (
          <form
            onSubmit={login}
            className="grid gap-4 rounded-xl bg-app-surface p-5"
          >
            <label>
              اسم المستخدم
              <input
                autoComplete="username"
                required
                dir="ltr"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-2 min-h-12 w-full rounded-lg border p-3"
              />
            </label>
            <label>
              كلمة المرور
              <input
                autoComplete="current-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 min-h-12 w-full rounded-lg border p-3"
              />
            </label>
            <button disabled={loginBusy} className={button}>
              دخول
            </button>
          </form>
        ) : (
          <>
            <nav className="grid grid-cols-2 gap-2">
              {[
                ["tables", "الطاولات"],
                ["menu", "المنيو"],
              ].map(([id, label]) => (
                <button
                  aria-pressed={tab === id}
                  key={id}
                  className={`${button} ${tab === id ? "bg-app-primary-soft" : ""}`}
                  onClick={() => {
                    setTab(id);
                    setQuery("");
                    setDraftExpanded(true);
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>
            <input
              aria-label="بحث"
              placeholder={
                tab === "tables" ? "ابحث عن طاولة أو منطقة" : "ابحث عن صنف"
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-12 w-full rounded-xl border p-3"
            />
            {!data && <p>اتصل بالإنترنت لتحميل المنيو والطاولات لأول مرة.</p>}
            {tab === "tables" ? (
              <div className="grid grid-cols-2 gap-3">
                {sortTablesByNumber(data?.tables || [])
                  .filter((t) => `${t.name} ${t.area}`.includes(query))
                  .map((t) => (
                    <button
                      key={t.id}
                      className={`${button} text-start`}
                      onClick={() => select(t.id)}
                    >
                      <strong className="block text-xl">طاولة {t.name}</strong>
                      <span className="block text-sm">
                        {t.area} · {t.currentOrderId ? "مشغولة" : "متاحة"}
                      </span>
                    </button>
                  ))}
              </div>
            ) : (
              <>
                {table && (
                  <button
                    className={button}
                    onClick={() => {
                      setTab("tables");
                      setQuery("");
                    }}
                  >
                    تغيير الطاولة · {table.name}
                  </button>
                )}
                {order && (
                  <details className="rounded-xl bg-app-surface p-3">
                    <summary className="cursor-pointer py-2">
                      الأصناف المرسلة على الطاولة
                    </summary>
                    {order.items.map((i, n) => (
                      <p key={n} className="border-b py-2">
                        {i.quantity} × {i.name} {i.notes && ` · ${i.notes}`}
                      </p>
                    ))}
                  </details>
                )}
                <div className="flex gap-2 overflow-x-auto pb-2">
                  <button className={button} onClick={() => setCategory("")}>
                    الكل
                  </button>
                  {[...(data?.categories || [])]
                    .sort((a, b) => a.order - b.order)
                    .map((c) => (
                      <button
                        aria-pressed={category === c.id}
                        className={`${button} shrink-0`}
                        key={c.id}
                        onClick={() => setCategory(c.id)}
                      >
                        {c.name}
                      </button>
                    ))}
                </div>
                <div className="grid gap-2">
                  {[...(data?.items || [])]
                    .filter(
                      (i) =>
                        i.isAvailable &&
                        data?.categories.some((c) => c.id === i.categoryId) &&
                        (!category || i.categoryId === category) &&
                        i.name.includes(query),
                    )
                    .sort((a, b) => a.order - b.order)
                    .map((i) => (
                      <div
                        key={i.id}
                        className="flex min-w-0 flex-wrap items-center gap-1 rounded-xl border border-app-border bg-app-surface p-1"
                      >
                        <button
                          type="button"
                          aria-label={`إضافة ${i.name}`}
                          className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-3 py-2 text-start font-semibold"
                          onClick={() => add(i.id)}
                        >
                          <span className="min-w-0 break-words">{i.name}</span>
                          <span aria-hidden className="text-xl">
                            ＋
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center gap-1">
                          {[2, 4].map((quantity) => (
                            <button
                              key={quantity}
                              type="button"
                              aria-label={`إضافة ${quantity} من ${i.name}`}
                              title={`إضافة ${quantity} من ${i.name}`}
                              className="grid h-11 w-11 place-items-center rounded-lg border border-app-border text-sm font-semibold"
                              onClick={() => add(i.id, false, quantity)}
                            >
                              {quantity}
                            </button>
                          ))}
                          <button
                            type="button"
                            aria-label={`إضافة ${i.name} مع ملاحظة`}
                            title="إضافة مع ملاحظة"
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-app-primary-soft text-app-primary"
                            onClick={() => add(i.id, true)}
                          >
                            <MessageSquarePlus
                              aria-hidden="true"
                              className="h-5 w-5"
                            />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </>
            )}
            {saved.batches.length > 0 && (
              <section className="space-y-2">
                <h2 className="font-bold">الطلبات</h2>
                {saved.batches
                  .slice()
                  .reverse()
                  .map((b) => (
                    <article
                      key={b.operationId}
                      className="rounded-xl border bg-app-surface p-3"
                    >
                      <p>
                        طاولة{" "}
                        {data?.tables.find((t) => t.id === b.tableId)?.name ||
                          b.tableId}{" "}
                        ·{" "}
                        {b.status === "sent"
                          ? "تم الإرسال"
                          : b.status === "review"
                            ? "تحتاج مراجعة"
                            : sending
                              ? "جارٍ الإرسال"
                              : "بانتظار الاتصال"}
                      </p>
                      <p className="text-sm">
                        {b.items
                          .map((i) => `${i.quantity} × ${i.name}`)
                          .join("، ")}
                      </p>
                      {b.orderNote && (
                        <p className="whitespace-pre-wrap break-words text-sm">
                          ملاحظة للطلب: {b.orderNote}
                        </p>
                      )}
                      {b.error && <p role="alert">{b.error}</p>}
                      {b.status === "review" && (
                        <button
                          className={button}
                          onClick={() => {
                            if (
                              (saved.drafts[b.tableId] || []).length ||
                              (saved.orderNotes[b.tableId] || "").trim()
                            ) {
                              setMessage("أرسل المسودة الحالية أولاً");
                              return;
                            }
                            try {
                              store({
                                ...savedRef.current,
                                drafts: {
                                  ...savedRef.current.drafts,
                                  [b.tableId]: restoreDraft(b.items),
                                },
                                orderNotes: {
                                  ...savedRef.current.orderNotes,
                                  [b.tableId]: b.orderNote || "",
                                },
                                batches: savedRef.current.batches.filter(
                                  (x) => x.operationId !== b.operationId,
                                ),
                              });
                              select(b.tableId);
                              setDraftExpanded(true);
                            } catch {}
                          }}
                        >
                          استعادة كمسودة للمراجعة
                        </button>
                      )}
                    </article>
                  ))}
              </section>
            )}
            {tab === "menu" && table && draft.length > 0 && (
              <DraftPanel
                orderNote={saved.orderNotes[tableId] || ""}
                onOrderNoteChange={changeOrderNote}
                tableName={table.name}
                lines={draft}
                expanded={draftExpanded}
                reveal={draftReveal}
                onToggle={() => setDraftExpanded((value) => !value)}
                onChange={updateLine}
                onRemove={(localId) =>
                  change(
                    (savedRef.current.drafts[tableId] || []).filter(
                      (line) => line.localId !== localId,
                    ),
                  )
                }
                onDuplicate={duplicateLine}
                onSend={submit}
                onHeight={setDraftHeight}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}
