import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { getConfig } from "../lib/config";
import { computeStandings, challengeValues } from "../lib/standings";
import { nowSeconds } from "../lib/validate";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

async function access(c: any): Promise<{ ok: boolean; status?: number; cfg: any; cutoff: number | null; isAdmin: boolean }> {
  const cfg = await getConfig(c.env);
  const isAdmin = c.var.user?.role === "admin";
  if (cfg.visibility === "private" && !c.var.user) return { ok: false, status: 403, cfg, cutoff: null, isAdmin };
  if (!cfg.scoreboard_visible && !isAdmin) return { ok: false, status: 403, cfg, cutoff: null, isAdmin };
  const now = nowSeconds();
  const cutoff = !isAdmin && cfg.freeze_time && now > cfg.freeze_time ? cfg.freeze_time : null;
  return { ok: true, cfg, cutoff, isAdmin };
}

app.get("/", async (c) => {
  const a = await access(c);
  if (!a.ok) return c.json({ error: "Scoreboard hidden" }, a.status as any);
  const bracket = c.req.query("bracket") ? Number(c.req.query("bracket")) : null;
  const standings = await computeStandings(c.env, a.cfg.mode, a.isAdmin, a.cutoff, bracket);
  const ranked = standings.map((s, i) => ({
    rank: i + 1,
    account_id: s.account_id,
    name: s.name,
    score: s.score,
    solves: s.solve_count,
  }));
  return c.json({ mode: a.cfg.mode, frozen: a.cutoff != null, standings: ranked });
});

// Score-over-time data for the top N accounts.
app.get("/graph", async (c) => {
  const a = await access(c);
  if (!a.ok) return c.json({ error: "Scoreboard hidden" }, a.status as any);
  const top = Number(c.req.query("top") || 10);
  const bracket = c.req.query("bracket") ? Number(c.req.query("bracket")) : null;
  const standings = (await computeStandings(c.env, a.cfg.mode, a.isAdmin, a.cutoff, bracket)).slice(0, top);
  const values = await challengeValues(c.env, a.cutoff);
  const ids = standings.map((s) => s.account_id);
  if (!ids.length) return c.json({ series: [] });

  const col = a.cfg.mode === "teams" ? "team_id" : "user_id";
  const andCutoff = a.cutoff ? ` AND created_at <= ${a.cutoff}` : "";
  const placeholders = ids.map(() => "?").join(",");

  const solves = await c.env.DB.prepare(
    `SELECT ${col} AS acct, challenge_id, created_at FROM solves WHERE ${col} IN (${placeholders})${andCutoff}`
  )
    .bind(...ids)
    .all<{ acct: number; challenge_id: number; created_at: number }>();

  const byAcct = new Map<number, { t: number; delta: number }[]>();
  for (const id of ids) byAcct.set(id, []);
  for (const s of solves.results) {
    byAcct.get(s.acct)?.push({ t: s.created_at, delta: values.get(s.challenge_id) ?? 0 });
  }

  const series = standings.map((s) => {
    const events = (byAcct.get(s.account_id) || []).sort((x, y) => x.t - y.t);
    let total = 0;
    const points = events.map((e) => {
      total += e.delta;
      return { time: e.t, score: total };
    });
    return { name: s.name, points };
  });
  return c.json({ series });
});

export default app;
