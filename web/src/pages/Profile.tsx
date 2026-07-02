import { useState, type ChangeEvent, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { useStore } from "../store";
import { COUNTRIES } from "../countries";
import { StatsChartGrid } from "../components/StatsCharts";
import type { ProfileStats, ReviewCaseSummary } from "../types";

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
  const stats = useQuery({
    queryKey: ["profile-stats", "user", user!.id],
    enabled: user!.role === "user",
    queryFn: () => api.get<{ stats: ProfileStats }>(`/profile/user/${user!.id}`),
  });

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

      {stats.data?.stats && <StatsChartGrid stats={stats.data.stats} />}

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

      <MyReviewCases />
      <MySubmissions />
    </div>
  );
}

function MyReviewCases() {
  const queryClient = useQueryClient();
  const [proof, setProof] = useState<Record<number, string>>({});
  const [files, setFiles] = useState<Record<number, File | null>>({});
  const [appeal, setAppeal] = useState({ review_case_id: "", reason: "" });
  const [msg, setMsg] = useState("");
  const cases = useQuery({
    queryKey: ["my-review-cases"],
    queryFn: () => api.get<{ cases: ReviewCaseSummary[] }>("/me/review-cases"),
  });
  const appeals = useQuery({
    queryKey: ["my-appeals"],
    queryFn: () => api.get<{ appeals: any[] }>("/me/appeals"),
  });
  const submitProof = async (id: number) => {
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("proof", proof[id] || "");
      if (files[id]) fd.append("attachment", files[id]!);
      await api.post(`/me/review-cases/${id}/proof`, fd);
      setProof({ ...proof, [id]: "" });
      setFiles({ ...files, [id]: null });
      setMsg("Proof submitted for admin review.");
      await Promise.all([
        cases.refetch(),
        queryClient.invalidateQueries({ queryKey: ["my-review-case-alerts"] }),
      ]);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Proof submission failed");
    }
  };
  const submitAppeal = async () => {
    setMsg("");
    try {
      await api.post("/me/appeals", {
        review_case_id: appeal.review_case_id ? Number(appeal.review_case_id) : null,
        target_type: appeal.review_case_id ? "review_case" : "account",
        reason: appeal.reason,
      });
      setAppeal({ review_case_id: "", reason: "" });
      setMsg("Appeal submitted.");
      appeals.refetch();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Appeal failed");
    }
  };

  const visibleCases = cases.data?.cases ?? [];
  return (
    <section id="review-proof" className="card scroll-mt-24 space-y-5">
      <div>
        <h2 className="text-base">Review and proof</h2>
        <p className="mt-1 text-sm text-slate-500">Proof requests and appeals are reviewed by admins. Automated signals do not permanently ban accounts.</p>
      </div>
      {msg && <div className="rounded-md border border-slate-700 bg-slate-900 p-2 text-sm text-slate-300">{msg}</div>}
      <div className="space-y-3">
        {visibleCases.map((c) => (
          <div key={c.id} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-white">{c.challenge_name || `Case #${c.id}`}</div>
                <div className="text-xs text-slate-500">risk {c.risk_score} · {c.status} · proof {c.proof_state}</div>
              </div>
              <span className="mono text-xs text-slate-500">{new Date(c.created_at * 1000).toLocaleString()}</span>
            </div>
            <p className="mt-2 text-sm text-slate-400">{c.reason}</p>
            {c.resolution && <p className="mt-2 text-sm text-emerald-300">{c.resolution}</p>}
            {(c.proof_state === "requested" || c.proof_state === "rejected") && (
              <div className="mt-3 space-y-2">
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Explain your solve, include exploit script notes, logs, or links."
                  value={proof[c.id] || ""}
                  onChange={(e) => setProof({ ...proof, [c.id]: e.target.value })}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <input className="input" type="file" onChange={(e) => setFiles({ ...files, [c.id]: e.target.files?.[0] || null })} />
                  <button className="btn-primary text-xs" onClick={() => submitProof(c.id)} disabled={!(proof[c.id] || files[c.id])}>Submit proof</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {!visibleCases.length && <p className="text-sm text-slate-500">No review cases for your account or team.</p>}
      </div>

      <div className="border-t border-[var(--border)] pt-4">
        <h3 className="mb-2 text-sm font-semibold text-white">Appeal</h3>
        <div className="grid gap-2">
          <select className="input" value={appeal.review_case_id} onChange={(e) => setAppeal({ ...appeal, review_case_id: e.target.value })}>
            <option value="">Account or enforcement action</option>
            {visibleCases.map((c) => <option key={c.id} value={c.id}>Case #{c.id}: {c.challenge_name || c.reason}</option>)}
          </select>
          <textarea className="input" rows={3} value={appeal.reason} onChange={(e) => setAppeal({ ...appeal, reason: e.target.value })} placeholder="Appeal reason" />
          <button className="btn-ghost w-fit" onClick={submitAppeal} disabled={!appeal.reason.trim()}>Submit appeal</button>
        </div>
        {!!appeals.data?.appeals?.length && (
          <div className="mt-3 space-y-1 text-xs text-slate-500">
            {appeals.data.appeals.map((a: any) => (
              <div key={a.id} className="flex justify-between border-t border-[var(--border-soft)] pt-1">
                <span>{a.target_type} · {a.status}</span>
                <span className="mono">{new Date(a.created_at * 1000).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
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
