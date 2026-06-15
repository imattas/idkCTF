import { Hono } from "hono";
import type { Env, Variables, AppContext } from "../types";
import { getConfig, competitionState } from "../lib/config";
import { challengeValues } from "../lib/standings";
import { nowSeconds } from "../lib/validate";
import { logEvent, EVENTS } from "../lib/events";
import { isPluginEnabled } from "../lib/plugins";
import { requireAuth } from "../middleware/auth";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

function accountKey(mode: "teams" | "users", user: Variables["user"]): number | null {
  if (!user) return null;
  return mode === "teams" ? user.team_id : user.id;
}

function parsePrereqs(raw: string | null): number[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a.map(Number) : []; } catch { return []; }
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a.map(String) : []; } catch { return []; }
}

// Set of challenge IDs the given account has solved.
async function solvedSetFor(c: AppContext, mode: "teams" | "users", acct: number | null): Promise<Set<number>> {
  const set = new Set<number>();
  if (acct == null) return set;
  const col = mode === "teams" ? "team_id" : "user_id";
  const rows = await c.env.DB.prepare(`SELECT challenge_id FROM solves WHERE ${col} = ?`).bind(acct).all<{ challenge_id: number }>();
  for (const r of rows.results) set.add(r.challenge_id);
  return set;
}

async function gate(c: any) {
  const cfg = await getConfig(c.env);
  const user = c.var.user;
  const isAdmin = user?.role === "admin";
  if (cfg.visibility === "private" && !user) return { ok: false, status: 403, cfg, isAdmin };
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
    `SELECT id, name, category, type, value, initial, minimum, decay, state, sort_order, prerequisites, tags FROM challenges WHERE state = 'visible' ORDER BY category, sort_order, id`
  ).all<any>();
  const values = await challengeValues(c.env);
  const counts = await c.env.DB.prepare("SELECT challenge_id, COUNT(*) AS n FROM solves GROUP BY challenge_id").all<{ challenge_id: number; n: number }>();
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
      state: r.state,
      value: values.get(r.id) ?? r.value,
      solves: countMap.get(r.id) ?? 0,
      solved: solvedSet.has(r.id),
      locked,
      tags: parseTags(r.tags),
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
  const countRow = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM solves WHERE challenge_id = ?").bind(id).first<{ n: number }>();
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
      ? "SELECT t.name AS name, s.created_at AS created_at FROM solves s JOIN teams t ON t.id = s.team_id WHERE s.challenge_id = ? AND t.hidden = 0 ORDER BY s.created_at LIMIT 50"
      : "SELECT u.name AS name, s.created_at AS created_at FROM solves s JOIN users u ON u.id = s.user_id WHERE s.challenge_id = ? AND u.hidden = 0 ORDER BY s.created_at LIMIT 50"
  ).bind(id).all();

  // Reviews & writeups (feature plugins)
  const [reviewsOn, writeupsOn] = await Promise.all([
    isPluginEnabled(c.env, "challenge_reviews"),
    isPluginEnabled(c.env, "writeups"),
  ]);
  let reviews: any = null;
  if (reviewsOn) {
    const agg = await c.env.DB.prepare("SELECT COUNT(*) AS n, AVG(rating) AS avg FROM reviews WHERE challenge_id = ?").bind(id).first<{ n: number; avg: number }>();
    const list = await c.env.DB.prepare("SELECT r.rating, r.comment, r.created_at, u.name FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.challenge_id = ? ORDER BY r.created_at DESC LIMIT 50").bind(id).all();
    const mine = c.var.user ? await c.env.DB.prepare("SELECT rating, comment FROM reviews WHERE challenge_id = ? AND user_id = ?").bind(id, c.var.user.id).first() : null;
    reviews = { count: agg?.n ?? 0, average: agg?.avg ?? null, list: list.results, mine };
  }
  let writeups: any = null;
  if (writeupsOn) {
    const list = await c.env.DB.prepare("SELECT w.url, w.created_at, u.name FROM writeups w JOIN users u ON u.id = w.user_id WHERE w.challenge_id = ? ORDER BY w.created_at DESC LIMIT 50").bind(id).all();
    const mine = c.var.user ? await c.env.DB.prepare("SELECT url FROM writeups WHERE challenge_id = ? AND user_id = ?").bind(id, c.var.user.id).first() : null;
    writeups = { list: list.results, mine };
  }

  // Your (or your team's) attempts on this challenge.
  let attempts: any[] = [];
  if (acct != null) {
    const col = cfg.mode === "teams" ? "team_id" : "user_id";
    const rows = await c.env.DB.prepare(
      `SELECT s.provided, s.correct, s.created_at, u.name AS by_user FROM submissions s
       LEFT JOIN users u ON u.id = s.user_id WHERE s.challenge_id = ? AND s.${col} = ? ORDER BY s.id DESC LIMIT 50`
    ).bind(id, acct).all();
    attempts = rows.results;
  }

  if (cfg.log_challenge_views && c.var.user && !isAdmin) {
    await logEvent(c, EVENTS.CHALLENGE_VIEW, { challenge_id: id, message: ch.name });
  }

  return c.json({
    challenge: {
      id: ch.id, name: ch.name, category: ch.category, description: ch.description,
      connection_info: ch.connection_info, type: ch.type, state: ch.state, max_attempts: ch.max_attempts,
      value: values.get(ch.id) ?? ch.value, solves: countRow?.n ?? 0, solved, locked: false,
      tags: parseTags(ch.tags),
      files: files.results, hints, solvers: solvers.results, reviews, writeups, attempts,
    },
  });
});

// --- Reviews (feature plugin) ---
app.post("/:id/review", requireAuth, async (c) => {
  if (!(await isPluginEnabled(c.env, "challenge_reviews"))) return c.json({ error: "Reviews are disabled" }, 403);
  const u = c.var.user!;
  const id = Number(c.req.param("id"));
  const cfg = await getConfig(c.env);
  const acct = accountKey(cfg.mode, u);
  const col = cfg.mode === "teams" ? "team_id" : "user_id";
  const solved = acct != null && (await c.env.DB.prepare(`SELECT 1 FROM solves WHERE challenge_id = ? AND ${col} = ?`).bind(id, acct).first());
  if (!solved) return c.json({ error: "Solve the challenge before reviewing it" }, 403);
  const b = await c.req.json().catch(() => ({}));
  const rating = Math.max(1, Math.min(5, Number(b.rating) || 0));
  if (!rating) return c.json({ error: "Rating 1-5 required" }, 400);
  await c.env.DB.prepare(
    `INSERT INTO reviews (challenge_id, user_id, team_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(challenge_id, user_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, created_at = excluded.created_at`
  ).bind(id, u.id, u.team_id, rating, String(b.comment || "").slice(0, 1000) || null, nowSeconds()).run();
  return c.json({ ok: true });
});

// --- Writeups (feature plugin) ---
app.post("/:id/writeup", requireAuth, async (c) => {
  if (!(await isPluginEnabled(c.env, "writeups"))) return c.json({ error: "Writeups are disabled" }, 403);
  const u = c.var.user!;
  const id = Number(c.req.param("id"));
  const cfg = await getConfig(c.env);
  const acct = accountKey(cfg.mode, u);
  const col = cfg.mode === "teams" ? "team_id" : "user_id";
  const solved = acct != null && (await c.env.DB.prepare(`SELECT 1 FROM solves WHERE challenge_id = ? AND ${col} = ?`).bind(id, acct).first());
  if (!solved) return c.json({ error: "Solve the challenge before posting a writeup" }, 403);
  const b = await c.req.json().catch(() => ({}));
  const url = String(b.url || "").trim();
  if (!/^https?:\/\/.+/.test(url)) return c.json({ error: "Valid http(s) URL required" }, 400);
  await c.env.DB.prepare(
    `INSERT INTO writeups (challenge_id, user_id, team_id, url, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(challenge_id, user_id) DO UPDATE SET url = excluded.url, created_at = excluded.created_at`
  ).bind(id, u.id, u.team_id, url, nowSeconds()).run();
  return c.json({ ok: true });
});

export default app;
