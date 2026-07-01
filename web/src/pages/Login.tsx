import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { useStore } from "../store";

export default function Login() {
  const { refresh, config } = useStore();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await api.post("/auth/login", form);
      await refresh();
      navigate("/challenges");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md page-stack">
      <section className="page-header">
        <div>
          <div className="page-kicker">Account</div>
          <h1 className="page-title">Log in</h1>
        </div>
      </section>
      {err && <div className="mb-4 rounded-md border border-rose-700 bg-rose-950/50 p-3 text-sm text-rose-300">{err}</div>}
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="label">Email or username</label>
          <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Logging in" : "Log in"}</button>
      </form>
      {config.registration_open && !config.site_lockdown && (
        <p className="text-center text-sm text-slate-400">
          No account? <Link to="/register" className="text-[var(--accent-strong)] hover:underline">Register</Link>
        </p>
      )}
    </div>
  );
}
