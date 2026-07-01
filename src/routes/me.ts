import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { requireAuth } from "../middleware/auth";
import { getConfig } from "../lib/config";
import { computeStandings } from "../lib/standings";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("*", requireAuth);

// The "account" id + column for the active mode.
async function account(c: any): Promise<{ mode: "teams" | "users"; id: number | null; col: "team_id" | "user_id" }> {
  const cfg = await getConfig(c.env);
  const u = c.var.user!;
  return cfg.mode === "teams"
    ? { mode: "teams", id: u.team_id, col: "team_id" }
    : { mode: "users", id: u.id, col: "user_id" };
}

// GET /api/me — your profile, team, score, rank and solve count.
app.get("/", async (c) => {
  const u = c.var.user!;
  const a = await account(c);
  let score = 0, rank: number | null = null, solves = 0;
  if (a.id != null) {
    const standings = await computeStandings(c.env, a.mode, true);
    const idx = standings.findIndex((s) => s.account_id === a.id);
    if (idx >= 0) { rank = idx + 1; score = standings[idx].score; solves = standings[idx].solve_count; }
  }
  return c.json({
    user: { id: u.id, name: u.name, email: u.email, role: u.role, team_id: u.team_id },
    mode: a.mode, score, rank, solves,
  });
});

// GET /api/me/submissions — your (or your team's) submission history.
app.get("/submissions", async (c) => {
  const a = await account(c);
  if (a.id == null) return c.json({ submissions: [] });
  const rows = await c.env.DB.prepare(
    `SELECT s.id, s.challenge_id, ch.name AS challenge, s.provided, s.correct, s.created_at, su.name AS by_user
     FROM submissions s JOIN challenges ch ON ch.id = s.challenge_id JOIN users su ON su.id = s.user_id
     WHERE s.${a.col} = ? AND su.role = 'user' ORDER BY s.id DESC LIMIT 200`
  ).bind(a.id).all();
  return c.json({ submissions: rows.results });
});

// GET /api/me/solves — your (or your team's) solved challenges.
app.get("/solves", async (c) => {
  const a = await account(c);
  if (a.id == null) return c.json({ solves: [] });
  const rows = await c.env.DB.prepare(
    `SELECT s.id, s.challenge_id, ch.name AS challenge, ch.category, s.created_at, su.name AS by_user
     FROM solves s JOIN challenges ch ON ch.id = s.challenge_id JOIN users su ON su.id = s.user_id
     WHERE s.${a.col} = ? AND su.role = 'user' ORDER BY s.created_at DESC`
  ).bind(a.id).all();
  return c.json({ solves: rows.results });
});

export default app;
