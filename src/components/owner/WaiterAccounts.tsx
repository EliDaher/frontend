"use client";
import { useEffect, useState } from "react";
import { adminRequest } from "@/lib/api";
import { OpsShell, useOpsPage } from "./ops/OpsShared";
type Account = {
  id: string;
  name: string;
  username: string;
  isActive: boolean;
};
export function WaiterAccounts() {
  const state = useOpsPage("tables");
  const [accounts, setAccounts] = useState<Account[]>([]),
    [name, setName] = useState(""),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  const button =
    "min-h-12 rounded-xl border border-app-border bg-app-surface px-4 py-3 disabled:opacity-50";
  async function load() {
    if (state.token)
      setAccounts(
        await adminRequest<Account[]>("/api/owner/waiters", state.token),
      );
  }
  useEffect(() => {
    void load().catch((e) => state.setMessage(e.message));
  }, [state.token]);
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    state.setMessage("");
    try {
      await work();
      await load();
    } catch (e) {
      state.setMessage(e instanceof Error ? e.message : "تعذر حفظ الحساب");
    } finally {
      setBusy(false);
    }
  }
  return (
    <OpsShell
      title="حسابات النوّادل"
      eyebrow="الدخول والصلاحيات"
      module="tables"
      state={state}
      onRefresh={() => void load()}
    >
      {state.restaurant && (
        <div className="mb-4 rounded-xl border p-4">
          <p>رابط دخول النوّادل</p>
          <a
            className="break-all text-app-primary underline"
            href={`/waiter/${state.restaurant.slug}`}
          >
            {typeof window !== "undefined" ? window.location.origin : ""}
            /waiter/{state.restaurant.slug}
          </a>
          <p className="mt-2">
            يشاهد النادل الطاولات والمنيو دون أسعار، ويضيف أصنافاً فقط.
          </p>
        </div>
      )}
      <form
        className="mb-5 grid gap-3 rounded-xl border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void action(async () => {
            await adminRequest("/api/owner/waiters", state.token, {
              method: "POST",
              body: JSON.stringify({ name, username, password }),
            });
            setName("");
            setUsername("");
            setPassword("");
          });
        }}
      >
        <h2 className="font-bold">إنشاء حساب نادل</h2>
        <label>
          اسم النادل
          <input
            required
            maxLength={80}
            className="block min-h-12 w-full rounded-lg border p-3"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          اسم المستخدم (أحرف إنجليزية أو أرقام)
          <input
            required
            pattern="[a-zA-Z0-9_.\-]{3,40}"
            dir="ltr"
            autoComplete="off"
            className="block min-h-12 w-full rounded-lg border p-3"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          كلمة المرور (8 أحرف على الأقل)
          <input
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            className="block min-h-12 w-full rounded-lg border p-3"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button disabled={busy} className={button}>
          إنشاء الحساب
        </button>
      </form>
      <div className="grid gap-3">
        {accounts.map((a) => (
          <AccountEditor
            key={a.id}
            account={a}
            busy={busy}
            save={(patch) =>
              action(() =>
                adminRequest(`/api/owner/waiters/${a.id}`, state.token, {
                  method: "PATCH",
                  body: JSON.stringify(patch),
                }),
              )
            }
          />
        ))}
      </div>
    </OpsShell>
  );
}
function AccountEditor({
  account: a,
  busy,
  save,
}: {
  account: Account;
  busy: boolean;
  save: (patch: object) => Promise<void>;
}) {
  const [name, setName] = useState(a.name),
    [password, setPassword] = useState("");
  return (
    <form
      className="grid gap-3 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save({ name, ...(password ? { password } : {}) }).then(() =>
          setPassword(""),
        );
      }}
    >
      <p>
        {a.username} · {a.isActive ? "نشط" : "معطّل"}
      </p>
      <label>
        الاسم
        <input
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="block min-h-12 w-full rounded-lg border p-3"
        />
      </label>
      <label>
        كلمة مرور جديدة (اختياري)
        <input
          type="password"
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="block min-h-12 w-full rounded-lg border p-3"
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} className="min-h-12 rounded-lg border px-4">
          حفظ التعديلات
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save({ isActive: !a.isActive })}
          className="min-h-12 rounded-lg border px-4"
        >
          {a.isActive ? "تعطيل الحساب" : "تفعيل الحساب"}
        </button>
      </div>
    </form>
  );
}
