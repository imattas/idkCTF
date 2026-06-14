import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { getConfig } from "../lib/config";
import { requireAuth } from "../middleware/auth";
import { nowSeconds } from "../lib/validate";
import { logEvent, EVENTS } from "../lib/events";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("*", requireAuth);

// Unlock (pay for) a hint. In team mode the unlock is shared across the team.
app.post("/:id/unlock", async (c) => {
  const u = c.var.user!;
  const hintId = Number(c.req.param("id"));
  const cfg = await getConfig(c.env);

  const hint = await c.env.DB.prepare("SELECT id, cost FROM hints WHERE id = ?")
    .bind(hintId)
    .first<{ id: number; cost: number }>();
  if (!hint) return c.json({ error: "Hint not found" }, 404);

  if (cfg.mode === "teams" && !u.team_id)
    return c.json({ error: "Join a team before unlocking hints" }, 400);

  // Already unlocked (by me, or by a teammate in team mode)?
  const existing = await c.env.DB.prepare(
    "SELECT 1 FROM hint_unlocks WHERE hint_id = ? AND (user_id = ? OR (team_id IS NOT NULL AND team_id = ?))"
  )
    .bind(hintId, u.id, u.team_id)
    .first();
  if (existing) {
    const content = await c.env.DB.prepare("SELECT content FROM hints WHERE id = ?")
      .bind(hintId)
      .first<{ content: string }>();
    return c.json({ ok: true, content: content?.content });
  }

  await c.env.DB.prepare(
    "INSERT INTO hint_unlocks (hint_id, user_id, team_id, created_at) VALUES (?, ?, ?, ?)"
  )
    .bind(hintId, u.id, u.team_id, nowSeconds())
    .run();

  const content = await c.env.DB.prepare("SELECT content FROM hints WHERE id = ?")
    .bind(hintId)
    .first<{ content: string }>();
  await logEvent(c, EVENTS.HINT_UNLOCK, { metadata: { hint_id: hintId, cost: hint.cost } });
  return c.json({ ok: true, content: content?.content });
});

export default app;
