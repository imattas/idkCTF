import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { requireAuth } from "../middleware/auth";
import { getConfig } from "../lib/config";
import { computeStandings } from "../lib/standings";
import { nowSeconds } from "../lib/validate";
import { logAbuseEvent, ABUSE_EVENTS } from "../lib/antiAbuse";

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

app.get("/review-cases", async (c) => {
  const a = await account(c);
  const u = c.var.user!;
  const rows = await c.env.DB.prepare(
    `SELECT rc.id, rc.challenge_id, ch.name AS challenge_name, rc.risk_score, rc.status, rc.reason,
            rc.proof_state, rc.proof_requested_at, rc.proof_submitted_at, rc.resolution, rc.resolved_at,
            rc.leaderboard_frozen, rc.prize_disqualified, rc.suspended, rc.banned, rc.created_at, rc.updated_at
     FROM review_cases rc
     LEFT JOIN challenges ch ON ch.id = rc.challenge_id
     WHERE rc.user_id = ? OR (? IS NOT NULL AND rc.team_id = ?)
     ORDER BY rc.updated_at DESC
     LIMIT 50`
  ).bind(u.id, a.id, a.id).all();
  return c.json({ cases: rows.results });
});

app.post("/review-cases/:id/proof", async (c) => {
  const id = Number(c.req.param("id"));
  const a = await account(c);
  const u = c.var.user!;
  const rc = await c.env.DB.prepare(
    "SELECT id, user_id, team_id, proof_state FROM review_cases WHERE id = ? AND (user_id = ? OR (? IS NOT NULL AND team_id = ?))"
  ).bind(id, u.id, a.id, a.id).first<{ id: number; user_id: number | null; team_id: number | null; proof_state: string }>();
  if (!rc) return c.json({ error: "Not found" }, 404);

  const contentType = c.req.header("Content-Type") || "";
  let proofText = "";
  let fileName: string | null = null;
  let fileType: string | null = null;
  let fileData: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    proofText = String(form.get("proof") || "").trim();
    const file = form.get("attachment") as unknown as { arrayBuffer(): Promise<ArrayBuffer>; name: string; type: string } | string | null;
    if (file && typeof file !== "string") {
      const buf = new Uint8Array(await file.arrayBuffer());
      if (buf.length > 1024 * 1024) return c.json({ error: "Attachment too large (max 1MB)." }, 413);
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      fileName = file.name;
      fileType = file.type || "application/octet-stream";
      fileData = btoa(bin);
    }
  } else {
    const body = await c.req.json().catch(() => ({}));
    proofText = String(body.proof || body.explanation || "").trim();
  }
  if (!proofText && !fileData) return c.json({ error: "Proof text or an attachment is required." }, 400);
  const now = nowSeconds();
  await c.env.DB.prepare(
    `UPDATE review_cases
     SET proof_state = 'submitted', proof_submitted_at = ?, proof_text = ?, proof_attachment_name = ?,
         proof_attachment_type = ?, proof_attachment_data = ?, updated_at = ?
     WHERE id = ?`
  ).bind(now, proofText || null, fileName, fileType, fileData, now, id).run();
  await logAbuseEvent(c, ABUSE_EVENTS.ADMIN_ACTION, {
    user_id: u.id,
    team_id: rc.team_id,
    review_case_id: id,
    message: "Proof submitted",
    metadata: { has_attachment: !!fileData },
  });
  return c.json({ ok: true });
});

app.get("/appeals", async (c) => {
  const a = await account(c);
  const u = c.var.user!;
  const rows = await c.env.DB.prepare(
    `SELECT id, review_case_id, target_type, target_id, reason, status, resolution, created_at
     FROM appeals
     WHERE user_id = ? OR (? IS NOT NULL AND team_id = ?)
     ORDER BY id DESC
     LIMIT 50`
  ).bind(u.id, a.id, a.id).all();
  return c.json({ appeals: rows.results });
});

app.post("/appeals", async (c) => {
  const a = await account(c);
  const u = c.var.user!;
  const body = await c.req.json().catch(() => ({}));
  const reason = String(body.reason || "").trim();
  if (!reason) return c.json({ error: "Appeal reason is required." }, 400);
  const now = nowSeconds();
  const res = await c.env.DB.prepare(
    "INSERT INTO appeals (user_id, team_id, review_case_id, target_type, target_id, email, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    u.id,
    a.mode === "teams" ? a.id : null,
    body.review_case_id || null,
    String(body.target_type || "review_case"),
    body.target_id || null,
    u.email,
    reason,
    now
  ).run();
  await logAbuseEvent(c, ABUSE_EVENTS.APPEAL_CREATED, {
    user_id: u.id,
    team_id: a.mode === "teams" ? a.id : null,
    review_case_id: body.review_case_id || null,
    message: "Appeal created",
    metadata: { appeal_id: res.meta.last_row_id },
  });
  return c.json({ ok: true });
});

export default app;
