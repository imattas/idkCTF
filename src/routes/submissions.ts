import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { getConfig, competitionState } from "../lib/config";
import { requireAuth } from "../middleware/auth";
import { checkFlag, nowSeconds } from "../lib/validate";
import { logEvent, EVENTS, extractMeta } from "../lib/events";
import {
  ABUSE_EVENTS,
  containsHoneypot,
  createOrUpdateReviewCase,
  fixedWindowLimit,
  generatedTeamFlag,
  honeypotToken,
  logAbuseEvent,
  scoreSolveRisk,
  setWrongFlagCooldown,
  wrongFlagCooldown,
} from "../lib/antiAbuse";

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
  if (!isAdmin && !u.verified) return c.json({ status: "error", message: "Verify your email before submitting" }, 403);
  if (!isAdmin && u.suspended) return c.json({ status: "error", message: "Your account is suspended pending admin review." }, 403);
  if (!isAdmin && cfg.mode === "teams" && u.team_id) {
    const teamState = await c.env.DB.prepare("SELECT banned, suspended FROM teams WHERE id = ?")
      .bind(u.team_id)
      .first<{ banned: number; suspended: number }>();
    if (teamState?.banned) return c.json({ status: "error", message: "Your team is banned." }, 403);
    if (teamState?.suspended) return c.json({ status: "error", message: "Your team is suspended pending admin review." }, 403);
  }

  const ch = await c.env.DB.prepare(
    `SELECT id, state, max_attempts, prerequisites, difficulty, value, generated_team_flags,
            (SELECT COUNT(*) FROM files f WHERE f.challenge_id = challenges.id) AS file_count
     FROM challenges WHERE id = ?`
  )
    .bind(challengeId)
    .first<{
      id: number;
      state: string;
      max_attempts: number;
      prerequisites: string | null;
      difficulty: string;
      value: number;
      generated_team_flags: number;
      file_count: number;
    }>();
  if (!ch || ch.state !== "visible") return c.json({ status: "error", message: "Challenge not found" }, 404);

  const account = cfg.mode === "teams" ? u.team_id : u.id;
  const col = cfg.mode === "teams" ? "team_id" : "user_id";
  if (account == null) return c.json({ status: "error", message: "Join a team before submitting" }, 400);

  if (!isAdmin && cfg.anti_abuse_enabled) {
    const cooldown = await wrongFlagCooldown(c.env, u.id, challengeId);
    if (cooldown > 0) {
      await logAbuseEvent(c, ABUSE_EVENTS.RATE_LIMIT, { challenge_id: challengeId, message: "wrong flag cooldown", metadata: { retry_after: cooldown } });
      return c.json({ status: "ratelimited", message: `Too many wrong attempts. Try again in ${cooldown}s.` }, 429);
    }
    const perChallenge = await fixedWindowLimit(c.env, `submit:challenge:${u.id}:${challengeId}`, cfg.submit_challenge_limit, cfg.submit_challenge_window);
    if (!perChallenge.allowed) {
      await logAbuseEvent(c, ABUSE_EVENTS.RATE_LIMIT, { challenge_id: challengeId, message: "user challenge submit limit", metadata: { retry_after: perChallenge.retryAfter } });
      return c.json({ status: "ratelimited", message: `Slow down. Try again in ${perChallenge.retryAfter}s.` }, 429);
    }
    const global = await fixedWindowLimit(c.env, `submit:global:${u.id}`, cfg.submit_global_limit, cfg.submit_global_window);
    if (!global.allowed) {
      await logAbuseEvent(c, ABUSE_EVENTS.RATE_LIMIT, { challenge_id: challengeId, message: "global user submit limit", metadata: { retry_after: global.retryAfter } });
      return c.json({ status: "ratelimited", message: `Too many submissions. Try again in ${global.retryAfter}s.` }, 429);
    }
  } else if (!isAdmin) {
    // Backstop when anti-abuse is disabled.
    const rlKey = `rl:submit:${u.id}`;
    const last = await c.env.SESSIONS.get(rlKey);
    if (last && now - Number(last) < THROTTLE_SECONDS)
      return c.json({ status: "ratelimited", message: "Slow down. Try again in a moment." }, 429);
    await c.env.SESSIONS.put(rlKey, String(now), { expirationTtl: 60 });
  }

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
  let correct = checkFlag(submitted, flags.results);
  let generatedFlagAccepted = false;
  const flagSecret = cfg.team_flag_secret || c.env.TEAM_FLAG_SECRET || cfg.honeypot_secret || c.env.HONEYPOT_SECRET || "";
  if (!correct && ch.generated_team_flags) {
    const expected = await generatedTeamFlag(account, challengeId, flagSecret);
    generatedFlagAccepted = submitted.trim() === expected;
    correct = generatedFlagAccepted;
  }
  let honeypotHit = false;
  if (!isAdmin && cfg.anti_abuse_enabled && cfg.honeypot_enabled) {
    const token = await honeypotToken(account, challengeId, cfg.honeypot_secret || c.env.HONEYPOT_SECRET || flagSecret);
    honeypotHit = containsHoneypot(submitted, token);
  }

  const ip = c.req.header("CF-Connecting-IP") || null;
  const sub = await c.env.DB.prepare(
    "INSERT INTO submissions (challenge_id, user_id, team_id, provided, correct, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(challengeId, u.id, isAdmin ? null : u.team_id, submitted, correct ? 1 : 0, ip, now)
    .run();
  const submissionId = Number(sub.meta.last_row_id);

  await logEvent(c, EVENTS.FLAG_SUBMIT, {
    challenge_id: challengeId,
    message: correct ? "correct" : "incorrect",
    metadata: { correct, provided: submitted.slice(0, 200) },
  });
  await logAbuseEvent(c, ABUSE_EVENTS.FLAG_SUBMITTED, {
    challenge_id: challengeId,
    submission_id: submissionId,
    message: correct ? "correct" : "incorrect",
    metadata: { correct, length: submitted.length, generated_flag_accepted: generatedFlagAccepted, honeypot_hit: honeypotHit },
  });
  await logAbuseEvent(c, correct ? ABUSE_EVENTS.CORRECT_FLAG : ABUSE_EVENTS.WRONG_FLAG, {
    challenge_id: challengeId,
    submission_id: submissionId,
    message: correct ? "correct" : "incorrect",
    metadata: { generated_flag_accepted: generatedFlagAccepted, honeypot_hit: honeypotHit },
  });
  if (honeypotHit) {
    await logAbuseEvent(c, ABUSE_EVENTS.HONEYPOT, {
      challenge_id: challengeId,
      submission_id: submissionId,
      message: "AI honeypot token submitted",
      metadata: { token_family: "ctfmeta/fakeflag" },
    });
  }

  if (!correct) {
    if (!isAdmin && cfg.anti_abuse_enabled) {
      const wrongs = await c.env.DB.prepare(
        "SELECT COUNT(*) AS n FROM submissions WHERE challenge_id = ? AND user_id = ? AND correct = 0"
      ).bind(challengeId, u.id).first<{ n: number }>();
      if ((wrongs?.n ?? 0) >= cfg.wrong_flag_cooldown_threshold) {
        await setWrongFlagCooldown(c.env, u.id, challengeId, cfg.wrong_flag_cooldown_seconds);
        await logAbuseEvent(c, ABUSE_EVENTS.RATE_LIMIT, {
          challenge_id: challengeId,
          submission_id: submissionId,
          message: "wrong flag cooldown armed",
          metadata: { wrong_attempts: wrongs?.n ?? 0, cooldown_seconds: cfg.wrong_flag_cooldown_seconds },
        });
      }
      if (honeypotHit) {
        const caseId = await createOrUpdateReviewCase(c.env, cfg, {
          user_id: u.id,
          team_id: u.team_id,
          challenge_id: challengeId,
          submission_id: submissionId,
          risk_score: cfg.honeypot_risk_weight,
          reason: "AI honeypot token submitted in an incorrect flag",
          evidence: { honeypot_hit: true, submission_id: submissionId },
        });
        if (caseId) await logAbuseEvent(c, ABUSE_EVENTS.REVIEW_CASE_CREATED, { challenge_id: challengeId, submission_id: submissionId, review_case_id: caseId, message: "Honeypot review case" });
      }
    }
    return c.json({ status: "incorrect", message: "Incorrect flag" });
  }
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

  if (cfg.anti_abuse_enabled) {
    const risk = await scoreSolveRisk(c.env, cfg, {
      user: u,
      accountId: account,
      accountColumn: col,
      challengeId,
      challengeDifficulty: ch.difficulty || "medium",
      challengeValue: ch.value,
      hasFiles: (ch.file_count ?? 0) > 0,
      teamSpecificFlags: !!ch.generated_team_flags,
      submissionId,
      submitted,
      honeypotHit,
      now,
    });
    const caseId = await createOrUpdateReviewCase(c.env, cfg, {
      user_id: u.id,
      team_id: u.team_id,
      challenge_id: challengeId,
      submission_id: submissionId,
      risk_score: risk.score,
      reason: risk.reasons.join("; ") || "Solve selected for admin review",
      evidence: { ...risk.evidence, reasons: risk.reasons, submission_id: submissionId },
    });
    if (caseId) {
      await logAbuseEvent(c, ABUSE_EVENTS.REVIEW_CASE_CREATED, {
        challenge_id: challengeId,
        submission_id: submissionId,
        review_case_id: caseId,
        message: `Risk score ${risk.score}`,
        metadata: { reasons: risk.reasons },
      });
    }
  }

  return c.json({ status: "correct", message: firstBlood ? "First blood!" : "Correct!", first_blood: firstBlood });
});

export default app;
