import type { Env } from "../types";

// Fixed-window rate limit backed by KV. Returns true if the action is allowed.
// (KV requires a TTL >= 60s, so windows are at least a minute.)
export async function rateLimit(env: Env, key: string, max: number, windowSec: number): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const k = `rl:${key}`;
  let count = 0;
  let reset = now + windowSec;
  const raw = await env.SESSIONS.get(k);
  if (raw) {
    try {
      const d = JSON.parse(raw);
      if (d.reset > now) { count = d.count; reset = d.reset; }
    } catch {}
  }
  if (count >= max) return false;
  await env.SESSIONS.put(k, JSON.stringify({ count: count + 1, reset }), { expirationTtl: Math.max(60, reset - now) });
  return true;
}
