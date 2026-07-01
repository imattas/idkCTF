import { useState, type ChangeEvent, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { useStore } from "../store";
import { COUNTRIES } from "../countries";

interface Submission {
  id: number;
  challenge: string;
  provided: string;
  correct: number;
  created_at: number;
}

export default function Profile() {
  const { user, refresh } = useStore();
  const [form, setForm] = useState({
    name: user!.name,
    affiliation: user!.affiliation ?? "",
    country: user!.country ?? "",
    website: user!.website ?? "",
    password: "",
  });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    setErr("");
    const payload: Record<string, string | null> = {};
    if (form.name && form.name !== user!.name) payload.name = form.name;
    for (const key of ["affiliation", "country", "website"] as const) {
      const oldValue = user![key] ?? "";
      if (form[key] !== oldValue) payload[key] = form[key] || null;
    }
    if (form.password) payload.password = form.password;
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
    <div className="mx-auto max-w-3xl page-stack">
      <section className="page-header">
        <div>
          <div className="page-kicker">Account</div>
          <h1 className="page-title">{user!.name}</h1>
          <p className="page-subtitle">{user!.email}</p>
        </div>
        <span className="badge badge-accent">{user!.role}</span>
      </section>

      {msg && <div className="rounded-md border border-emerald-700 bg-emerald-950/40 p-3 text-sm text-emerald-300">{msg}</div>}
      {err && <div className="rounded-md border border-rose-700 bg-rose-950/40 p-3 text-sm text-rose-300">{err}</div>}

      <form onSubmit={save} className="card space-y-4">
        <h2 className="text-base">Profile details</h2>
        <div>
          <label className="label">Display name</label>
          <input className="input" value={form.name} onChange={set("name")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Affiliation</label>
            <input className="input" value={form.affiliation} onChange={set("affiliation")} />
          </div>
          <div>
            <label className="label">Country</label>
            <select className="input" value={form.country} onChange={set("country")}>
              <option value="">Select country</option>
              {COUNTRIES.map((cn) => <option key={cn} value={cn}>{cn}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Website</label>
          <input className="input" value={form.website} onChange={set("website")} placeholder="https://example.com" />
        </div>
        <div>
          <label className="label">New password</label>
          <input className="input" type="password" value={form.password} onChange={set("password")} placeholder="Leave blank to keep current password" />
        </div>
        <button className="btn-primary w-full sm:w-auto">Save profile</button>
      </form>

      <MySubmissions />
    </div>
  );
}

function MySubmissions() {
  const { data } = useQuery({
    queryKey: ["my-submissions"],
    queryFn: () => api.get<{ submissions: Submission[] }>("/me/submissions"),
  });

  return (
    <section className="card">
      <h2 className="mb-3 text-base">Recent submissions</h2>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-2">Time</th>
              <th className="py-2">Challenge</th>
              <th className="py-2">Flag</th>
              <th className="py-2 text-right">Result</th>
            </tr>
          </thead>
          <tbody>
            {data?.submissions.map((s) => (
              <tr key={s.id} className="border-t border-[var(--border)]">
                <td className="whitespace-nowrap py-2 pr-3 text-xs text-slate-500 mono">{new Date(s.created_at * 1000).toLocaleString()}</td>
                <td className="py-2 pr-3 text-slate-300">{s.challenge}</td>
                <td className="max-w-[160px] truncate py-2 pr-3 text-xs text-slate-400 mono">{s.provided}</td>
                <td className="py-2 text-right">{s.correct ? <span className="text-emerald-300">Correct</span> : <span className="text-rose-300">Wrong</span>}</td>
              </tr>
            ))}
            {!data?.submissions.length && <tr><td colSpan={4} className="py-4 text-center text-slate-500">No submissions yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
