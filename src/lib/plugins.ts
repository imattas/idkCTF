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

/* ---------------- Webhooks (multiple Discord targets) ---------------- */

export interface WebhookRow {
  id: number;
  name: string;
  enabled: number;
  config: Record<string, any>;
  created_at: number;
}

export async function listWebhooks(env: Env): Promise<WebhookRow[]> {
  const rows = await env.DB.prepare("SELECT id, name, enabled, config, created_at FROM webhooks ORDER BY id").all<any>();
  return rows.results.map((r) => ({ ...r, config: safeParse(r.config) }));
}

export async function getWebhook(env: Env, id: number): Promise<WebhookRow | null> {
  const r = await env.DB.prepare("SELECT id, name, enabled, config, created_at FROM webhooks WHERE id = ?").bind(id).first<any>();
  return r ? { ...r, config: safeParse(r.config) } : null;
}

export async function createWebhook(env: Env, name: string): Promise<number> {
  const res = await env.DB.prepare("INSERT INTO webhooks (name, enabled, config, created_at) VALUES (?, 0, '{\"events\":[\"solve\",\"first_blood\"]}', ?)")
    .bind(name || "New webhook", Math.floor(Date.now() / 1000))
    .run();
  return res.meta.last_row_id as number;
}

export async function updateWebhook(env: Env, id: number, name: string, enabled: boolean, config: any): Promise<void> {
  await env.DB.prepare("UPDATE webhooks SET name = ?, enabled = ?, config = ? WHERE id = ?")
    .bind(name, enabled ? 1 : 0, JSON.stringify(config ?? {}), id)
    .run();
}

export async function deleteWebhook(env: Env, id: number): Promise<void> {
  await env.DB.prepare("DELETE FROM webhooks WHERE id = ?").bind(id).run();
}

// Fan an event out to every enabled webhook subscribed to it.
export async function dispatchToPlugins(env: Env, type: string, payload: any): Promise<void> {
  const webhooks = await listWebhooks(env);
  if (!webhooks.some((w) => w.enabled)) return;
  const enriched = await enrich(env, payload);
  // A first_blood also satisfies subscribers to "solve".
  const effective = type === "first_blood" ? ["first_blood", "solve"] : [type];
  await Promise.all(
    webhooks
      .filter((w) => w.enabled && Array.isArray(w.config.events) && effective.some((t) => w.config.events.includes(t)))
      .map((w) => deliverDiscord(w.config, type, enriched).catch((e) => console.error(`webhook ${w.id} failed`, e)))
  );
}

async function enrich(env: Env, payload: any): Promise<any> {
  let challenge_name: string | null = null;
  let team_name: string | null = null;
  if (payload.challenge_id) {
    const c = await env.DB.prepare("SELECT name FROM challenges WHERE id = ?").bind(payload.challenge_id).first<{ name: string }>();
    challenge_name = c?.name ?? null;
  }
  if (payload.team_id) {
    const t = await env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(payload.team_id).first<{ name: string }>();
    team_name = t?.name ?? null;
  }
  return { ...payload, challenge_name, team_name };
}

// Replace {user}/{time}/{challenge}/{team}/{event}/{message}/{ip} placeholders.
export function renderTemplate(tpl: string, p: any): string {
  return String(tpl)
    .replaceAll("{user}", p.actor?.name ?? "Someone")
    .replaceAll("{challenge}", p.challenge_name ?? "")
    .replaceAll("{team}", p.team_name ?? "")
    .replaceAll("{event}", p.type ?? "")
    .replaceAll("{message}", p.message ?? "")
    .replaceAll("{ip}", p.ip ?? "")
    .replaceAll("{time}", new Date((p.at ?? 0) * 1000).toISOString());
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
  // Per-event template overrides the global default template, which overrides
  // the built-in description.
  const tpl = (cfg.templates && cfg.templates[type]) || cfg.template;
  const text = tpl ? renderTemplate(tpl, p) : describe(type, p);
  const format = cfg.format || "embed"; // 'embed' | 'message' | 'both'
  const mention = cfg.mention ? `${cfg.mention} ` : "";

  // Mention always goes in content (so it pings); message text goes in content
  // when the format includes 'message'.
  let content = mention;
  if (format === "message" || format === "both") content += text;
  content = content.trim();

  const body: any = { username: cfg.username || "CloudCTF" };
  if (content) body.content = content;
  if (format === "embed" || format === "both") {
    body.embeds = [{ description: text, color: COLORS[type] ?? COLORS.default, timestamp: new Date((p.at ?? 0) * 1000).toISOString() }];
  }
  await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

