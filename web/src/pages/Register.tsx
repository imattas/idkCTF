import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { useStore } from "../store";
import type { Bracket } from "../types";
import { COUNTRIES } from "../countries";

export default function Register() {
  const { refresh, config } = useStore();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", affiliation: "", country: "", bracket_id: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: brk } = useQuery({ queryKey: ["brackets"], queryFn: () => api.get<{ brackets: Bracket[] }>("/brackets") });
  const userBrackets = (brk?.brackets ?? []).filter((b) => b.type === "users");

  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await api.post("/auth/register", { ...form, bracket_id: form.bracket_id ? Number(form.bracket_id) : null });
      await refresh();
      navigate("/challenges");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-bold text-white">Register</h1>
      {err && <div className="mb-4 rounded-md border border-rose-700 bg-rose-950/50 p-3 text-sm text-rose-300">{err}</div>}
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="label">Username</label>
          <input className="input" value={form.name} onChange={set("name")} required />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={form.email} onChange={set("email")} required />
        </div>
        <div>
          <label className="label">Password (min 8)</label>
          <input className="input" type="password" value={form.password} onChange={set("password")} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Affiliation</label>
            <input className="input" value={form.affiliation} onChange={set("affiliation")} />
          </div>
          <div>
            <label className="label">Country</label>
            <select className="input" value={form.country} onChange={set("country")}>
              <option value="">— select —</option>
              {COUNTRIES.map((cn) => <option key={cn} value={cn}>{cn}</option>)}
            </select>
          </div>
        </div>
        {config.mode === "users" && userBrackets.length > 0 && (
          <div>
            <label className="label">Which division / scoreboard do you belong to?{userBrackets.length > 1 ? " *" : ""}</label>
            <select className="input" value={form.bracket_id} onChange={set("bracket_id")} required={userBrackets.length > 1}>
              <option value="">{userBrackets.length > 1 ? "— select your division —" : "— none —"}</option>
              {userBrackets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "…" : "Create account"}</button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-400">
        Already registered? <Link to="/login" className="text-sky-400 hover:underline">Log in</Link>
      </p>
    </div>
  );
}
