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

  if (!form) return <p className="text-slate-500">Loading...</p>;

  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  const save = async () => {
    setMsg("");
    await api.patch("/admin/config", {
      ctf_name: form.ctf_name,
      ctf_description: form.ctf_description,
      mode: form.mode,
      team_size_limit: Number(form.team_size_limit) || 0,
      registration_open: !!form.registration_open,
      site_lockdown: !!form.site_lockdown,
      visibility: form.visibility,
      scoreboard_visible: !!form.scoreboard_visible,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      freeze_time: form.freeze_time || null,
      paused: !!form.paused,
      block_vpn: !!form.block_vpn,
      block_vpn_signup: !!form.block_vpn_signup,
      allow_name_change: !!form.allow_name_change,
      log_challenge_views: !!form.log_challenge_views,
      require_access_code: !!form.require_access_code,
      access_code: form.access_code || "",
      auto_review: !!form.auto_review,
      review_fast_solve_seconds: Number(form.review_fast_solve_seconds) || 30,
      anti_abuse_enabled: !!form.anti_abuse_enabled,
      submit_challenge_limit: Number(form.submit_challenge_limit) || 8,
      submit_challenge_window: Number(form.submit_challenge_window) || 60,
      submit_global_limit: Number(form.submit_global_limit) || 30,
      submit_global_window: Number(form.submit_global_window) || 300,
      wrong_flag_cooldown_threshold: Number(form.wrong_flag_cooldown_threshold) || 5,
      wrong_flag_cooldown_seconds: Number(form.wrong_flag_cooldown_seconds) || 120,
      risk_normal_threshold: Number(form.risk_normal_threshold) || 20,
      risk_soft_review_threshold: Number(form.risk_soft_review_threshold) || 40,
      risk_proof_required_threshold: Number(form.risk_proof_required_threshold) || 65,
      risk_high_review_threshold: Number(form.risk_high_review_threshold) || 80,
      proof_threshold: Number(form.proof_threshold) || 65,
      leaderboard_review_enabled: !!form.leaderboard_review_enabled,
      leaderboard_review_threshold: Number(form.leaderboard_review_threshold) || 80,
      checklist_enforced: !!form.checklist_enforced,
      honeypot_enabled: !!form.honeypot_enabled,
      honeypot_secret: form.honeypot_secret || "",
      honeypot_risk_weight: Number(form.honeypot_risk_weight) || 35,
      team_flag_secret: form.team_flag_secret || "",
      email_enabled: !!form.email_enabled,
      email_from: form.email_from || "",
      email_from_name: form.email_from_name || "",
      email_on_register: !!form.email_on_register,
      email_verification_required: !!form.email_verification_required,
    });
    await refresh();
    setMsg("Settings saved.");
  };

  const sendTest = async () => {
    setMsg("");
    try { await api.post("/admin/email/test", {}); setMsg("Test email sent."); }
    catch (e) { setMsg(e instanceof ApiError ? `Email failed: ${e.message}` : "Email failed"); }
  };

  return (
    <div className="max-w-4xl">
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
            <div><label className="label">Team size limit (0 = unlimited)</label><input className="input" type="number" value={form.team_size_limit} onChange={(e) => set("team_size_limit", e.target.value)} /></div>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold text-white">Access</h2>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={!!form.site_lockdown} onChange={(e) => set("site_lockdown", e.target.checked)} /> Site lockdown: only existing accounts can access the platform
          </label>
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
            <input type="checkbox" checked={!!form.registration_open} onChange={(e) => set("registration_open", e.target.checked)} /> Allow public signups
          </label>
          <p className="text-xs text-slate-500">Turn public signups off once the CTF starts to reduce alt-account abuse on attempt-limited challenges. Use Admin &gt; People &gt; Users to create accounts manually while locked down.</p>
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
            <input type="checkbox" checked={!!form.block_vpn_signup} onChange={(e) => set("block_vpn_signup", e.target.checked)} /> Block sign-ups from detected VPN/proxy networks
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={!!form.auto_review} onChange={(e) => set("auto_review", e.target.checked)} /> Auto-flag suspicious solves for review
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            Flag solves faster than
            <input type="number" className="input w-20" value={form.review_fast_solve_seconds ?? 30} onChange={(e) => set("review_fast_solve_seconds", e.target.value)} /> seconds after first view
          </label>
          <div className="border-t border-slate-800 pt-3">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={!!form.require_access_code} onChange={(e) => set("require_access_code", e.target.checked)} /> Require an access code to register
            </label>
            {form.require_access_code && (
              <div className="mt-2"><label className="label">Access code</label><input className="input mono max-w-xs" value={form.access_code || ""} onChange={(e) => set("access_code", e.target.value)} placeholder="share this with allowed players" /></div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={!!form.allow_name_change} onChange={(e) => set("allow_name_change", e.target.checked)} /> Allow users to change their display name
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={!!form.log_challenge_views} onChange={(e) => set("log_challenge_views", e.target.checked)} /> Log challenge views
          </label>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold text-white">Anti-slop</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={!!form.anti_abuse_enabled} onChange={(e) => set("anti_abuse_enabled", e.target.checked)} /> Enable anti-slop review
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={!!form.honeypot_enabled} onChange={(e) => set("honeypot_enabled", e.target.checked)} /> Enable AI honeypot signals
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={!!form.leaderboard_review_enabled} onChange={(e) => set("leaderboard_review_enabled", e.target.checked)} /> Mark high-risk leaderboard rows
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={!!form.checklist_enforced} onChange={(e) => set("checklist_enforced", e.target.checked)} /> Require challenge checklist before release
            </label>
          </div>
          <div className="rounded-md border border-slate-800 p-3 text-sm text-slate-400">
            Automatic permanent bans are disabled. Admin review actions handle proof, solve removal, prize disqualification, suspension, and manual bans.
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div><label className="label">User+challenge limit</label><input className="input" type="number" value={form.submit_challenge_limit ?? 8} onChange={(e) => set("submit_challenge_limit", e.target.value)} /></div>
            <div><label className="label">Challenge window sec</label><input className="input" type="number" value={form.submit_challenge_window ?? 60} onChange={(e) => set("submit_challenge_window", e.target.value)} /></div>
            <div><label className="label">Global user limit</label><input className="input" type="number" value={form.submit_global_limit ?? 30} onChange={(e) => set("submit_global_limit", e.target.value)} /></div>
            <div><label className="label">Global window sec</label><input className="input" type="number" value={form.submit_global_window ?? 300} onChange={(e) => set("submit_global_window", e.target.value)} /></div>
            <div><label className="label">Wrong attempts</label><input className="input" type="number" value={form.wrong_flag_cooldown_threshold ?? 5} onChange={(e) => set("wrong_flag_cooldown_threshold", e.target.value)} /></div>
            <div><label className="label">Cooldown sec</label><input className="input" type="number" value={form.wrong_flag_cooldown_seconds ?? 120} onChange={(e) => set("wrong_flag_cooldown_seconds", e.target.value)} /></div>
            <div><label className="label">Fast solve sec</label><input className="input" type="number" value={form.review_fast_solve_seconds ?? 30} onChange={(e) => set("review_fast_solve_seconds", e.target.value)} /></div>
            <div><label className="label">Honeypot weight</label><input className="input" type="number" value={form.honeypot_risk_weight ?? 35} onChange={(e) => set("honeypot_risk_weight", e.target.value)} /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-6">
            <div><label className="label">Normal</label><input className="input" type="number" value={form.risk_normal_threshold ?? 20} onChange={(e) => set("risk_normal_threshold", e.target.value)} /></div>
            <div><label className="label">Soft review</label><input className="input" type="number" value={form.risk_soft_review_threshold ?? 40} onChange={(e) => set("risk_soft_review_threshold", e.target.value)} /></div>
            <div><label className="label">Proof review</label><input className="input" type="number" value={form.risk_proof_required_threshold ?? 65} onChange={(e) => set("risk_proof_required_threshold", e.target.value)} /></div>
            <div><label className="label">Proof request</label><input className="input" type="number" value={form.proof_threshold ?? 65} onChange={(e) => set("proof_threshold", e.target.value)} /></div>
            <div><label className="label">High risk</label><input className="input" type="number" value={form.risk_high_review_threshold ?? 80} onChange={(e) => set("risk_high_review_threshold", e.target.value)} /></div>
            <div><label className="label">Leaderboard review</label><input className="input" type="number" value={form.leaderboard_review_threshold ?? 80} onChange={(e) => set("leaderboard_review_threshold", e.target.value)} /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label">Team flag secret</label><input className="input mono" type="password" value={form.team_flag_secret || ""} onChange={(e) => set("team_flag_secret", e.target.value)} /></div>
            <div><label className="label">Honeypot secret</label><input className="input mono" type="password" value={form.honeypot_secret || ""} onChange={(e) => set("honeypot_secret", e.target.value)} /></div>
          </div>
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
            <input type="checkbox" checked={!!form.email_verification_required} onChange={(e) => set("email_verification_required", e.target.checked)} /> Require email verification before login
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
