import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { useStore } from "../store";
import { COUNTRIES } from "../countries";

interface Token {
  id: number;
  name: string;
  prefix: string;
  last_used: number | null;
  created_at: number;
}

export default function Profile() {
  const { user, refresh } = useStore();
  const [form, setForm] = useState({ name: user!.name, affiliation: "", country: "", website: "", password: "" });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(""); setErr("");
    const payload: any = {};
    if (form.name && form.name !== user!.name) payload.name = form.name;
    for (const k of ["affiliation", "country", "website", "password"]) if ((form as any)[k]) payload[k] = (form as any)[k];
    try {
      await api.patch("/auth/me", payload);
      await refresh();
      setMsg("Profile updated.");
      setForm({ ...form, password: "" });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-white">Profile</h1>
      <div className="card space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-slate-400">Email</span><span className="text-white">{user!.email}</span></div>
        <div className="flex justify-between"><span className="text-slate-400">Role</span><span className="text-white">{user!.role}</span></div>
      </div>

      {msg && <div className="rounded-md border border-emerald-700 bg-emerald-950/40 p-3 text-sm text-emerald-300">{msg}</div>}
      {err && <div className="rounded-md border border-rose-700 bg-rose-950/50 p-3 text-sm text-rose-300">{err}</div>}

      <form onSubmit={save} className="card space-y-4">
        <h2 className="font-semibold text-white">Update details</h2>
        <div>
          <label className="label">Display name</label>
          <input className="input" value={form.name} onChange={set("name")} />
        </div>
        <div><label className="label">Affiliation</label><input className="input" value={form.affiliation} onChange={set("affiliation")} /></div>
        <div>
          <label className="label">Country</label>
          <select className="input" value={form.country} onChange={set("country")}>
            <option value="">— select —</option>
            {COUNTRIES.map((cn) => <option key={cn} value={cn}>{cn}</option>)}
          </select>
        </div>
        <div><label className="label">Website</label><input className="input" value={form.website} onChange={set("website")} /></div>
        <div><label className="label">New password</label><input className="input" type="password" value={form.password} onChange={set("password")} placeholder="leave blank to keep" /></div>
        <button className="btn-primary w-full">Save</button>
      </form>

      <ApiTokens />
      <MySubmissions />
    </div>
  );
}

function MySubmissions() {
  const { data } = useQuery({
    queryKey: ["my-submissions"],
    queryFn: () => api.get<{ submissions: any[] }>("/me/submissions"),
  });
  return (
    <div className="card">
      <h2 className="mb-3 font-semibold text-white">My submissions</h2>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">Time</th><th className="py-1">Challenge</th><th className="py-1">Flag</th><th className="py-1">Result</th>
            </tr>
          </thead>
          <tbody>
            {data?.submissions.map((s) => (
              <tr key={s.id} className="border-t border-slate-900">
                <td className="py-1.5 mono text-xs text-slate-500 whitespace-nowrap">{new Date(s.created_at * 1000).toLocaleString()}</td>
                <td className="py-1.5 text-slate-300">{s.challenge}</td>
                <td className="py-1.5 mono text-xs text-slate-400 max-w-[160px] truncate">{s.provided}</td>
                <td className="py-1.5">{s.correct ? <span className="text-emerald-400">✓</span> : <span className="text-rose-400">✗</span>}</td>
              </tr>
            ))}
            {!data?.submissions.length && <tr><td colSpan={4} className="py-4 text-center text-slate-500">No submissions yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ApiTokens() {
  const { data, refetch } = useQuery({
    queryKey: ["api-tokens"],
    queryFn: () => api.get<{ tokens: Token[] }>("/auth/tokens"),
  });
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);

  const create = async () => {
    const r = await api.post<{ token: string }>("/auth/tokens", { name: name || "API token" });
    setCreated(r.token);
    setName("");
    refetch();
  };
  const remove = async (id: number) => {
    if (!confirm("Revoke this token?")) return;
    await api.del(`/auth/tokens/${id}`);
    refetch();
  };

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold text-white">API tokens</h2>
        <p className="text-sm text-slate-400">Use a token as <code className="mono">Authorization: Bearer &lt;token&gt;</code> to call the API programmatically (challenges, submit, scoreboard).</p>
      </div>

      {created && (
        <div className="rounded-md border border-emerald-700 bg-emerald-950/40 p-3 text-sm">
          <p className="mb-1 text-emerald-300">Copy your token now — it won't be shown again:</p>
          <code className="mono break-all text-emerald-400">{created}</code>
        </div>
      )}

      <div className="flex gap-2">
        <input className="input" placeholder="Token name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary" onClick={create}>Generate</button>
      </div>

      <div className="space-y-1">
        {data?.tokens.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm">
            <span>
              <span className="text-slate-200">{t.name}</span>{" "}
              <code className="mono text-xs text-slate-500">{t.prefix}…</code>{" "}
              <span className="text-xs text-slate-600">{t.last_used ? `last used ${new Date(t.last_used * 1000).toLocaleDateString()}` : "never used"}</span>
            </span>
            <button className="text-rose-400 hover:text-rose-300" onClick={() => remove(t.id)}>Revoke</button>
          </div>
        ))}
        {!data?.tokens.length && <p className="text-xs text-slate-500">No tokens yet.</p>}
      </div>
    </div>
  );
}
