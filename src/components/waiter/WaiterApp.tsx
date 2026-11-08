"use client";
import { LoaderCircle, MessageSquarePlus, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { adminRequest } from "@/lib/api";
import { ApiError } from "@/lib/api-errors";
import { tokenExpirationMs } from "@/offline/auth-session";
import { waiterMenuCache } from "./menu-cache";
import { PendingBatchSender, type WaiterBatch as Batch } from "./submission";
import { applyConfirmation, bindSubmissionRecovery, WaiterDataClient, type WaiterMenu, type WaiterState, type WaiterSession, type BatchConfirmation } from "./data-client";
import { sortTablesByNumber } from "@/lib/table-number";
import { DraftPanel, type DraftReveal } from "./DraftPanel";
import {
  addDraftQuantity,
  addDraftItemWithNote,
  duplicateDraftLine,
  draftToOrderLines,
  restoreDraft,
  type DraftLine,
} from "./draft";
type Session = WaiterSession;
type Saved = {
  drafts: Record<string, DraftLine[]>;
  orderNotes: Record<string, string>;
  batches: Batch[];
  data?: WaiterState;
  lastRefreshAt?: string;
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
  const [menu, setMenu] = useState<WaiterMenu | null>(null);
  const [menuError, setMenuError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [menuLoading, setMenuLoading] = useState(false);
  const [online, setOnline] = useState(true);
  const initializedSession = useRef("");
  const sessionSlug = useRef(slug);
  const clientRef = useRef<WaiterDataClient | null>(null);
  if (!clientRef.current) clientRef.current = new WaiterDataClient(waiterMenuCache, adminRequest, () => {
    setMenuError("تعذر حفظ المنيو على الجهاز؛ سيبقى متاحاً حتى إغلاق الصفحة.");
  });
  const client = clientRef.current;
  const senderRef = useRef<PendingBatchSender | null>(null);
  if (!senderRef.current) senderRef.current = new PendingBatchSender((token, body) =>
    adminRequest<BatchConfirmation>("/api/waiter/batches", token, { method: "POST", body: JSON.stringify(body) }));
  const sender = senderRef.current;
  const [draftHeight, setDraftHeight] = useState(0);
  const [draftReveal, setDraftReveal] = useState<DraftReveal | null>(null);
  const revealSequence = useRef(0);
  const savedRef = useRef(saved),
    sessionRef = useRef(session);
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
    if (!s.cacheSessionId) s = { ...s, cacheSessionId: crypto.randomUUID() };
    if (sessionRef.current && sessionRef.current.cacheSessionId !== s.cacheSessionId)
      void client.invalidate(sessionRef.current).catch(() => {});
    if (tokenExpirationMs(s.token) && tokenExpirationMs(s.token) <= Date.now()) {
      void client.invalidate(s).catch(() => {});
      localStorage.removeItem(sessionKey(slug));
      setMessage("انتهت الجلسة. سجّل الدخول؛ مسوداتك ودفعاتك محفوظة.");
      return;
    }
    setMenu(null);
    setMenuError("");
    setRefreshError("");
    setTableId("");
    setCategory("");
    setQuery("");
    setTab("tables");
    let next = empty();
    try {
      next = JSON.parse(localStorage.getItem(dataKey(s)) || "null") || empty();
      next.orderNotes ??= {};
      // Migrate the old combined bootstrap cache: never reuse menu across sessions.
      if (next.data) next.data = { tables: next.data.tables, orders: next.data.orders };
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
  function clearSession(storageSlug: string) {
    if (sessionRef.current) void client.invalidate(sessionRef.current).catch(() => {});
    sessionRef.current = null;
    setSending(false);
    savedRef.current = empty();
    initializedSession.current = "";
    setMenu(null);
    setMenuError("");
    setRefreshError("");
    setRefreshing(false);
    setSession(null);
    localStorage.removeItem(sessionKey(storageSlug));
    setSaved(empty());
    setTableId("");
  }
  function logout() { clearSession(slug); }
  useEffect(() => {
    if (sessionSlug.current !== slug) {
      clearSession(sessionSlug.current);
      sessionSlug.current = slug;
    }
    try {
      const raw = localStorage.getItem(sessionKey(slug));
      if (raw) activate(JSON.parse(raw));
    } catch {}
    setReady(true);
  }, [slug]);
  function isCurrent(s: Session) {
    return sessionRef.current?.cacheSessionId === s.cacheSessionId;
  }
  function sessionFailure(s: Session, error: unknown) {
    if (!isCurrent(s)) return;
    if (error instanceof ApiError && error.status === 401) {
      logout();
      setMessage("انتهت الجلسة أو عُطل الحساب. سجّل الدخول؛ الدفعات محفوظة.");
    }
  }
  async function loadMenu(s: Session) {
    setMenuLoading(true);
    setMenuError("");
    try {
      const result = await client.menu(s);
      if (isCurrent(s)) setMenu(result);
    } catch (error) {
      if (isCurrent(s)) setMenuError("تعذر تحميل المنيو. تحقق من الاتصال ثم أعد المحاولة.");
      sessionFailure(s, error);
    } finally { if (isCurrent(s)) setMenuLoading(false); }
  }
  async function refreshTables(s: Session) {
    if (sender.busy(s)) return;
    setRefreshing(true);
    setRefreshError("");
    try {
      const state = await client.refresh(s);
      if (isCurrent(s)) store({ ...savedRef.current, data: state, lastRefreshAt: new Date().toISOString() });
    } catch (error) {
      if (isCurrent(s)) setRefreshError("تعذر تحديث الطاولات. البيانات السابقة محفوظة؛ تحقق من الاتصال وأعد المحاولة.");
      sessionFailure(s, error);
    } finally { if (isCurrent(s)) setRefreshing(false); }
  }
  async function sync() {
    const s = sessionRef.current;
    if (!s) return;
    await sender.send(s, {
      pending: () => savedRef.current.batches,
      current: () => isCurrent(s),
      online: () => navigator.onLine,
      waitForRefresh: () => client.waitForRefresh(s),
      sending: setSending,
      confirmed: (batch, result) => {
        store({
          ...savedRef.current,
          data: applyConfirmation(savedRef.current.data || { tables: [], orders: [] }, batch.tableId, result),
          batches: savedRef.current.batches.map(b => b.operationId === batch.operationId ? { ...b, status: "sent", error: undefined } : b),
        });
        setMessage("تم إرسال الدفعة وتأكيدها من الخادم");
      },
      review: (batch, error) => {
        store({ ...savedRef.current, batches: savedRef.current.batches.map(b => b.operationId === batch.operationId ? { ...b, status: "review", error } : b) });
        setMessage("هناك دفعة تحتاج مراجعة؛ تحقق منها أدناه.");
      },
      failed: setMessage,
      expired: () => {
        logout();
        setMessage("انتهت الجلسة أو عُطل الحساب. سجّل الدخول مجدداً؛ الدفعات محفوظة.");
      },
    });
  }
  useEffect(() => {
    setOnline(navigator.onLine);
    if (!session) return;
    const s = session;
    if (initializedSession.current !== s.cacheSessionId) {
      initializedSession.current = s.cacheSessionId;
      void waiterMenuCache.removeOtherSessions(s).catch(() => {});
      void loadMenu(s);
      void refreshTables(s);
      void sync(); // Restored pending batches only; this never loads data.
    }
    const disconnect = () => setOnline(false);
    const reconnect = () => { setOnline(true); void sync(); };
    const unbind = bindSubmissionRecovery(window, reconnect);
    window.addEventListener("offline", disconnect);
    const expiresAt = tokenExpirationMs(s.token);
    const expiry = expiresAt ? window.setTimeout(() => {
      if (isCurrent(s)) {
        logout();
        setMessage("انتهت الجلسة. سجّل الدخول؛ مسوداتك ودفعاتك محفوظة.");
      }
    }, Math.max(0, expiresAt - Date.now())) : undefined;
    return () => {
      unbind();
      window.removeEventListener("offline", disconnect);
      if (expiry !== undefined) window.clearTimeout(expiry);
    };
  }, [session?.cacheSessionId]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginBusy(true);
    setMessage("");
    try {
      activate(
        { ...await adminRequest<Omit<Session, "cacheSessionId">>("/api/waiter/login", undefined, {
          method: "POST",
          body: JSON.stringify({ slug, username, password }),
        }), cacheSessionId: crypto.randomUUID() },
      );
      setPassword("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "تعذر الدخول");
    } finally {
      setLoginBusy(false);
    }
  }
  const data = { tables: saved.data?.tables || [], orders: saved.data?.orders || [], items: menu?.items || [], categories: menu?.categories || [] },
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
            <section className="space-y-2 rounded-xl border border-app-border bg-app-surface p-3">
              <button type="button" className={`${button} flex w-full items-center justify-center gap-2`}
                disabled={refreshing || sending} aria-busy={refreshing}
                onClick={() => void refreshTables(session)}>
                {refreshing ? <LoaderCircle aria-hidden="true" size={18} className="animate-spin" /> : <RefreshCw aria-hidden="true" size={18} />}
                {refreshing ? "جارٍ تحديث الطاولات…" : "تحديث الطاولات"}
              </button>
              <p className="text-sm text-app-muted">
                {saved.lastRefreshAt ? `آخر تحديث للطاولات: ${new Date(saved.lastRefreshAt).toLocaleString("en-GB")}` : "لم يتم تحديث الطاولات بعد"}
              </p>
              <p className="text-sm text-app-muted">تُحدّث حالة الطاولات يدوياً. اضغط التحديث للاطلاع على آخر التغييرات.</p>
              {!online && <p role="status">أنت غير متصل. المسودات والدفعات محفوظة على الجهاز.</p>}
              {refreshError && <p role="alert">{refreshError}</p>}
              {menuLoading && <p role="status">جارٍ تحميل المنيو…</p>}
              {menuError && <p role="alert">{menuError}</p>}
              {!menu && !menuLoading && <button className={button} onClick={() => void loadMenu(session)}>إعادة محاولة تحميل المنيو</button>}
            </section>
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
                {saved.batches.some(b => b.status === "pending") && (
                  <button type="button" disabled={sending} className={button} onClick={() => void sync()}>
                    {sending ? "جارٍ الإرسال…" : "إعادة إرسال الدفعات المعلّقة"}
                  </button>
                )}
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
                              : "بانتظار الإرسال"}
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
