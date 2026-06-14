import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../api";
import { useStore } from "../../store";

// epoch seconds <-> datetime-local string
function toLocal(epoch: number | null): string {
  if (!epoch) return "";
  const d = new Date(epoch * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toEpoch(local: string): number | null {
  if (!local) return null;
  return Math.floor(new Date(local).getTime() / 1000);
}

export default function Settings() {
  const { refresh } = useStore();
  const [form, setForm] = useState<any>(null);
  const [msg, setMsg] = useState("");

  useQuery({
    queryKey: ["admin-config"],
    queryFn: async () => {
      const cfg = await api.get<any>("/admin/config");
      setForm(cfg);
      return cfg;
    },
  });

  if (!form) return <p className="text-slate-500">Loading…</p>;

  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  const save = async () => {
    setMsg("");
    await api.patch("/admin/config", {
      ctf_name: form.ctf_name,
      ctf_description: form.ctf_description,
      mode: form.mode,
      team_size_limit: Number(form.team_size_limit) || 0,
      registration_open: !!form.registration_open,
      visibility: form.visibility,
      scoreboard_visible: !!form.scoreboard_visible,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      freeze_time: form.freeze_time || null,
      paused: !!form.paused,
      block_vpn: !!form.block_vpn,
      allow_name_change: !!form.allow_name_change,
      log_challenge_views: !!form.log_challenge_views,
      email_enabled: !!form.email_enabled,
      email_from: form.email_from || "",
      email_from_name: form.email_from_name || "",
      email_on_register: !!form.email_on_register,
      require_email_verification: !!form.require_email_verification,
    });
    await refresh();
    setMsg("Settings saved.");
  };

  const sendTest = async () => {
    setMsg("");
    try { await api.post("/admin/email/test", {}); setMsg("Test email sent ✓"); }
    catch (e) { setMsg(e instanceof ApiError ? `Email failed: ${e.message}` : "Email failed"); }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-white">Settings</h1>
      {msg && <div className="mb-4 rounded-md border border-emerald-700 bg-emerald-950/40 p-3 text-sm text-emerald-300">{msg}</div>}

      <div className="space-y-6">
        <div className="card space-y-4">
          <h2 className="font-semibold text-white">General</h2>
          <div><label className="label">CTF name</label><input className="input" value={form.ctf_name} onChange={(e) => set("ctf_name", e.target.value)} /></div>
          <div><label className="label">Description</label><textarea className="input" rows={2} value={form.ctf_description} onChange={(e) => set("ctf_description", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Mode</label>
              <select className="input" value={form.mode} onChange={(e) => set("mode", e.target.value)}>
                <option value="teams">Teams</option>
                <option value="users">Individuals</option>
              </select>
            </div>
            <div><label className="label">Team size limit (0=∞)</label><input className="input" type="number" value={form.team_size_limit} onChange={(e) => set("team_size_limit", e.target.value)} /></div>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold text-white">Access</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Visibility</label>
              <select className="input" value={form.visibility} onChange={(e) => set("visibility", e.target.value)}>
                <option value="private">Private (login required)</option>
                <option value="public">Public</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={!!form.registration_open} onChange={(e) => set("registration_open", e.target.checked)} /> Registration open
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={!!form.scoreboard_visible} onChange={(e) => set("scoreboard_visible", e.target.checked)} /> Scoreboard visible to players
          </label>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold text-white">Timing</h2>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="label">Start</label><input className="input" type="datetime-local" value={toLocal(form.start_time)} onChange={(e) => set("start_time", toEpoch(e.target.value))} /></div>
            <div><label className="label">End</label><input className="input" type="datetime-local" value={toLocal(form.end_time)} onChange={(e) => set("end_time", toEpoch(e.target.value))} /></div>
            <div><label className="label">Freeze scoreboard</label><input className="input" type="datetime-local" value={toLocal(form.freeze_time)} onChange={(e) => set("freeze_time", toEpoch(e.target.value))} /></div>
          </div>
          <p className="text-xs text-slate-500">Leave blank for no limit. Times use your local timezone.</p>
        </div>

        <div className="card space-y-3">
          <h2 className="font-semibold text-white">Behaviour</h2>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={!!form.paused} onChange={(e) => set("paused", e.target.checked)} /> Pause submissions (competition lockdown)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={!!form.block_vpn} onChange={(e) => set("block_vpn", e.target.checked)} /> Block submissions from detected VPN/proxy networks
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={!!form.allow_name_change} onChange={(e) => set("allow_name_change", e.target.checked)} /> Allow users to change their display name
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={!!form.log_challenge_views} onChange={(e) => set("log_challenge_views", e.target.checked)} /> Log challenge views
          </label>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold text-white">Email (Cloudflare Email Sending)</h2>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={!!form.email_enabled} onChange={(e) => set("email_enabled", e.target.checked)} /> Enable email sending
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">From address</label><input className="input mono" value={form.email_from || ""} onChange={(e) => set("email_from", e.target.value)} placeholder="ctf@yourdomain.com" /></div>
            <div><label className="label">From name</label><input className="input" value={form.email_from_name || ""} onChange={(e) => set("email_from_name", e.target.value)} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={!!form.email_on_register} onChange={(e) => set("email_on_register", e.target.checked)} /> Send a welcome email on registration
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={!!form.require_email_verification} onChange={(e) => set("require_email_verification", e.target.checked)} /> Require email verification before submitting flags
          </label>
          <div className="flex items-center gap-3">
            <button className="btn-ghost" type="button" onClick={sendTest}>Send test email to myself</button>
            <span className="text-xs text-slate-500">Requires an onboarded domain: <code className="mono">wrangler email sending enable yourdomain.com</code></span>
          </div>
        </div>

        <button className="btn-primary" onClick={save}>Save settings</button>
      </div>
    </div>
  );
}
