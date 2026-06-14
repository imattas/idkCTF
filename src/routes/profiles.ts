import { Hono } from "hono";
import type { Env, Variables, AppContext } from "../types";
import { getConfig } from "../lib/config";
import { challengeValues, computeStandings } from "../lib/standings";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

async function guard(c: AppContext): Promise<boolean> {
  const cfg = await getConfig(c.env);
  return !(cfg.visibility === "private" && !c.var.user);
}

interface SolveJoin {
  challenge_id: number;
  name: string;
  category: string;
  created_at: number;
}

async function buildStats(
  c: AppContext,
  column: "user_id" | "team_id",
  id: number,
  rankMode: "users" | "teams" | null
) {
  const values = await challengeValues(c.env);
  const solves = await c.env.DB.prepare(
    `SELECT s.challenge_id, ch.name, ch.category, s.created_at
     FROM solves s JOIN challenges ch ON ch.id = s.challenge_id
     WHERE s.${column} = ? ORDER BY s.created_at`
  )
    .bind(id)
    .all<SolveJoin>();

  const awardCol = column; // awards use same column name
  const awards = await c.env.DB.prepare(
    `SELECT name, value, created_at FROM awards WHERE ${awardCol} = ? ORDER BY created_at`
  )
    .bind(id)
    .all<{ name: string; value: number; created_at: number }>();

  const hintCost = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(h.cost),0) AS c FROM hint_unlocks hu JOIN hints h ON h.id = hu.hint_id WHERE hu.${column} = ?`
  )
    .bind(id)
    .first<{ c: number }>();

  const solveList = solves.results.map((s) => ({
    challenge_id: s.challenge_id,
    name: s.name,
    category: s.category,
    value: values.get(s.challenge_id) ?? 0,
    created_at: s.created_at,
  }));

  const categories: Record<string, { count: number; points: number }> = {};
  let total = 0;
  const timeline: { time: number; score: number }[] = [];
  for (const s of solveList) {
    total += s.value;
    timeline.push({ time: s.created_at, score: total });
    const cat = (categories[s.category] ||= { count: 0, points: 0 });
    cat.count++;
    cat.points += s.value;
  }
  for (const a of awards.results) total += a.value;
  total -= hintCost?.c ?? 0;

  let rank: number | null = null;
  if (rankMode) {
    const standings = await computeStandings(c.env, rankMode, false);
    const idx = standings.findIndex((s) => s.account_id === id);
    rank = idx >= 0 ? idx + 1 : null;
  }

  return {
    score: total,
    rank,
    solve_count: solveList.length,
    solves: solveList,
    awards: awards.results,
    categories,
    timeline,
  };
}

app.get("/user/:id", async (c) => {
  if (!(await guard(c))) return c.json({ error: "Forbidden" }, 403);
  const cfg = await getConfig(c.env);
  const id = Number(c.req.param("id"));
  const user = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.affiliation, u.country, u.website, u.created_at, u.hidden, u.team_id, t.name AS team_name, b.name AS bracket_name
     FROM users u LEFT JOIN teams t ON t.id = u.team_id LEFT JOIN brackets b ON b.id = u.bracket_id
     WHERE u.id = ? AND u.banned = 0`
  )
    .bind(id)
    .first<any>();
  if (!user) return c.json({ error: "Not found" }, 404);
  const stats = await buildStats(c, "user_id", id, cfg.mode === "users" ? "users" : null);
  return c.json({ user, stats });
});

app.get("/team/:id", async (c) => {
  if (!(await guard(c))) return c.json({ error: "Forbidden" }, 403);
  const id = Number(c.req.param("id"));
  const team = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.affiliation, t.country, t.website, t.created_at, t.hidden, b.name AS bracket_name
     FROM teams t LEFT JOIN brackets b ON b.id = t.bracket_id WHERE t.id = ? AND t.banned = 0`
  )
    .bind(id)
    .first<any>();
  if (!team) return c.json({ error: "Not found" }, 404);
  const members = await c.env.DB.prepare("SELECT id, name, is_captain FROM users WHERE team_id = ?").bind(id).all();
  const stats = await buildStats(c, "team_id", id, "teams");
  return c.json({ team, members: members.results, stats });
});

export default app;
