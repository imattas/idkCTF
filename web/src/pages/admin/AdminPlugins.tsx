import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../api";

const ALL_EVENTS = ["solve", "first_blood", "flag.submit", "auth.register", "auth.login", "hint.unlock", "team.create", "challenge.view", "vpn.blocked", "challenge.create", "challenge.update", "challenge.delete", "admin.action"];

interface Webhook { id: number; name: string; enabled: number; config: Record<string, any>; }
interface Plugin { name: string; enabled: number; config: Record<string, any>; }

const FEATURES: Record<string, { title: string; blurb: string }> = {
  challenge_reviews: { title: "Challenge Reviews ★", blurb: "Let players rate (1–5★) and comment on challenges they've solved." },
  writeups: { title: "Writeups", blurb: "Let players who solved a challenge submit a writeup link." },
};

export default function AdminPlugins() {
  const wh = useQuery({ queryKey: ["admin-webhooks"], queryFn: () => api.get<{ webhooks: Webhook[] }>("/admin/webhooks") });
  const pl = useQuery({ queryKey: ["admin-plugins"], queryFn: () => api.get<{ plugins: Plugin[] }>("/admin/plugins") });

  const addWebhook = async () => { await api.post("/admin/webhooks", { name: "New Discord webhook" }); wh.refetch(); };

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Discord Webhooks</h1>
          <button className="btn-primary" onClick={addWebhook}>+ Add webhook</button>
        </div>
        <p className="mb-4 text-sm text-slate-400">Add as many as you like — each can post to a different Discord server/channel with its own events and messages.</p>
        <div className="space-y-5">
          {wh.data?.webhooks.map((w) => <WebhookCard key={w.id} webhook={w} onChange={wh.refetch} />)}
          {!wh.data?.webhooks.length && <p className="text-sm text-slate-500">No webhooks yet. Click “Add webhook”.</p>}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-xl font-bold text-white">Feature plugins</h2>
        <div className="space-y-5">
          {pl.data?.plugins.filter((p) => FEATURES[p.name]).map((p) => <FeatureCard key={p.name} plugin={p} onSaved={pl.refetch} />)}
        </div>
      </div>
    </div>
  );
}

function WebhookCard({ webhook, onChange }: { webhook: Webhook; onChange: () => void }) {
  const [name, setName] = useState(webhook.name);
  const [enabled, setEnabled] = useState(!!webhook.enabled);
  const [cfg, setCfg] = useState<Record<string, any>>(webhook.config || {});
  const [msg, setMsg] = useState("");

  useEffect(() => { setName(webhook.name); setEnabled(!!webhook.enabled); setCfg(webhook.config || {}); }, [webhook]);

  const toggleEvent = (ev: string) => {
    const cur: string[] = cfg.events || [];
    setCfg({ ...cfg, events: cur.includes(ev) ? cur.filter((e) => e !== ev) : [...cur, ev] });
  };
  const save = async () => { setMsg(""); await api.put(`/admin/webhooks/${webhook.id}`, { name, enabled, config: cfg }); setMsg("Saved."); onChange(); };
  const test = async () => {
    setMsg("");
    try { await api.post(`/admin/webhooks/${webhook.id}/test`); setMsg("Test sent ✓"); }
    catch (e) { setMsg(e instanceof ApiError ? `Test failed: ${e.message}` : "Test failed"); }
  };
  const remove = async () => { if (confirm(`Delete webhook “${name}”?`)) { await api.del(`/admin/webhooks/${webhook.id}`); onChange(); } };

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-3">
        <input className="input max-w-xs font-medium" value={name} onChange={(e) => setName(e.target.value)} placeholder="Webhook name" />
        <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled</label>
        <button className="btn-danger ml-auto text-xs" onClick={remove}>Delete</button>
      </div>

      <div><label className="label">Webhook URL</label><input className="input mono" value={cfg.url || ""} onChange={(e) => setCfg({ ...cfg, url: e.target.value })} placeholder="https://discord.com/api/webhooks/…" /></div>

      <div className="grid grid-cols-3 gap-4">
        <div><label className="label">Bot username</label><input className="input" value={cfg.username || ""} onChange={(e) => setCfg({ ...cfg, username: e.target.value })} /></div>
        <div><label className="label">Mention (e.g. @here)</label><input className="input" value={cfg.mention || ""} onChange={(e) => setCfg({ ...cfg, mention: e.target.value })} /></div>
        <div>
          <label className="label">Format</label>
          <select className="input" value={cfg.format || "embed"} onChange={(e) => setCfg({ ...cfg, format: e.target.value })}>
            <option value="embed">Embed</option><option value="message">Message</option><option value="both">Both</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label">Default message template (optional)</label>
        <textarea className="input mono" rows={2} value={cfg.template || ""} onChange={(e) => setCfg({ ...cfg, template: e.target.value })} placeholder="🚩 {user} solved {challenge}!" />
        <p className="mt-1 text-xs text-slate-500">Variables: <code className="mono">{"{user} {challenge} {team} {event} {message} {ip} {time}"}</code></p>
      </div>

      <div>
        <label className="label">Subscribed events</label>
        <div className="flex flex-wrap gap-2">
          {ALL_EVENTS.map((ev) => (
            <button key={ev} onClick={() => toggleEvent(ev)} className={`badge ${(cfg.events || []).includes(ev) ? "border-sky-600 text-accent" : "border-slate-700 text-slate-500"}`}>{ev}</button>
          ))}
        </div>
      </div>

      {(cfg.events || []).length > 0 && (
        <div>
          <label className="label">Per-event messages (optional — overrides the default)</label>
          <div className="space-y-2">
            {(cfg.events || []).map((ev: string) => (
              <div key={ev} className="flex items-center gap-2">
                <span className="w-32 shrink-0 text-xs text-slate-400">{ev}</span>
                <input className="input mono text-xs" value={(cfg.templates || {})[ev] || ""} onChange={(e) => setCfg({ ...cfg, templates: { ...(cfg.templates || {}), [ev]: e.target.value } })} placeholder={`message for ${ev} — blank = default`} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={save}>Save</button>
        <button className="btn-ghost" onClick={test}>Send test</button>
        {msg && <span className="text-sm text-slate-400">{msg}</span>}
      </div>
    </div>
  );
}

function FeatureCard({ plugin, onSaved }: { plugin: Plugin; onSaved: () => void }) {
  const meta = FEATURES[plugin.name];
  const [enabled, setEnabled] = useState(!!plugin.enabled);
  const [msg, setMsg] = useState("");
  useEffect(() => setEnabled(!!plugin.enabled), [plugin]);
  const save = async () => { setMsg(""); await api.put(`/admin/plugins/${plugin.name}`, { enabled, config: plugin.config || {} }); setMsg("Saved."); onSaved(); };
  return (
    <div className="card flex items-center justify-between">
      <div>
        <h3 className="font-semibold text-white">{meta.title}</h3>
        <p className="text-sm text-slate-400">{meta.blurb}</p>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled</label>
        <button className="btn-primary" onClick={save}>Save</button>
        {msg && <span className="text-xs text-slate-400">{msg}</span>}
      </div>
    </div>
  );
}
