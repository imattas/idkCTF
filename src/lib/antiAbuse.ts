import type { AppContext, Env, SessionUser } from "../types";
import type { SiteConfig } from "./config";
import { sha256hex } from "./auth";
import { nowSeconds } from "./validate";

export const ABUSE_EVENTS = {
  CHALLENGE_OPENED: "challenge.opened",
  FILE_DOWNLOADED: "challenge.file_downloaded",
  FLAG_SUBMITTED: "flag.submitted",
  WRONG_FLAG: "flag.wrong",
  CORRECT_FLAG: "flag.correct",
  HINT_VIEWED: "hint.viewed",
  TEAM_JOINED: "team.joined",
  TEAM_LEFT: "team.left",
  RATE_LIMIT: "rate_limit.triggered",
  REVIEW_CASE_CREATED: "review_case.created",
  ADMIN_ACTION: "admin.action",
  APPEAL_CREATED: "appeal.created",
  HONEYPOT: "ai_honeypot.triggered",
} as const;

export interface AbuseEventOpts {
  user_id?: number | null;
  team_id?: number | null;
  challenge_id?: number | null;
  submission_id?: number | null;
  review_case_id?: number | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
}

export interface LimitResult {
  allowed: boolean;
  retryAfter: number;
}

export interface RiskInput {
  user: SessionUser;
  accountId: number;
  accountColumn: "team_id" | "user_id";
  challengeId: number;
  challengeDifficulty: string;
  challengeValue: number;
  hasFiles: boolean;
  teamSpecificFlags: boolean;
  submissionId: number;
  submitted: string;
  honeypotHit: boolean;
  now: number;
}

export interface RiskResult {
  score: number;
  reasons: string[];
  evidence: Record<string, unknown>;
}

const DEFAULT_SECRET = "idkctf-local-dev-secret-change-me";

function textEncoder() {
  return new TextEncoder();
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256Hex(secret: string, input: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder().encode(secret || DEFAULT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, textEncoder().encode(input));
  return bytesToHex(new Uint8Array(sig));
}

export async function hashEvidence(value: string | null | undefined, secret: string): Promise<string | null> {
  if (!value) return null;
  return hmacSha256Hex(secret || DEFAULT_SECRET, value);
}

export async function generatedTeamFlag(teamId: number, challengeId: number, secret: string): Promise<string> {
  const hex = await hmacSha256Hex(secret || DEFAULT_SECRET, `${teamId}:${challengeId}`);
  return `flag{${hex.slice(0, 24)}}`;
}

export async function honeypotToken(userOrTeamId: number, challengeId: number, secret: string): Promise<string> {
  const hex = await hmacSha256Hex(secret || DEFAULT_SECRET, `${userOrTeamId}:${challengeId}:honeypot`);
  return `ctfmeta_${hex.slice(0, 16)}`;
}

export function containsHoneypot(submitted: string, expectedToken: string): boolean {
  const s = submitted.toLowerCase();
  return s.includes("fakeflag{") || (!!expectedToken && s.includes(expectedToken.toLowerCase()));
}

const CHECKLIST_KEYS = [
  "intended_solve_path",
  "writeup",
  "reviewer_tested",
  "flag_validation",
  "files_attached",
  "remote_health_check",
  "no_guessing",
  "difficulty_calibrated",
] as const;

export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

export function parseChecklist(raw: string | null | undefined): Record<ChecklistKey, boolean> {
  const out = Object.fromEntries(CHECKLIST_KEYS.map((key) => [key, false])) as Record<ChecklistKey, boolean>;
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw);
    for (const key of CHECKLIST_KEYS) out[key] = !!parsed?.[key];
  } catch {}
  return out;
}

export function checklistComplete(raw: string | null | undefined): boolean {
  const checklist = parseChecklist(raw);
  return CHECKLIST_KEYS.every((key) => checklist[key]);
}

export function normalizeChecklist(input: unknown): string {
  const out = Object.fromEntries(CHECKLIST_KEYS.map((key) => [key, false])) as Record<ChecklistKey, boolean>;
  if (input && typeof input === "object") {
    for (const key of CHECKLIST_KEYS) out[key] = !!(input as Record<string, unknown>)[key];
  }
  return JSON.stringify(out);
}

async function evidenceSecret(env: Env): Promise<string> {
  const envSecret = env.HONEYPOT_SECRET || env.TEAM_FLAG_SECRET;
  if (envSecret) return envSecret;
  try {
    const rows = await env.DB.prepare(
      "SELECT key, value FROM config WHERE key IN ('honeypot_secret', 'team_flag_secret')"
    ).all<{ key: string; value: string }>();
    const cfg = new Map(rows.results.map((row) => [row.key, row.value]));
    return cfg.get("honeypot_secret") || cfg.get("team_flag_secret") || DEFAULT_SECRET;
  } catch {
    return DEFAULT_SECRET;
  }
}

export async function logAbuseEvent(c: AppContext, type: string, opts: AbuseEventOpts = {}): Promise<void> {
  const user = c.var.user;
  const secret = await evidenceSecret(c.env);
  const ip = c.req.header("CF-Connecting-IP") || null;
  const ua = c.req.header("User-Agent") || null;
  const userId = Object.prototype.hasOwnProperty.call(opts, "user_id") ? opts.user_id ?? null : user?.id ?? null;
  const teamId = Object.prototype.hasOwnProperty.call(opts, "team_id") ? opts.team_id ?? null : user?.team_id ?? null;
  try {
    await c.env.DB.prepare(
      `INSERT INTO anti_abuse_events
       (type, user_id, team_id, challenge_id, submission_id, review_case_id, ip_hash, user_agent_hash, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        type,
        userId,
        teamId,
        opts.challenge_id ?? null,
        opts.submission_id ?? null,
        opts.review_case_id ?? null,
        await hashEvidence(ip, secret),
        await hashEvidence(ua, secret),
        opts.message ?? null,
        opts.metadata ? JSON.stringify(opts.metadata) : null,
        nowSeconds()
      )
      .run();
  } catch (e) {
    console.error("anti-abuse event insert failed", e);
  }
}

export async function fixedWindowLimit(env: Env, key: string, max: number, windowSec: number): Promise<LimitResult> {
  const now = nowSeconds();
  const k = `aa:rl:${key}`;
  let count = 0;
  let reset = now + Math.max(1, windowSec);
  const raw = await env.SESSIONS.get(k);
  if (raw) {
    try {
      const d = JSON.parse(raw);
      if (Number(d.reset) > now) {
        count = Number(d.count) || 0;
        reset = Number(d.reset);
      }
    } catch {}
  }
  if (count >= max) return { allowed: false, retryAfter: Math.max(1, reset - now) };
  await env.SESSIONS.put(k, JSON.stringify({ count: count + 1, reset }), { expirationTtl: Math.max(60, reset - now) });
  return { allowed: true, retryAfter: 0 };
}

export async function wrongFlagCooldown(env: Env, userId: number, challengeId: number): Promise<number> {
  const raw = await env.SESSIONS.get(`aa:cooldown:${userId}:${challengeId}`);
  if (!raw) return 0;
  const until = Number(raw);
  return Math.max(0, until - nowSeconds());
}

export async function setWrongFlagCooldown(env: Env, userId: number, challengeId: number, seconds: number): Promise<void> {
  if (seconds <= 0) return;
  const until = nowSeconds() + seconds;
  await env.SESSIONS.put(`aa:cooldown:${userId}:${challengeId}`, String(until), { expirationTtl: Math.max(60, seconds) });
}

export function clampRisk(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function caseStatusForRisk(cfg: SiteConfig, score: number): string {
  if (score >= cfg.risk_high_review_threshold) return "high_risk";
  if (score >= cfg.risk_proof_required_threshold) return "proof_required";
  if (score >= cfg.risk_soft_review_threshold) return "open";
  return "monitor";
}

export async function scoreSolveRisk(env: Env, cfg: SiteConfig, input: RiskInput): Promise<RiskResult> {
  const reasons: string[] = [];
  const evidence: Record<string, unknown> = {};
  let score = 0;
  const bindAccount = [input.challengeId, input.accountId];

  const view = await env.DB.prepare(
    `SELECT MIN(created_at) AS t FROM anti_abuse_events
     WHERE type = ? AND challenge_id = ? AND ${input.accountColumn} = ?`
  ).bind(ABUSE_EVENTS.CHALLENGE_OPENED, ...bindAccount).first<{ t: number | null }>();
  if (!view?.t) {
    score += 22;
    reasons.push("solved without opening challenge");
    evidence.no_view = true;
  } else {
    const delta = input.now - view.t;
    evidence.seconds_after_open = delta;
    if (delta < cfg.review_fast_solve_seconds) {
      score += 26;
      reasons.push(`very fast solve (${delta}s after opening)`);
    }
  }

  if (input.hasFiles && ["medium", "hard", "insane"].includes(input.challengeDifficulty)) {
    const downloads = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM anti_abuse_events
       WHERE type = ? AND challenge_id = ? AND ${input.accountColumn} = ?`
    ).bind(ABUSE_EVENTS.FILE_DOWNLOADED, ...bindAccount).first<{ n: number }>();
    evidence.file_downloads = downloads?.n ?? 0;
    if ((downloads?.n ?? 0) === 0) {
      score += 18;
      reasons.push("no file download before solving downloadable challenge");
    }
  }

  const wrongs = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM submissions
     WHERE challenge_id = ? AND ${input.accountColumn} = ? AND correct = 0`
  ).bind(input.challengeId, input.accountId).first<{ n: number }>();
  evidence.wrong_attempts = wrongs?.n ?? 0;
  if ((wrongs?.n ?? 0) >= 8) {
    score += 12;
    reasons.push("many wrong attempts before solve");
  }

  if (input.teamSpecificFlags) {
    const shared = await env.DB.prepare(
      `SELECT COUNT(DISTINCT COALESCE(team_id, user_id)) AS n FROM submissions
       WHERE challenge_id = ? AND provided = ? AND correct = 1 AND COALESCE(team_id, user_id) != ?`
    ).bind(input.challengeId, input.submitted, input.accountId).first<{ n: number }>();
    evidence.same_flag_other_accounts = shared?.n ?? 0;
    if ((shared?.n ?? 0) > 0) {
      score += 18;
      reasons.push("same team-specific flag reused across accounts");
    }
  } else {
    evidence.same_flag_other_accounts = "not_scored_for_static_flags";
  }

  const clusters = await env.DB.prepare(
    `SELECT COUNT(DISTINCT COALESCE(team_id, user_id)) AS n
     FROM anti_abuse_events
     WHERE challenge_id = ? AND ip_hash IN (
       SELECT ip_hash FROM anti_abuse_events WHERE submission_id = ? AND ip_hash IS NOT NULL
     )`
  ).bind(input.challengeId, input.submissionId).first<{ n: number }>();
  evidence.same_ip_hash_accounts = clusters?.n ?? 0;
  if ((clusters?.n ?? 0) >= 3) {
    score += 14;
    reasons.push("shared hashed IP cluster across accounts");
  }

  if (["hard", "insane"].includes(input.challengeDifficulty)) {
    const burst = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM solves
       WHERE ${input.accountColumn} = ? AND created_at >= ?`
    ).bind(input.accountId, input.now - 300).first<{ n: number }>();
    evidence.hard_solve_burst_5m = burst?.n ?? 0;
    if ((burst?.n ?? 0) >= 3) {
      score += 14;
      reasons.push("hard challenge solve burst");
    }
  }

  const hints = await env.DB.prepare(
    `SELECT COUNT(*) AS n
     FROM hint_unlocks hu
     JOIN hints h ON h.id = hu.hint_id
     WHERE h.challenge_id = ? AND hu.${input.accountColumn} = ?`
  ).bind(input.challengeId, input.accountId).first<{ n: number }>().catch(() => null);
  evidence.hints_used = hints?.n ?? 0;
  if ((hints?.n ?? 0) > 0) score = Math.max(0, score - 5);

  if (input.honeypotHit) {
    score += cfg.honeypot_risk_weight;
    reasons.push("AI honeypot token submitted");
    evidence.honeypot_hit = true;
  }

  return { score: clampRisk(score), reasons, evidence };
}

export async function createOrUpdateReviewCase(env: Env, cfg: SiteConfig, input: {
  user_id: number;
  team_id: number | null;
  challenge_id: number | null;
  submission_id?: number | null;
  risk_score: number;
  reason: string;
  evidence: Record<string, unknown>;
}): Promise<number | null> {
  if (!cfg.anti_abuse_enabled) return null;
  if (input.risk_score < cfg.risk_soft_review_threshold && !input.evidence.honeypot_hit) return null;
  const now = nowSeconds();
  const status = caseStatusForRisk(cfg, input.risk_score);
  const proofState = input.risk_score >= cfg.proof_threshold ? "requested" : "not_required";
  const existing = input.submission_id
    ? await env.DB.prepare("SELECT id FROM review_cases WHERE submission_id = ?").bind(input.submission_id).first<{ id: number }>()
    : null;
  if (existing) {
    await env.DB.prepare(
      `UPDATE review_cases
       SET risk_score = ?, status = ?, reason = ?, evidence = ?, proof_state = CASE WHEN proof_state = 'not_required' THEN ? ELSE proof_state END,
           proof_requested_at = CASE WHEN proof_requested_at IS NULL AND ? = 'requested' THEN ? ELSE proof_requested_at END,
           updated_at = ?
       WHERE id = ?`
    ).bind(input.risk_score, status, input.reason, JSON.stringify(input.evidence), proofState, proofState, now, now, existing.id).run();
    return existing.id;
  }

  const res = await env.DB.prepare(
    `INSERT INTO review_cases
     (user_id, team_id, challenge_id, submission_id, risk_score, status, reason, evidence, proof_state, proof_requested_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    input.user_id,
    input.team_id,
    input.challenge_id,
    input.submission_id ?? null,
    input.risk_score,
    status,
    input.reason,
    JSON.stringify(input.evidence),
    proofState,
    proofState === "requested" ? now : null,
    now,
    now
  ).run();
  const id = Number(res.meta.last_row_id);

  if (cfg.leaderboard_review_enabled && input.risk_score >= cfg.leaderboard_review_threshold) {
    if (input.team_id) await env.DB.prepare("UPDATE teams SET under_review = 1 WHERE id = ?").bind(input.team_id).run();
    else await env.DB.prepare("UPDATE users SET under_review = 1 WHERE id = ?").bind(input.user_id).run();
    await env.DB.prepare("UPDATE review_cases SET leaderboard_frozen = 1 WHERE id = ?").bind(id).run();
  }
  return id;
}

export async function logAdminReviewAction(c: AppContext, caseId: number, message: string, metadata?: Record<string, unknown>) {
  await logAbuseEvent(c, ABUSE_EVENTS.ADMIN_ACTION, { review_case_id: caseId, message, metadata });
}
