import type { Env } from "./events";

export interface PluginRow {
  name: string;
  enabled: number;
  config: Record<string, any>;
  updated_at: number | null;
}

export async function listPlugins(env: Env): Promise<PluginRow[]> {
  const rows = await env.DB.prepare("SELECT name, enabled, config, updated_at FROM plugins ORDER BY name").all<any>();
  return rows.results.map((r) => ({ ...r, config: safeParse(r.config) }));
}

export async function getPlugin(env: Env, name: string): Promise<PluginRow | null> {
  const r = await env.DB.prepare("SELECT name, enabled, config, updated_at FROM plugins WHERE name = ?").bind(name).first<any>();
  return r ? { ...r, config: safeParse(r.config) } : null;
}

export async function isPluginEnabled(env: Env, name: string): Promise<boolean> {
  const r = await env.DB.prepare("SELECT enabled FROM plugins WHERE name = ?").bind(name).first<{ enabled: number }>();
  return !!r?.enabled;
}

export async function savePlugin(env: Env, name: string, enabled: boolean, config: any): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO plugins (name, enabled, config, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET enabled = excluded.enabled, config = excluded.config, updated_at = excluded.updated_at`
  )
    .bind(name, enabled ? 1 : 0, JSON.stringify(config ?? {}), Math.floor(Date.now() / 1000))
    .run();
}

function safeParse(s: string): Record<string, any> {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

// Fan an event out to every enabled plugin that subscribes to it.
export async function dispatchToPlugins(env: Env, type: string, payload: any): Promise<void> {
  const plugins = await listPlugins(env);
  const enriched = await enrich(env, payload);
  // A first_blood also satisfies subscribers to "solve".
  const effective = type === "first_blood" ? ["first_blood", "solve"] : [type];
  await Promise.all(
    plugins
      .filter((p) => p.enabled && Array.isArray(p.config.events) && effective.some((t) => p.config.events.includes(t)))
      .map((p) => deliver(p, type, enriched).catch((e) => console.error(`plugin ${p.name} failed`, e)))
  );
}

async function enrich(env: Env, payload: any): Promise<any> {
  let challenge_name: string | null = null;
  if (payload.challenge_id) {
    const c = await env.DB.prepare("SELECT name FROM challenges WHERE id = ?").bind(payload.challenge_id).first<{ name: string }>();
    challenge_name = c?.name ?? null;
  }
  return { ...payload, challenge_name };
}

async function deliver(plugin: PluginRow, type: string, payload: any): Promise<void> {
  switch (plugin.name) {
    case "discord_webhook": return deliverDiscord(plugin.config, type, payload);
    case "generic_webhook": return deliverGeneric(plugin.config, type, payload);
  }
}

const COLORS: Record<string, number> = {
  first_blood: 0xef4444,
  solve: 0x22c55e,
  "auth.register": 0x38bdf8,
  default: 0x64748b,
};

function describe(type: string, p: any): string {
  const who = p.actor?.name ?? "Someone";
  const chal = p.challenge_name ? `**${p.challenge_name}**` : "a challenge";
  switch (type) {
    case "first_blood": return `🩸 **FIRST BLOOD!** ${who} was first to solve ${chal}!`;
    case "solve": return `✅ ${who} solved ${chal}`;
    case "auth.register": return `👋 ${who} just registered`;
    case "hint.unlock": return `💡 ${who} unlocked a hint on ${chal}`;
    case "team.create": return `🚩 ${who} created a team`;
    default: return p.message || `Event: ${type}`;
  }
}

export async function deliverDiscord(cfg: any, type: string, p: any): Promise<void> {
  if (!cfg.url) return;
  const content = (cfg.mention ? `${cfg.mention} ` : "") + (type === "first_blood" ? describe(type, p) : "");
  const body = {
    username: cfg.username || "CloudCTF",
    content: content || undefined,
    embeds: [
      {
        description: describe(type, p),
        color: COLORS[type] ?? COLORS.default,
        timestamp: new Date(p.at * 1000).toISOString(),
      },
    ],
  };
  await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deliverGeneric(cfg: any, type: string, p: any): Promise<void> {
  if (!cfg.url) return;
  const bodyStr = JSON.stringify({ event: type, ...p });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.secret) headers["X-CloudCTF-Signature"] = await hmac(cfg.secret, bodyStr);
  await fetch(cfg.url, { method: "POST", headers, body: bodyStr });
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
