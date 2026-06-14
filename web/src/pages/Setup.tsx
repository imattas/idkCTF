import { useState } from "react";
import { api, ApiError } from "../api";
import { useStore } from "../store";

export default function Setup() {
  const { refresh } = useStore();
  const [form, setForm] = useState({
    ctf_name: "CloudCTF",
    ctf_description: "",
    mode: "teams",
    visibility: "private",
    admin_name: "",
    admin_email: "",
    admin_password: "",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await api.post("/setup", form);
      await refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-1 text-3xl font-bold text-white">
        <span className="text-sky-400 mono">{">_"}</span> Set up your CTF
      </h1>
      <p className="mb-8 text-slate-400">First-run configuration. You can change all of this later in Admin.</p>

      {err && <div className="mb-4 rounded-md border border-rose-700 bg-rose-950/50 p-3 text-sm text-rose-300">{err}</div>}

      <form onSubmit={submit} className="space-y-6">
        <div className="card space-y-4">
          <h2 className="font-semibold text-white">Competition</h2>
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.ctf_name} onChange={set("ctf_name")} required />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={2} value={form.ctf_description} onChange={set("ctf_description")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Mode</label>
              <select className="input" value={form.mode} onChange={set("mode")}>
                <option value="teams">Teams</option>
                <option value="users">Individuals</option>
              </select>
            </div>
            <div>
              <label className="label">Visibility</label>
              <select className="input" value={form.visibility} onChange={set("visibility")}>
                <option value="private">Private (login required)</option>
                <option value="public">Public</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold text-white">Admin account</h2>
          <div>
            <label className="label">Username</label>
            <input className="input" value={form.admin_name} onChange={set("admin_name")} required />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.admin_email} onChange={set("admin_email")} required />
          </div>
          <div>
            <label className="label">Password (min 8 chars)</label>
            <input className="input" type="password" value={form.admin_password} onChange={set("admin_password")} required />
          </div>
        </div>

        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Setting up…" : "Create CTF"}
        </button>
      </form>
    </div>
  );
}
