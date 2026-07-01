import { Hono } from "hono";
import type { Env, Variables, AppContext } from "../types";
import { getConfig, competitionState } from "../lib/config";
import { challengeValues } from "../lib/standings";
import { nowSeconds } from "../lib/validate";
import { logEvent, EVENTS } from "../lib/events";
import { ABUSE_EVENTS, honeypotToken, logAbuseEvent } from "../lib/antiAbuse";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

function accountKey(mode: "teams" | "users", user: Variables["user"]): number | null {
  if (!user) return null;
  return mode === "teams" ? user.team_id : user.id;
}

function parsePrereqs(raw: string | null): number[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a.map(Number) : []; } catch { return []; }
}

// Set of challenge IDs the given account has solved.
async function solvedSetFor(c: AppContext, mode: "teams" | "users", acct: number | null): Promise<Set<number>> {
  const set = new Set<number>();
  if (acct == null) return set;
  const col = mode === "teams" ? "team_id" : "user_id";
  const rows = await c.env.DB.prepare(
    `SELECT s.challenge_id
     FROM solves s JOIN users u ON u.id = s.user_id
     WHERE s.${col} = ? AND u.role = 'user'`
  ).bind(acct).all<{ challenge_id: number }>();
  for (const r of rows.results) set.add(r.challenge_id);
  return set;
}

async function gate(c: any) {
  const cfg = await getConfig(c.env);
  const user = c.var.user;
  const isAdmin = user?.role === "admin";
  if ((cfg.visibility === "private" || cfg.site_lockdown) && !user) return { ok: false, status: 403, cfg, isAdmin };
  const state = competitionState(cfg, nowSeconds());
  if (state === "before" && !isAdmin) return { ok: false, status: 425, cfg, isAdmin, state };
  return { ok: true, cfg, isAdmin, state };
}

app.get("/", async (c) => {
  const g = await gate(c);
  if (!g.ok) return c.json({ error: "Challenges not available", state: g.state }, g.status as any);
  const { cfg, isAdmin } = g;

  // The public board only ever shows visible challenges — even to admins, who
  // manage hidden/draft challenges in the Admin panel. This keeps the board
  // identical to what players actually see.
  const rows = await c.env.DB.prepare(
    `SELECT id, name, category, type, difficulty, value, initial, minimum, decay, state, sort_order, prerequisites FROM challenges WHERE state = 'visible' ORDER BY category, sort_order, id`
  ).all<any>();
  const values = await challengeValues(c.env);
  const counts = await c.env.DB.prepare(
    `SELECT s.challenge_id, COUNT(*) AS n
     FROM solves s JOIN users u ON u.id = s.user_id
     WHERE u.role = 'user'
     GROUP BY s.challenge_id`
  ).all<{ challenge_id: number; n: number }>();
  const countMap = new Map(counts.results.map((r) => [r.challenge_id, r.n]));

  const acct = accountKey(cfg.mode, c.var.user);
  const solvedSet = await solvedSetFor(c, cfg.mode, acct);

  const challenges = rows.results.map((r) => {
    const prereqs = parsePrereqs(r.prerequisites);
    const locked = !isAdmin && prereqs.some((p) => !solvedSet.has(p));
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      type: r.type,
      difficulty: r.difficulty || "medium",
      state: r.state,
      value: values.get(r.id) ?? r.value,
      solves: countMap.get(r.id) ?? 0,
      solved: solvedSet.has(r.id),
      locked,
    };
  });
  return c.json({ challenges });
});

app.get("/:id", async (c) => {
  const g = await gate(c);
  if (!g.ok) return c.json({ error: "Not available", state: g.state }, g.status as any);
  const { cfg, isAdmin } = g;
  const id = Number(c.req.param("id"));

  const ch = await c.env.DB.prepare("SELECT * FROM challenges WHERE id = ?").bind(id).first<any>();
  if (!ch || (ch.state !== "visible" && !isAdmin)) return c.json({ error: "Not found" }, 404);

  const acct = accountKey(cfg.mode, c.var.user);
  const solvedSet = await solvedSetFor(c, cfg.mode, acct);

  // Prerequisite lock
  const prereqs = parsePrereqs(ch.prerequisites);
  const unmet = prereqs.filter((p) => !solvedSet.has(p));
  if (unmet.length && !isAdmin) {
    const ph = unmet.map(() => "?").join(",");
    const names = await c.env.DB.prepare(`SELECT name FROM challenges WHERE id IN (${ph})`).bind(...unmet).all<{ name: string }>();
    return c.json({
      challenge: { id: ch.id, name: ch.name, category: ch.category, locked: true, requires: names.results.map((n) => n.name) },
    });
  }

  const values = await challengeValues(c.env);
  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n
     FROM solves s JOIN users u ON u.id = s.user_id
     WHERE s.challenge_id = ? AND u.role = 'user'`
  ).bind(id).first<{ n: number }>();
  const files = await c.env.DB.prepare("SELECT id, name, size FROM files WHERE challenge_id = ?").bind(id).all();

  const hintsRows = await c.env.DB.prepare("SELECT id, cost, content FROM hints WHERE challenge_id = ? ORDER BY sort_order, id").bind(id).all<{ id: number; cost: number; content: string }>();
  let unlocked = new Set<number>();
  if (c.var.user) {
    const u = await c.env.DB.prepare("SELECT hint_id FROM hint_unlocks WHERE user_id = ? OR (team_id IS NOT NULL AND team_id = ?)").bind(c.var.user.id, c.var.user.team_id).all<{ hint_id: number }>();
    unlocked = new Set(u.results.map((r) => r.hint_id));
  }
  const hints = hintsRows.results.map((h) => ({ id: h.id, cost: h.cost, unlocked: unlocked.has(h.id) || isAdmin, content: unlocked.has(h.id) || isAdmin ? h.content : null }));

  const solved = acct != null && solvedSet.has(id);

  const solvers = await c.env.DB.prepare(
    cfg.mode === "teams"
      ? `SELECT t.name AS name, s.created_at AS created_at
         FROM solves s
         JOIN teams t ON t.id = s.team_id
         JOIN users u ON u.id = s.user_id
         WHERE s.challenge_id = ? AND t.hidden = 0 AND u.role = 'user'
         ORDER BY s.created_at LIMIT 50`
      : `SELECT u.name AS name, s.created_at AS created_at
         FROM solves s JOIN users u ON u.id = s.user_id
         WHERE s.challenge_id = ? AND u.hidden = 0 AND u.role = 'user'
         ORDER BY s.created_at LIMIT 50`
  ).bind(id).all();

  // Your (or your team's) attempts on this challenge.
  let attempts: any[] = [];
  if (acct != null) {
    const col = cfg.mode === "teams" ? "team_id" : "user_id";
    const rows = await c.env.DB.prepare(
      `SELECT s.provided, s.correct, s.created_at, u.name AS by_user FROM submissions s
       JOIN users u ON u.id = s.user_id
       WHERE u.role = 'user' AND s.challenge_id = ? AND s.${col} = ?
       ORDER BY s.id DESC LIMIT 50`
    ).bind(id, acct).all();
    attempts = rows.results;
  }

  if (cfg.log_challenge_views && c.var.user && !isAdmin) {
    await logEvent(c, EVENTS.CHALLENGE_VIEW, { challenge_id: id, message: ch.name });
  }
  let honeypot: string | null = null;
  if (cfg.anti_abuse_enabled && cfg.honeypot_enabled && c.var.user && !isAdmin && acct != null) {
    honeypot = await honeypotToken(acct, id, cfg.honeypot_secret || c.env.HONEYPOT_SECRET || cfg.team_flag_secret || c.env.TEAM_FLAG_SECRET || "");
    await logAbuseEvent(c, ABUSE_EVENTS.CHALLENGE_OPENED, { challenge_id: id, message: ch.name });
  }

  return c.json({
    challenge: {
      id: ch.id, name: ch.name, category: ch.category, description: ch.description,
      connection_info: ch.connection_info, type: ch.type, difficulty: ch.difficulty || "medium", state: ch.state, max_attempts: ch.max_attempts,
      value: values.get(ch.id) ?? ch.value, solves: countRow?.n ?? 0, solved, locked: false,
      files: files.results, hints, solvers: solvers.results, attempts, honeypot_token: honeypot,
    },
  });
});

export default app;
