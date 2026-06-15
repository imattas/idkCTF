import type { MiddlewareHandler } from "hono";
import type { Env, Variables, SessionUser } from "../types";
import { getSessionUser } from "../lib/session";
import { sha256hex } from "../lib/auth";

type M = MiddlewareHandler<{ Bindings: Env; Variables: Variables }>;

async function userFromToken(env: Env, req: Request): Promise<SessionUser | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  const hash = await sha256hex(token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.role, u.team_id, u.is_captain, u.banned, t.id AS tid
     FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?`
  )
    .bind(hash)
    .first<SessionUser & { banned: number; tid: number }>();
  if (!row || row.banned) return null;
  // Best-effort last_used update.
  await env.DB.prepare("UPDATE api_tokens SET last_used = ? WHERE id = ?")
    .bind(Math.floor(Date.now() / 1000), row.tid)
    .run()
    .catch(() => {});
  const { banned, tid, ...user } = row;
  return user;
}

// Populates c.var.user from the session cookie or an API bearer token (or null).
export const loadUser: M = async (c, next) => {
  let user = await getSessionUser(c.env, c.req.raw);
  if (!user) user = await userFromToken(c.env, c.req.raw);
  c.set("user", user);
  await next();
};

export const requireAuth: M = async (c, next) => {
  if (!c.var.user) return c.json({ error: "Authentication required" }, 401);
  await next();
};

export const requireAdmin: M = async (c, next) => {
  if (!c.var.user || c.var.user.role !== "admin")
    return c.json({ error: "Admin access required" }, 403);
  await next();
};
