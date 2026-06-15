import type { Env } from "../types";

export interface BanRow {
  id: number;
  type: string;
  value: string;
  match: string;
  reason: string | null;
  created_at: number;
}

export async function isIpBanned(env: Env, ip: string | null): Promise<boolean> {
  if (!ip) return false;
  const r = await env.DB.prepare("SELECT 1 FROM bans WHERE type = 'ip' AND value = ? LIMIT 1").bind(ip).first();
  return !!r;
}

// Username bans: 'exact' (case-insensitive equals) or 'contains' (substring).
export async function isUsernameBanned(env: Env, name: string): Promise<boolean> {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  const rows = await env.DB.prepare("SELECT value, match FROM bans WHERE type = 'username'").all<{ value: string; match: string }>();
  for (const b of rows.results) {
    const v = b.value.trim().toLowerCase();
    if (!v) continue;
    if (b.match === "contains" ? n.includes(v) : n === v) return true;
  }
  return false;
}

export async function listBans(env: Env): Promise<BanRow[]> {
  const rows = await env.DB.prepare("SELECT * FROM bans ORDER BY id DESC").all<BanRow>();
  return rows.results;
}

export async function addBan(env: Env, type: string, value: string, match: string, reason: string | null): Promise<number> {
  const res = await env.DB.prepare("INSERT INTO bans (type, value, match, reason, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(type === "username" ? "username" : "ip", value.trim(), match === "contains" ? "contains" : "exact", reason || null, Math.floor(Date.now() / 1000))
    .run();
  return res.meta.last_row_id as number;
}

export async function removeBan(env: Env, id: number): Promise<void> {
  await env.DB.prepare("DELETE FROM bans WHERE id = ?").bind(id).run();
}
