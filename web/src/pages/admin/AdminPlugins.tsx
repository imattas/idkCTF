import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../api";

const ALL_EVENTS = [
  "solve",
  "first_blood",
  "auth.register",
  "team.create",
  "hint.unlock",
  "challenge.create",
  "challenge.update",
  "challenge.delete",
  "vpn.blocked",
];

interface Webhook {
  id: number;
  name: string;
  enabled: number;
  config: Record<string, any>;
}

interface TestResult {
  sent: number;
  event: string;
}

export default function AdminPlugins() {
  const wh = useQuery({ queryKey: ["admin-webhooks"], queryFn: () => api.get<{ webhooks: Webhook[] }>("/admin/webhooks") });

  const addWebhook = async () => {
    await api.post("/admin/webhooks", { name: "New Discord webhook" });
    wh.refetch();
  };

  return (
    <div className="space-y-6">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Discord Webhooks</h1>
          <p className="mt-1 text-sm text-slate-400">Send one clean announcement per selected platform event.</p>
        </div>
        <button className="btn-primary" onClick={addWebhook}>+ Add webhook</button>
      </div>

      <div className="space-y-5">
        {wh.data?.webhooks.map((w) => <WebhookCard key={w.id} webhook={w} onChange={wh.refetch} />)}
        {!wh.data?.webhooks.length && <p className="text-sm text-slate-500">No webhooks yet.</p>}
      </div>
    </div>
  );
}

function WebhookCard({ webhook, onChange }: { webhook: Webhook; onChange: () => void }) {
  const [name, setName] = useState(webhook.name);
  const [enabled, setEnabled] = useState(!!webhook.enabled);
  const [cfg, setCfg] = useState<Record<string, any>>(webhook.config || {});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setName(webhook.name);
    setEnabled(!!webhook.enabled);
    setCfg(webhook.config || {});
  }, [webhook]);

  const events: string[] = Array.isArray(cfg.events) ? cfg.events.map(String).filter((ev) => ALL_EVENTS.includes(ev)) : [];
  const testEvent = events.includes(cfg.test_event) ? String(cfg.test_event) : (events[0] || "solve");

  const toggleEvent = (ev: string) => {
    const next = events.includes(ev) ? events.filter((e) => e !== ev) : [...events, ev];
    setCfg({ ...cfg, events: next, test_event: next.includes(testEvent) ? testEvent : (next[0] || "solve") });
  };

  const persist = async (quiet = false) => {
    const config = { ...cfg, events, test_event: testEvent };
    await api.put(`/admin/webhooks/${webhook.id}`, { name, enabled, config });
    if (!quiet) setMsg("Saved.");
    onChange();
  };

  const save = async () => {
    setMsg("");
    try {
      await persist();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not save webhook");
    }
  };

  const test = async () => {
    setMsg("");
    try {
      await persist(true);
      const result = await api.post<TestResult>(`/admin/webhooks/${webhook.id}/test`);
      setMsg(`Test sent: ${result.event || testEvent}.`);
    } catch (e) {
      setMsg(e instanceof ApiError ? `Test failed: ${e.message}` : "Test failed");
    }
  };

  const remove = async () => {
    if (!confirm(`Delete webhook "${name}"?`)) return;
    await api.del(`/admin/webhooks/${webhook.id}`);
    onChange();
  };

  return (
    <div className="card space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <input className="input max-w-sm font-medium" value={name} onChange={(e) => setName(e.target.value)} placeholder="Webhook name" />
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
        </label>
        <button className="btn-danger md:ml-auto text-xs" onClick={remove}>Delete</button>
      </div>

      <div>
        <label className="label">Webhook URL</label>
        <input
          className="input mono"
          value={cfg.url || ""}
          onChange={(e) => setCfg({ ...cfg, url: e.target.value })}
          placeholder="https://discord.com/api/webhooks/..."
        />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div>
          <label className="label">Bot username</label>
          <input className="input" value={cfg.username || ""} onChange={(e) => setCfg({ ...cfg, username: e.target.value })} placeholder="idkCTF" />
        </div>
        <div>
          <label className="label">Mention</label>
          <input className="input" value={cfg.mention || ""} onChange={(e) => setCfg({ ...cfg, mention: e.target.value })} placeholder="@here" />
        </div>
        <div>
          <label className="label">Format</label>
          <select className="input" value={cfg.format || "embed"} onChange={(e) => setCfg({ ...cfg, format: e.target.value })}>
            <option value="embed">Embed</option>
            <option value="message">Message</option>
            <option value="both">Both</option>
          </select>
        </div>
        <div>
          <label className="label">Test event</label>
          <select className="input" value={testEvent} onChange={(e) => setCfg({ ...cfg, test_event: e.target.value })}>
            {(events.length ? events : ["solve"]).map((ev) => <option key={ev} value={ev}>{ev}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Default message template</label>
        <textarea
          className="input mono"
          rows={2}
          value={cfg.template || ""}
          onChange={(e) => setCfg({ ...cfg, template: e.target.value })}
          placeholder="{user} solved {challenge}"
        />
        <p className="mt-1 text-xs text-slate-500">Variables: <code className="mono">{"{user} {challenge} {team} {event} {message} {ip} {time}"}</code></p>
      </div>

      <div>
        <label className="label">Subscribed events</label>
        <div className="flex flex-wrap gap-2">
          {ALL_EVENTS.map((ev) => (
            <button
              key={ev}
              type="button"
              onClick={() => toggleEvent(ev)}
              className={`badge ${events.includes(ev) ? "badge-accent" : "border-slate-700 text-slate-500"}`}
            >
              {ev}
            </button>
          ))}
        </div>
      </div>

      {events.length > 0 && (
        <div>
          <label className="label">Per-event messages</label>
          <div className="space-y-2">
            {events.map((ev) => (
              <div key={ev} className="flex flex-col gap-2 md:flex-row md:items-center">
                <span className="w-32 shrink-0 text-xs text-slate-400">{ev}</span>
                <input
                  className="input mono text-xs"
                  value={(cfg.templates || {})[ev] || ""}
                  onChange={(e) => setCfg({ ...cfg, templates: { ...(cfg.templates || {}), [ev]: e.target.value } })}
                  placeholder={`Blank uses the default for ${ev}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={save}>Save</button>
        <button className="btn-ghost" onClick={test} disabled={!cfg.url}>Send test</button>
        {msg && <span className="text-sm text-slate-400">{msg}</span>}
      </div>
    </div>
  );
}
