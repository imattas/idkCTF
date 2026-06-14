import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { getConfig } from "../lib/config";
import { requireAuth } from "../middleware/auth";
import { inviteCode } from "../lib/auth";
import { nowSeconds } from "../lib/validate";
import { logEvent, EVENTS } from "../lib/events";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("*", requireAuth);

async function teamModeOnly(c: any): Promise<boolean> {
  const cfg = await getConfig(c.env);
  return cfg.mode === "teams";
}

// Get my current team (with members), or null.
app.get("/me", async (c) => {
  const u = c.var.user!;
  if (!u.team_id) return c.json({ team: null });
  const team = await c.env.DB.prepare("SELECT * FROM teams WHERE id = ?").bind(u.team_id).first();
  if (!team) return c.json({ team: null });
  const members = await c.env.DB.prepare(
    "SELECT id, name, is_captain, affiliation, country FROM users WHERE team_id = ?"
  )
    .bind(u.team_id)
    .all();
  // Only the captain may see the invite code.
  const safe: any = { ...team };
  if (!u.is_captain) delete safe.invite_code;
  return c.json({ team: safe, members: members.results, is_captain: !!u.is_captain });
});

app.post("/create", async (c) => {
  if (!(await teamModeOnly(c))) return c.json({ error: "Not in team mode" }, 400);
  const u = c.var.user!;
  if (u.team_id) return c.json({ error: "You are already on a team" }, 400);
  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return c.json({ error: "Team name required" }, 400);

  const exists = await c.env.DB.prepare("SELECT id FROM teams WHERE name = ?").bind(name).first();
  if (exists) return c.json({ error: "Team name taken" }, 409);

  const code = inviteCode();
  const now = nowSeconds();
  const res = await c.env.DB.prepare(
    "INSERT INTO teams (name, invite_code, captain_id, affiliation, country, website, bracket_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(name, code, u.id, body.affiliation || null, body.country || null, body.website || null, body.bracket_id || null, now)
    .run();
  const teamId = res.meta.last_row_id as number;
  await c.env.DB.prepare("UPDATE users SET team_id = ?, is_captain = 1 WHERE id = ?")
    .bind(teamId, u.id)
    .run();
  await logEvent(c, EVENTS.TEAM_CREATE, { team_id: teamId, message: name });
  return c.json({ ok: true, team_id: teamId, invite_code: code });
});

app.post("/join", async (c) => {
  if (!(await teamModeOnly(c))) return c.json({ error: "Not in team mode" }, 400);
  const u = c.var.user!;
  if (u.team_id) return c.json({ error: "You are already on a team" }, 400);
  const body = await c.req.json().catch(() => ({}));
  const code = String(body.invite_code || "").trim().toUpperCase();
  if (!code) return c.json({ error: "Invite code required" }, 400);

  const team = await c.env.DB.prepare("SELECT id, banned FROM teams WHERE invite_code = ?")
    .bind(code)
    .first<{ id: number; banned: number }>();
  if (!team || team.banned) return c.json({ error: "Invalid invite code" }, 404);

  const cfg = await getConfig(c.env);
  if (cfg.team_size_limit > 0) {
    const countRow = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE team_id = ?")
      .bind(team.id)
      .first<{ n: number }>();
    if ((countRow?.n ?? 0) >= cfg.team_size_limit)
      return c.json({ error: "Team is full" }, 403);
  }

  await c.env.DB.prepare("UPDATE users SET team_id = ?, is_captain = 0 WHERE id = ?")
    .bind(team.id, u.id)
    .run();
  await logEvent(c, EVENTS.TEAM_JOIN, { team_id: team.id });
  return c.json({ ok: true, team_id: team.id });
});

app.post("/leave", async (c) => {
  const u = c.var.user!;
  if (!u.team_id) return c.json({ error: "Not on a team" }, 400);
  // Prevent leaving after the team has scored to avoid splitting solves.
  const solved = await c.env.DB.prepare("SELECT 1 FROM solves WHERE team_id = ? LIMIT 1")
    .bind(u.team_id)
    .first();
  if (solved) return c.json({ error: "Cannot leave a team that has already solved challenges" }, 400);
  await c.env.DB.prepare("UPDATE users SET team_id = NULL, is_captain = 0 WHERE id = ?")
    .bind(u.id)
    .run();
  return c.json({ ok: true });
});

// Captain: rotate invite code.
app.post("/rotate-code", async (c) => {
  const u = c.var.user!;
  if (!u.team_id || !u.is_captain) return c.json({ error: "Captain only" }, 403);
  const code = inviteCode();
  await c.env.DB.prepare("UPDATE teams SET invite_code = ? WHERE id = ?").bind(code, u.team_id).run();
  return c.json({ ok: true, invite_code: code });
});

// Public team profile (id) with solves.
app.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const team = await c.env.DB.prepare(
    "SELECT id, name, affiliation, country, website, created_at FROM teams WHERE id = ? AND banned = 0"
  )
    .bind(id)
    .first();
  if (!team) return c.json({ error: "Not found" }, 404);
  const members = await c.env.DB.prepare("SELECT id, name FROM users WHERE team_id = ?").bind(id).all();
  return c.json({ team, members: members.results });
});

export default app;
