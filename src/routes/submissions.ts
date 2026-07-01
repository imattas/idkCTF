import { Hono } from "hono";
import type { Env, Variables, AppContext, SessionUser } from "../types";
import { getConfig, competitionState } from "../lib/config";
import { requireAuth } from "../middleware/auth";
import { checkFlag, nowSeconds } from "../lib/validate";
import { logEvent, EVENTS, extractMeta } from "../lib/events";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("*", requireAuth);

const THROTTLE_SECONDS = 2;

app.post("/:id", async (c) => {
  const u = c.var.user!;
  const challengeId = Number(c.req.param("id"));
  const cfg = await getConfig(c.env);
  const now = nowSeconds();
  const isAdmin = u.role === "admin";

  const state = competitionState(cfg, now);
  if (state === "before") return c.json({ status: "closed", message: "Competition has not started" }, 403);
  if (state === "ended") return c.json({ status: "closed", message: "Competition is over" }, 403);
  if (cfg.paused) return c.json({ status: "closed", message: "Submissions are paused" }, 403);

  // Optional VPN/proxy blocking.
  if (cfg.block_vpn) {
    const meta = extractMeta(c);
    if (meta.is_vpn) {
      await logEvent(c, EVENTS.VPN_BLOCKED, { challenge_id: challengeId, message: `Blocked submission from ${meta.as_org ?? "unknown network"}` });
      return c.json({ status: "blocked", message: "Submissions from VPN/proxy networks are not allowed" }, 403);
    }
  }

  if (!isAdmin && cfg.mode === "teams" && !u.team_id)
    return c.json({ status: "error", message: "Join a team before submitting" }, 400);

  // Simple per-user throttle to deter brute forcing. KV requires a TTL >= 60s,
  // so we store the last-submit timestamp (TTL 60) and compare elapsed time.
  const rlKey = `rl:submit:${u.id}`;
  const last = await c.env.SESSIONS.get(rlKey);
  if (last && now - Number(last) < THROTTLE_SECONDS)
    return c.json({ status: "ratelimited", message: "Slow down. Try again in a moment." }, 429);
  await c.env.SESSIONS.put(rlKey, String(now), { expirationTtl: 60 });

  const ch = await c.env.DB.prepare(
    "SELECT id, state, max_attempts, prerequisites FROM challenges WHERE id = ?"
  )
    .bind(challengeId)
    .first<{ id: number; state: string; max_attempts: number; prerequisites: string | null }>();
  if (!ch || ch.state !== "visible") return c.json({ status: "error", message: "Challenge not found" }, 404);

  const account = cfg.mode === "teams" ? u.team_id : u.id;
  const col = cfg.mode === "teams" ? "team_id" : "user_id";

  // Prerequisite lock: all listed challenges must be solved by this account first.
  let prereqs: number[] = [];
  try { const a = JSON.parse(ch.prerequisites || "[]"); if (Array.isArray(a)) prereqs = a.map(Number); } catch {}
  if (!isAdmin && prereqs.length) {
    const ph = prereqs.map(() => "?").join(",");
    const solvedCount = await c.env.DB.prepare(
      `SELECT COUNT(DISTINCT s.challenge_id) AS n
       FROM solves s JOIN users solver ON solver.id = s.user_id
       WHERE solver.role = 'user' AND s.${col} = ? AND s.challenge_id IN (${ph})`
    )
      .bind(account, ...prereqs)
      .first<{ n: number }>();
    if ((solvedCount?.n ?? 0) < prereqs.length)
      return c.json({ status: "locked", message: "Solve the prerequisite challenges first" }, 403);
  }

  // Already solved?
  if (!isAdmin) {
    const already = await c.env.DB.prepare(
      `SELECT 1
       FROM solves s JOIN users solver ON solver.id = s.user_id
       WHERE solver.role = 'user' AND s.challenge_id = ? AND s.${col} = ?`
    )
      .bind(challengeId, account)
      .first();
    if (already) return c.json({ status: "already_solved", message: "You already solved this" });
  }

  // Attempt limit counts every submitted guess from the scoring account.
  if (!isAdmin && ch.max_attempts > 0) {
    const attemptCol = cfg.mode === "teams" ? "team_id" : "user_id";
    const cnt = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n
       FROM submissions s JOIN users submitter ON submitter.id = s.user_id
       WHERE submitter.role = 'user' AND s.challenge_id = ? AND s.${attemptCol} = ?`
    )
      .bind(challengeId, account)
      .first<{ n: number }>();
    if ((cnt?.n ?? 0) >= ch.max_attempts)
      return c.json({ status: "out_of_attempts", message: "No attempts remaining" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const submitted = String(body.flag || body.submission || "");
  if (!submitted.trim()) return c.json({ status: "error", message: "Empty submission" }, 400);

  const flags = await c.env.DB.prepare("SELECT type, content FROM flags WHERE challenge_id = ?")
    .bind(challengeId)
    .all<{ type: string; content: string }>();
  const correct = checkFlag(submitted, flags.results);

  const ip = c.req.header("CF-Connecting-IP") || null;
  await c.env.DB.prepare(
    "INSERT INTO submissions (challenge_id, user_id, team_id, provided, correct, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(challengeId, u.id, isAdmin ? null : u.team_id, submitted, correct ? 1 : 0, ip, now)
    .run();

  await logEvent(c, EVENTS.FLAG_SUBMIT, {
    challenge_id: challengeId,
    message: correct ? "correct" : "incorrect",
    metadata: { correct, provided: submitted.slice(0, 200) },
  });

  if (!correct) return c.json({ status: "incorrect", message: "Incorrect flag" });
  if (isAdmin) return c.json({ status: "correct", message: "Correct (admin check; not scored)", admin_check: true });

  // Count prior solves to detect first blood.
  const prior = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n
     FROM solves s JOIN users u ON u.id = s.user_id
     WHERE s.challenge_id = ? AND u.role = 'user'`
  )
    .bind(challengeId)
    .first<{ n: number }>();

  // Record the solve. Unique constraints guard against races / duplicate team solves.
  try {
    await c.env.DB.prepare(
      "INSERT INTO solves (challenge_id, user_id, team_id, created_at) VALUES (?, ?, ?, ?)"
    )
      .bind(challengeId, u.id, u.team_id, now)
      .run();
  } catch {
    return c.json({ status: "already_solved", message: "Already solved by your team" });
  }

  const firstBlood = (prior?.n ?? 0) === 0;
  // Plugins subscribed to "solve" also receive first_blood (handled in dispatch).
  await logEvent(c, firstBlood ? EVENTS.FIRST_BLOOD : EVENTS.SOLVE, { challenge_id: challengeId });

  if (cfg.auto_review) await autoReview(c, u, account!, col, challengeId, now, cfg.review_fast_solve_seconds);

  return c.json({ status: "correct", message: firstBlood ? "First blood!" : "Correct!", first_blood: firstBlood });
});

// Flag suspicious solves: solved without ever viewing, suspiciously fast after
// first view, or several solves in rapid succession.
async function autoReview(c: AppContext, u: SessionUser, account: number, col: string, challengeId: number, now: number, fastSeconds: number) {
  const flag = async (type: string, detail: string) => {
    try {
      await c.env.DB.prepare(
        "INSERT OR IGNORE INTO review_flags (user_id, team_id, challenge_id, type, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(u.id, u.team_id, challengeId, type, detail, now).run();
      await logEvent(c, EVENTS.REVIEW_FLAG, { challenge_id: challengeId, message: `${type}: ${detail}` });
    } catch {}
  };

  const view = await c.env.DB.prepare(
    `SELECT MIN(created_at) AS t FROM events WHERE type = 'challenge.view' AND challenge_id = ? AND ${col} = ?`
  ).bind(challengeId, account).first<{ t: number | null }>();

  if (!view?.t) {
    await flag("no_view", "Solved without ever opening the challenge");
  } else if (now - view.t < fastSeconds) {
    await flag("fast_solve", `Solved ${now - view.t}s after first viewing (< ${fastSeconds}s)`);
  }

  const prev = await c.env.DB.prepare(
    `SELECT s.created_at
     FROM solves s JOIN users solver ON solver.id = s.user_id
     WHERE solver.role = 'user' AND s.${col} = ? AND s.challenge_id != ?
     ORDER BY s.created_at DESC LIMIT 1`
  ).bind(account, challengeId).first<{ created_at: number }>();
  if (prev && now - prev.created_at < 15) {
    await flag("rapid", `Two solves within ${now - prev.created_at}s`);
  }
}

export default app;
