import type { Env, SessionUser } from "../types";
import { randomToken } from "./auth";

const COOKIE = "ctf_session";
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

interface SessionData {
  userId: number;
}

export async function createSession(env: Env, userId: number): Promise<string> {
  const token = randomToken(32);
  await env.SESSIONS.put(`sess:${token}`, JSON.stringify({ userId } satisfies SessionData), {
    expirationTtl: TTL_SECONDS,
  });
  return token;
}

export async function destroySession(env: Env, token: string): Promise<void> {
  await env.SESSIONS.delete(`sess:${token}`);
}

export function readCookie(req: Request): string | null {
  const header = req.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function sessionCookie(token: string): string {
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${TTL_SECONDS}`;
}

export function clearCookie(): string {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

// Resolve the current user from the session cookie. Returns null if no/invalid session.
export async function getSessionUser(env: Env, req: Request): Promise<SessionUser | null> {
  const token = readCookie(req);
  if (!token) return null;
  const raw = await env.SESSIONS.get(`sess:${token}`);
  if (!raw) return null;
  const { userId } = JSON.parse(raw) as SessionData;
  const user = await env.DB.prepare(
    "SELECT id, name, email, role, team_id, is_captain, banned FROM users WHERE id = ?"
  )
    .bind(userId)
    .first<SessionUser & { banned: number }>();
  if (!user || user.banned) return null;
  const { banned, ...rest } = user;
  return rest;
}
