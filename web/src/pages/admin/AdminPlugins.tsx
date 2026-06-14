import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../api";

interface Plugin {
  name: string;
  enabled: number;
  config: Record<string, any>;
}

const ALL_EVENTS = ["solve", "first_blood", "flag.submit", "auth.register", "auth.login", "hint.unlock", "team.create", "challenge.view", "vpn.blocked"];

const META: Record<string, { title: string; blurb: string; kind: "webhook" | "feature" }> = {
  discord_webhook: { kind: "webhook", title: "Discord Webhook", blurb: "Announce solves, first bloods and more to a Discord channel via an incoming webhook URL." },
  generic_webhook: { kind: "webhook", title: "Generic Webhook", blurb: "POST a JSON payload for each subscribed event to any URL (optionally HMAC-signed)." },
  challenge_reviews: { kind: "feature", title: "Challenge Reviews ★", blurb: "Let players rate (1–5★) and comment on challenges they've solved. Ratings show on each challenge." },
  writeups: { kind: "feature", title: "Writeups", blurb: "Let players who solved a challenge submit a writeup link, visible to everyone who has also solved it." },
};

export default function AdminPlugins() {
  const { data, refetch } = useQuery({
    queryKey: ["admin-plugins"],
    queryFn: () => api.get<{ plugins: Plugin[] }>("/admin/plugins"),
  });

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Plugins</h1>
      <p className="mb-6 text-sm text-slate-400">Built-in integrations. Enable and configure the ones you want — events fire automatically.</p>
      <div className="space-y-5">
        {data?.plugins.map((p) => <PluginCard key={p.name} plugin={p} onSaved={refetch} />)}
      </div>
    </div>
  );
}

function PluginCard({ plugin, onSaved }: { plugin: Plugin; onSaved: () => void }) {
  const meta = META[plugin.name] || { title: plugin.name, blurb: "", kind: "webhook" as const };
  const [enabled, setEnabled] = useState(!!plugin.enabled);
  const [cfg, setCfg] = useState<Record<string, any>>(plugin.config || {});
  const [msg, setMsg] = useState("");

  useEffect(() => { setEnabled(!!plugin.enabled); setCfg(plugin.config || {}); }, [plugin]);

  const toggleEvent = (ev: string) => {
    const cur: string[] = cfg.events || [];
    setCfg({ ...cfg, events: cur.includes(ev) ? cur.filter((e) => e !== ev) : [...cur, ev] });
  };

  const save = async () => {
    setMsg("");
    await api.put(`/admin/plugins/${plugin.name}`, { enabled, config: cfg });
    setMsg("Saved.");
    onSaved();
  };
  const test = async () => {
    setMsg("");
    try { await api.post(`/admin/plugins/${plugin.name}/test`); setMsg("Test sent ✓"); }
    catch (e) { setMsg(e instanceof ApiError ? `Test failed: ${e.message}` : "Test failed"); }
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-white">{meta.title}</h3>
          <p className="text-sm text-slate-400">{meta.blurb}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
        </label>
      </div>

      {meta.kind === "webhook" && (
        <>
          <div>
            <label className="label">Webhook URL</label>
            <input className="input mono" value={cfg.url || ""} onChange={(e) => setCfg({ ...cfg, url: e.target.value })} placeholder="https://…" />
          </div>

          {plugin.name === "discord_webhook" && (
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">Bot username</label><input className="input" value={cfg.username || ""} onChange={(e) => setCfg({ ...cfg, username: e.target.value })} /></div>
              <div><label className="label">Mention (e.g. @here)</label><input className="input" value={cfg.mention || ""} onChange={(e) => setCfg({ ...cfg, mention: e.target.value })} /></div>
            </div>
          )}
          {plugin.name === "generic_webhook" && (
            <div><label className="label">HMAC secret (optional)</label><input className="input mono" value={cfg.secret || ""} onChange={(e) => setCfg({ ...cfg, secret: e.target.value })} placeholder="signs X-CloudCTF-Signature" /></div>
          )}

          <div>
            <label className="label">Subscribed events</label>
            <div className="flex flex-wrap gap-2">
              {ALL_EVENTS.map((ev) => (
                <button key={ev} onClick={() => toggleEvent(ev)} className={`badge ${(cfg.events || []).includes(ev) ? "border-sky-600 text-accent" : "border-slate-700 text-slate-500"}`}>
                  {ev}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={save}>Save</button>
        {meta.kind === "webhook" && <button className="btn-ghost" onClick={test}>Send test</button>}
        {msg && <span className="text-sm text-slate-400">{msg}</span>}
      </div>
    </div>
  );
}
