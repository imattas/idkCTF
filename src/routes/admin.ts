import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { requireAdmin } from "../middleware/auth";
import { getConfig, setConfig } from "../lib/config";
import { randomToken, hashPassword } from "../lib/auth";
import { nowSeconds } from "../lib/validate";
import { deliverDiscord, listWebhooks, getWebhook, createWebhook, updateWebhook, deleteWebhook } from "../lib/plugins";
import { sendEmail } from "../lib/email";
import { logEvent, EVENTS } from "../lib/events";
import { listBans, addBan, removeBan } from "../lib/bans";
import {
  ABUSE_EVENTS,
  checklistComplete,
  logAbuseEvent,
  logAdminReviewAction,
  normalizeChecklist,
} from "../lib/antiAbuse";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("*", requireAdmin);

const INLINE_LIMIT = 8 * 1024 * 1024; // 8MB max for D1 inline file storage
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function readChallengeReleaseStatus(env: Env, id: number) {
  return env.DB.prepare(
    `SELECT ch.name, ch.state, ch.generated_team_flags, ch.quality_checklist,
            (SELECT COUNT(*) FROM flags f WHERE f.challenge_id = ch.id) AS flag_count
     FROM challenges ch WHERE ch.id = ?`
  ).bind(id).first<{ name: string; state: string; generated_team_flags: number; quality_checklist: string | null; flag_count: number }>();
}

async function validateRelease(env: Env, id: number) {
  const cfg = await getConfig(env);
  const release = await readChallengeReleaseStatus(env, id);
  if (!release) return { ok: false as const, status: 404, error: "Not found" };
  if ((release.flag_count ?? 0) < 1 && !release.generated_team_flags) {
    return { ok: false as const, status: 400, error: "Add a static flag or enable generated team flags before releasing this challenge." };
  }
  if (release.generated_team_flags && !cfg.team_flag_secret && !env.TEAM_FLAG_SECRET) {
    return { ok: false as const, status: 400, error: "Set TEAM_FLAG_SECRET or the team flag secret in Settings before releasing generated-flag challenges." };
  }
  if (cfg.checklist_enforced && !checklistComplete(release.quality_checklist)) {
    return { ok: false as const, status: 400, error: "Complete the challenge quality checklist before releasing this challenge." };
  }
  return { ok: true as const, release };
}

/* ---------------- Config & stats ---------------- */

app.get("/config", async (c) => {
  const cfg = await getConfig(c.env);
  const logo = await c.env.DB.prepare("SELECT 1 FROM branding WHERE key = 'logo'").first();
  return c.json({ ...cfg, has_logo: !!logo });
});

app.patch("/config", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const allowed = [
    "ctf_name", "ctf_description", "mode", "team_size_limit", "registration_open",
    "site_lockdown", "visibility", "scoreboard_visible", "freeze_time", "start_time", "end_time",
    "paused", "block_vpn", "block_vpn_signup", "allow_name_change", "log_challenge_views",
    "require_access_code", "access_code", "auto_review", "review_fast_solve_seconds",
    "theme", "accent", "custom_css", "footer_html", "home_content", "home_format", "custom_head",
    "anti_abuse_enabled", "submit_challenge_limit", "submit_challenge_window",
    "submit_global_limit", "submit_global_window", "wrong_flag_cooldown_threshold",
    "wrong_flag_cooldown_seconds", "risk_normal_threshold", "risk_soft_review_threshold",
    "risk_proof_required_threshold", "risk_high_review_threshold", "proof_threshold",
    "leaderboard_review_enabled", "leaderboard_review_threshold", "checklist_enforced",
    "honeypot_enabled", "honeypot_secret", "honeypot_risk_weight", "team_flag_secret",
    "email_enabled", "email_from", "email_from_name", "email_on_register", "email_verification_required",
  ];
  const updates: any = {};
  for (const k of allowed) if (k in body) updates[k] = body[k];
  await setConfig(c.env, updates);
  await logEvent(c, EVENTS.ADMIN_ACTION, { message: `Updated site settings (${Object.keys(updates).join(", ")})` });
  return c.json({ ok: true });
});

app.get("/stats", async (c) => {
  const q = (sql: string) => c.env.DB.prepare(sql).first<{ n: number }>();
  const since24h = nowSeconds() - 24 * 60 * 60;
  const [users, teams, challenges, solves, submissions, correct, openCases, highCases, appeals, honeypot] = await Promise.all([
    q("SELECT COUNT(*) AS n FROM users"),
    q("SELECT COUNT(*) AS n FROM teams"),
    q("SELECT COUNT(*) AS n FROM challenges"),
    q("SELECT COUNT(*) AS n FROM solves"),
    q("SELECT COUNT(*) AS n FROM submissions"),
    q("SELECT COUNT(*) AS n FROM submissions WHERE correct = 1"),
    q("SELECT COUNT(*) AS n FROM review_cases WHERE status NOT IN ('clean','resolved','rejected')"),
    q("SELECT COUNT(*) AS n FROM review_cases WHERE status NOT IN ('clean','resolved','rejected') AND risk_score >= 80"),
    q("SELECT COUNT(*) AS n FROM appeals WHERE status = 'open'"),
    q("SELECT COUNT(*) AS n FROM anti_abuse_events WHERE type = 'ai_honeypot.triggered'"),
  ]);
  const traffic = await c.env.DB.prepare(
    `SELECT ((created_at / 3600) * 3600) AS bucket, COUNT(*) AS events,
            SUM(CASE WHEN type = ? THEN 1 ELSE 0 END) AS opens,
            SUM(CASE WHEN type = ? THEN 1 ELSE 0 END) AS submissions,
            SUM(CASE WHEN type = ? THEN 1 ELSE 0 END) AS downloads
     FROM anti_abuse_events
     WHERE created_at >= ?
     GROUP BY bucket
     ORDER BY bucket`
  ).bind(ABUSE_EVENTS.CHALLENGE_OPENED, ABUSE_EVENTS.FLAG_SUBMITTED, ABUSE_EVENTS.FILE_DOWNLOADED, since24h).all();
  const activeTeams = await c.env.DB.prepare(
    `SELECT COALESCE(t.name, u.name) AS name,
            COUNT(DISTINCT s.id) AS submissions,
            SUM(CASE WHEN s.correct = 1 THEN 1 ELSE 0 END) AS correct
     FROM submissions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN teams t ON t.id = s.team_id
     WHERE s.created_at >= ? AND u.role = 'user'
     GROUP BY COALESCE(s.team_id, s.user_id)
     ORDER BY submissions DESC
     LIMIT 10`
  ).bind(since24h).all();
  const reviewByStatus = await c.env.DB.prepare(
    "SELECT status, COUNT(*) AS n FROM review_cases GROUP BY status ORDER BY n DESC"
  ).all();
  return c.json({
    users: users?.n ?? 0,
    teams: teams?.n ?? 0,
    challenges: challenges?.n ?? 0,
    solves: solves?.n ?? 0,
    submissions: submissions?.n ?? 0,
    correct: correct?.n ?? 0,
    open_cases: openCases?.n ?? 0,
    high_risk_cases: highCases?.n ?? 0,
    open_appeals: appeals?.n ?? 0,
    honeypot_hits: honeypot?.n ?? 0,
    traffic: traffic.results,
    active_accounts: activeTeams.results,
    review_by_status: reviewByStatus.results,
  });
});

/* ---------------- Challenges ---------------- */

app.get("/challenges", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT ch.*, (SELECT COUNT(*) FROM solves s WHERE s.challenge_id = ch.id) AS solves,
            (SELECT COUNT(*) FROM flags f WHERE f.challenge_id = ch.id) AS flag_count
     FROM challenges ch ORDER BY category, sort_order, id`
  ).all();
  return c.json({ challenges: rows.results });
});

app.get("/challenges/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const ch = await c.env.DB.prepare("SELECT * FROM challenges WHERE id = ?").bind(id).first();
  if (!ch) return c.json({ error: "Not found" }, 404);
  const [flags, hints, files] = await Promise.all([
    c.env.DB.prepare("SELECT id, type, content FROM flags WHERE challenge_id = ?").bind(id).all(),
    c.env.DB.prepare("SELECT id, content, cost, sort_order FROM hints WHERE challenge_id = ? ORDER BY sort_order").bind(id).all(),
    c.env.DB.prepare("SELECT id, name, size, content_type FROM files WHERE challenge_id = ?").bind(id).all(),
  ]);
  return c.json({ challenge: ch, flags: flags.results, hints: hints.results, files: files.results });
});

app.post("/challenges", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!b.name) return c.json({ error: "Name required" }, 400);
  if (b.state === "visible") {
    return c.json({ error: "Create the challenge hidden, add at least one flag, then release it." }, 400);
  }
  const res = await c.env.DB.prepare(
    `INSERT INTO challenges
     (name, category, description, connection_info, type, state, value, initial, minimum, decay,
      max_attempts, sort_order, prerequisites, difficulty, generated_team_flags, quality_checklist, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      b.name, b.category || "misc", b.description || "", b.connection_info || null,
      b.type === "dynamic" ? "dynamic" : "static", "hidden",
      Number(b.value ?? b.initial ?? 100), b.initial ?? null, b.minimum ?? null, b.decay ?? null,
      Number(b.max_attempts ?? 0), Number(b.sort_order ?? 0),
      Array.isArray(b.prerequisites) && b.prerequisites.length ? JSON.stringify(b.prerequisites) : null,
      ["easy", "medium", "hard", "insane"].includes(b.difficulty) ? b.difficulty : "medium",
      b.generated_team_flags ? 1 : 0,
      normalizeChecklist(b.quality_checklist),
      nowSeconds()
    )
    .run();
  await logEvent(c, EVENTS.CHALLENGE_CREATE, { challenge_id: res.meta.last_row_id as number, message: b.name });
  return c.json({ ok: true, id: res.meta.last_row_id });
});

app.patch("/challenges/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  if ("state" in b) {
    b.state = b.state === "visible" ? "visible" : "hidden";
    if (b.state === "visible") {
      const release = await validateRelease(c.env, id);
      if (!release.ok) return c.json({ error: release.error }, release.status as any);
    }
  }
  if ("difficulty" in b && !["easy", "medium", "hard", "insane"].includes(b.difficulty)) b.difficulty = "medium";
  if ("generated_team_flags" in b) b.generated_team_flags = b.generated_team_flags ? 1 : 0;
  const cols = [
    "name", "category", "description", "connection_info", "type", "state",
    "value", "initial", "minimum", "decay", "max_attempts", "sort_order",
    "difficulty", "generated_team_flags",
  ];
  const sets: string[] = [];
  const binds: any[] = [];
  for (const col of cols) if (col in b) { sets.push(`${col} = ?`); binds.push(b[col]); }
  if ("prerequisites" in b) {
    sets.push("prerequisites = ?");
    binds.push(Array.isArray(b.prerequisites) && b.prerequisites.length ? JSON.stringify(b.prerequisites) : null);
  }
  if ("quality_checklist" in b) {
    sets.push("quality_checklist = ?");
    binds.push(normalizeChecklist(b.quality_checklist));
  }
  if (!sets.length) return c.json({ ok: true });
  binds.push(id);
  await c.env.DB.prepare(`UPDATE challenges SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
  const nm = await c.env.DB.prepare("SELECT name FROM challenges WHERE id = ?").bind(id).first<{ name: string }>();
  await logEvent(c, EVENTS.CHALLENGE_UPDATE, { challenge_id: id, message: nm?.name ?? `#${id}` });
  return c.json({ ok: true });
});

app.post("/challenges/:id/release", async (c) => {
  const id = Number(c.req.param("id"));
  const release = await validateRelease(c.env, id);
  if (!release.ok) return c.json({ error: release.error }, release.status as any);
  await c.env.DB.prepare("UPDATE challenges SET state = 'visible' WHERE id = ?").bind(id).run();
  await logEvent(c, EVENTS.CHALLENGE_UPDATE, { challenge_id: id, message: `Released ${release.release.name}` });
  return c.json({ ok: true });
});

app.post("/challenges/:id/hide", async (c) => {
  const id = Number(c.req.param("id"));
  const release = await readChallengeReleaseStatus(c.env, id);
  if (!release) return c.json({ error: "Not found" }, 404);
  await c.env.DB.prepare("UPDATE challenges SET state = 'hidden' WHERE id = ?").bind(id).run();
  await logEvent(c, EVENTS.CHALLENGE_UPDATE, { challenge_id: id, message: `Hid ${release.name}` });
  return c.json({ ok: true });
});

app.delete("/challenges/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const nm = await c.env.DB.prepare("SELECT name FROM challenges WHERE id = ?").bind(id).first<{ name: string }>();
  await c.env.DB.prepare("DELETE FROM challenges WHERE id = ?").bind(id).run();
  await logEvent(c, EVENTS.CHALLENGE_DELETE, { message: nm?.name ?? `#${id}` });
  return c.json({ ok: true });
});

// Duplicate a challenge (incl. flags, hints, files) as a hidden draft.
app.post("/challenges/:id/clone", async (c) => {
  const id = Number(c.req.param("id"));
  const src = await c.env.DB.prepare("SELECT * FROM challenges WHERE id = ?").bind(id).first<any>();
  if (!src) return c.json({ error: "Not found" }, 404);
  const now = nowSeconds();
  const res = await c.env.DB.prepare(
    `INSERT INTO challenges
     (name, category, description, connection_info, type, state, value, initial, minimum, decay,
      max_attempts, sort_order, prerequisites, difficulty, generated_team_flags, quality_checklist, created_at)
     VALUES (?, ?, ?, ?, ?, 'hidden', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(`${src.name} (copy)`, src.category, src.description, src.connection_info, src.type,
      src.value, src.initial, src.minimum, src.decay, src.max_attempts, src.sort_order,
      src.prerequisites, src.difficulty || "medium", src.generated_team_flags ? 1 : 0, src.quality_checklist || null, now)
    .run();
  const newId = res.meta.last_row_id as number;

  const flags = await c.env.DB.prepare("SELECT type, content FROM flags WHERE challenge_id = ?").bind(id).all<any>();
  const hints = await c.env.DB.prepare("SELECT content, cost, sort_order FROM hints WHERE challenge_id = ?").bind(id).all<any>();
  const files = await c.env.DB.prepare("SELECT name, size, content_type, r2_key, data FROM files WHERE challenge_id = ?").bind(id).all<any>();
  const stmts: D1PreparedStatement[] = [];
  for (const f of flags.results) stmts.push(c.env.DB.prepare("INSERT INTO flags (challenge_id, type, content) VALUES (?, ?, ?)").bind(newId, f.type, f.content));
  for (const h of hints.results) stmts.push(c.env.DB.prepare("INSERT INTO hints (challenge_id, content, cost, sort_order) VALUES (?, ?, ?, ?)").bind(newId, h.content, h.cost, h.sort_order));
  for (const f of files.results) stmts.push(c.env.DB.prepare("INSERT INTO files (challenge_id, name, size, content_type, r2_key, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(newId, f.name, f.size, f.content_type, f.r2_key, f.data, now));
  if (stmts.length) await c.env.DB.batch(stmts);
  await logEvent(c, EVENTS.CHALLENGE_CREATE, { challenge_id: newId, message: `${src.name} (copy)` });
  return c.json({ ok: true, id: newId });
});

/* ---------------- Flags ---------------- */

app.post("/challenges/:id/flags", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  if (!b.content) return c.json({ error: "Flag content required" }, 400);
  const type = ["static", "static_ci", "regex"].includes(b.type) ? b.type : "static";
  const res = await c.env.DB.prepare(
    "INSERT INTO flags (challenge_id, type, content) VALUES (?, ?, ?)"
  )
    .bind(id, type, b.content)
    .run();
  return c.json({ ok: true, id: res.meta.last_row_id });
});

app.delete("/flags/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const flag = await c.env.DB.prepare("SELECT challenge_id FROM flags WHERE id = ?").bind(id).first<{ challenge_id: number }>();
  await c.env.DB.prepare("DELETE FROM flags WHERE id = ?").bind(id).run();
  if (flag?.challenge_id) {
    const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM flags WHERE challenge_id = ?").bind(flag.challenge_id).first<{ n: number }>();
    if ((count?.n ?? 0) === 0) {
      await c.env.DB.prepare("UPDATE challenges SET state = 'hidden' WHERE id = ?").bind(flag.challenge_id).run();
    }
  }
  return c.json({ ok: true });
});

/* ---------------- Hints ---------------- */

app.post("/challenges/:id/hints", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  if (!b.content) return c.json({ error: "Hint content required" }, 400);
  const res = await c.env.DB.prepare(
    "INSERT INTO hints (challenge_id, content, cost, sort_order) VALUES (?, ?, ?, ?)"
  )
    .bind(id, b.content, Number(b.cost ?? 0), Number(b.sort_order ?? 0))
    .run();
  return c.json({ ok: true, id: res.meta.last_row_id });
});

app.delete("/hints/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM hints WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

/* ---------------- Files ---------------- */

app.post("/challenges/:id/files", async (c) => {
  const id = Number(c.req.param("id"));
  const form = await c.req.formData();
  const file = form.get("file") as unknown as
    | { arrayBuffer(): Promise<ArrayBuffer>; name: string; type: string }
    | string
    | null;
  if (!file || typeof file === "string") return c.json({ error: "No file provided" }, 400);

  const buf = new Uint8Array(await file.arrayBuffer());
  const now = nowSeconds();

  if (c.env.FILES) {
    const key = `ch/${id}/${randomToken(8)}-${file.name}`;
    await c.env.FILES.put(key, buf, { httpMetadata: { contentType: file.type } });
    await c.env.DB.prepare(
      "INSERT INTO files (challenge_id, name, size, content_type, r2_key, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(id, file.name, buf.length, file.type || null, key, now)
      .run();
    return c.json({ ok: true, storage: "r2" });
  }

  if (buf.length > INLINE_LIMIT)
    return c.json({ error: `File too large for inline storage (max ${INLINE_LIMIT / 1024 / 1024}MB without R2)` }, 413);
  await c.env.DB.prepare(
    "INSERT INTO files (challenge_id, name, size, content_type, data, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(id, file.name, buf.length, file.type || null, bytesToB64(buf), now)
    .run();
  return c.json({ ok: true, storage: "d1" });
});

app.delete("/files/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const file = await c.env.DB.prepare("SELECT r2_key FROM files WHERE id = ?").bind(id).first<{ r2_key: string | null }>();
  if (file?.r2_key && c.env.FILES) await c.env.FILES.delete(file.r2_key);
  await c.env.DB.prepare("DELETE FROM files WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

/* ---------------- Users ---------------- */

app.get("/users", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.role, u.team_id, u.is_captain, u.hidden, u.banned,
            u.verified, u.suspended, u.prize_disqualified, u.under_review, u.created_at,
            t.name AS team_name FROM users u LEFT JOIN teams t ON t.id = u.team_id ORDER BY u.id`
  ).all();
  return c.json({ users: rows.results });
});

app.post("/users", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const name = String(b.name || "").trim();
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  if (!name || !email || !password) return c.json({ error: "Name, email and password are required" }, 400);
  if (!EMAIL_RE.test(email)) return c.json({ error: "Invalid email" }, 400);
  if (password.length < 8) return c.json({ error: "Password must be at least 8 characters" }, 400);

  const exists = await c.env.DB.prepare("SELECT id FROM users WHERE email = ? OR name = ?").bind(email, name).first();
  if (exists) return c.json({ error: "A user with that name or email already exists" }, 409);

  const role = b.role === "admin" ? "admin" : "user";
  const res = await c.env.DB.prepare(
    `INSERT INTO users (name, email, password_hash, role, verified, hidden, affiliation, country, website, bracket_id, created_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      name,
      email,
      await hashPassword(password),
      role,
      role === "admin" ? 1 : (b.hidden ? 1 : 0),
      b.affiliation || null,
      b.country || null,
      b.website || null,
      b.bracket_id || null,
      nowSeconds()
    )
    .run();
  await logEvent(c, EVENTS.ADMIN_ACTION, { message: `Created ${role} user ${name}` });
  return c.json({ ok: true, id: res.meta.last_row_id });
});

app.patch("/users/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  // Safety: an admin can't remove their own admin role or ban themselves
  // (prevents accidentally locking yourself out of the admin panel).
  if (id === c.var.user!.id) {
    if ("role" in b && b.role !== "admin") return c.json({ error: "You can't remove your own admin role" }, 400);
    if ("banned" in b && b.banned) return c.json({ error: "You can't ban yourself" }, 400);
    if ("suspended" in b && b.suspended) return c.json({ error: "You can't suspend yourself" }, 400);
    if ("verified" in b && !b.verified) return c.json({ error: "You can't unverify yourself" }, 400);
  }
  const cols = [
    "role", "hidden", "banned", "verified", "suspended", "prize_disqualified", "under_review",
    "name", "email", "affiliation", "country", "website", "bracket_id", "team_id", "is_captain",
  ];
  const sets: string[] = [];
  const binds: any[] = [];
  if (b.role === "admin") b.hidden = 1;
  for (const col of cols) if (col in b) { sets.push(`${col} = ?`); binds.push(b[col] === "" ? null : b[col]); }
  if (b.password) {
    if (String(b.password).length < 8) return c.json({ error: "Password too short" }, 400);
    sets.push("password_hash = ?");
    binds.push(await hashPassword(b.password));
  }
  if (!sets.length) return c.json({ ok: true });
  binds.push(id);
  await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
  // Log notable changes (ban, role) explicitly.
  if ("banned" in b) await logEvent(c, EVENTS.ADMIN_ACTION, { message: `${b.banned ? "Banned" : "Unbanned"} user #${id}` });
  else if ("suspended" in b) await logEvent(c, EVENTS.ADMIN_ACTION, { message: `${b.suspended ? "Suspended" : "Unsuspended"} user #${id}` });
  else if ("role" in b) await logEvent(c, EVENTS.ADMIN_ACTION, { message: `Set user #${id} role to ${b.role}` });
  if ("banned" in b || "suspended" in b || "prize_disqualified" in b || "under_review" in b) {
    await logAbuseEvent(c, ABUSE_EVENTS.ADMIN_ACTION, {
      user_id: id,
      team_id: null,
      message: "Updated user enforcement flags",
      metadata: {
        banned: b.banned,
        suspended: b.suspended,
        prize_disqualified: b.prize_disqualified,
        under_review: b.under_review,
      },
    });
  }
  return c.json({ ok: true });
});

// Full user detail for the management modal: profile + solves + awards.
app.get("/users/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const user = await c.env.DB.prepare(
    `SELECT u.*, t.name AS team_name, b.name AS bracket_name FROM users u
     LEFT JOIN teams t ON t.id = u.team_id LEFT JOIN brackets b ON b.id = u.bracket_id WHERE u.id = ?`
  ).bind(id).first<any>();
  if (!user) return c.json({ error: "Not found" }, 404);
  delete user.password_hash;
  const solves = await c.env.DB.prepare(
    `SELECT s.id, s.challenge_id, ch.name, ch.value, s.created_at
     FROM solves s JOIN challenges ch ON ch.id = s.challenge_id WHERE s.user_id = ? ORDER BY s.created_at DESC`
  ).bind(id).all();
  const awards = await c.env.DB.prepare("SELECT id, name, value, created_at FROM awards WHERE user_id = ? ORDER BY id DESC").bind(id).all();
  const lastIp = await c.env.DB.prepare("SELECT ip FROM events WHERE user_id = ? AND ip IS NOT NULL ORDER BY id DESC LIMIT 1").bind(id).first<{ ip: string }>();
  return c.json({ user, solves: solves.results, awards: awards.results, last_ip: lastIp?.ip ?? null });
});

// Grant a solve to a user (and their team, if any).
app.post("/users/:id/grant-solve", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  const challengeId = Number(b.challenge_id);
  if (!challengeId) return c.json({ error: "challenge_id required" }, 400);
  const u = await c.env.DB.prepare("SELECT team_id, role FROM users WHERE id = ?").bind(id).first<{ team_id: number | null; role: string }>();
  if (!u) return c.json({ error: "User not found" }, 404);
  if (u.role !== "user") return c.json({ error: "Admin accounts cannot receive scored solves" }, 400);
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO solves (challenge_id, user_id, team_id, created_at) VALUES (?, ?, ?, ?)"
  ).bind(challengeId, id, u.team_id, nowSeconds()).run();
  await logEvent(c, EVENTS.ADMIN_ACTION, { challenge_id: challengeId, message: `Granted solve to user #${id}` });
  return c.json({ ok: true });
});

// Remove any solve by id (user or team).
app.delete("/solves/:id", async (c) => {
  const sid = Number(c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM solves WHERE id = ?").bind(sid).run();
  await logEvent(c, EVENTS.ADMIN_ACTION, { message: `Removed solve #${sid}` });
  return c.json({ ok: true });
});

app.delete("/users/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (id === c.var.user!.id) return c.json({ error: "Cannot delete yourself" }, 400);
  const nm = await c.env.DB.prepare("SELECT name FROM users WHERE id = ?").bind(id).first<{ name: string }>();
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
  await logEvent(c, EVENTS.ADMIN_ACTION, { message: `Deleted user ${nm?.name ?? `#${id}`}` });
  return c.json({ ok: true });
});

/* ---------------- Teams ---------------- */

app.get("/teams", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT t.*, (SELECT COUNT(*) FROM users u WHERE u.team_id = t.id) AS members FROM teams t ORDER BY t.id`
  ).all();
  return c.json({ teams: rows.results });
});

app.patch("/teams/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  const cols = ["name", "hidden", "banned", "suspended", "prize_disqualified", "under_review", "bracket_id", "affiliation", "country", "website"];
  const sets: string[] = [];
  const binds: any[] = [];
  for (const col of cols) if (col in b) { sets.push(`${col} = ?`); binds.push(b[col] === "" ? null : b[col]); }
  if (!sets.length) return c.json({ ok: true });
  binds.push(id);
  await c.env.DB.prepare(`UPDATE teams SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
  if ("banned" in b || "suspended" in b || "prize_disqualified" in b || "under_review" in b) {
    await logAbuseEvent(c, ABUSE_EVENTS.ADMIN_ACTION, {
      user_id: null,
      team_id: id,
      message: "Updated team enforcement flags",
      metadata: {
        banned: b.banned,
        suspended: b.suspended,
        prize_disqualified: b.prize_disqualified,
        under_review: b.under_review,
      },
    });
  }
  return c.json({ ok: true });
});

// Full team detail: members + solves.
app.get("/teams/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const team = await c.env.DB.prepare(
    "SELECT t.*, b.name AS bracket_name FROM teams t LEFT JOIN brackets b ON b.id = t.bracket_id WHERE t.id = ?"
  ).bind(id).first<any>();
  if (!team) return c.json({ error: "Not found" }, 404);
  const members = await c.env.DB.prepare("SELECT id, name, email, is_captain, banned FROM users WHERE team_id = ?").bind(id).all();
  const solves = await c.env.DB.prepare(
    `SELECT s.id, ch.name, ch.value, s.created_at, u.name AS solver
     FROM solves s JOIN challenges ch ON ch.id = s.challenge_id LEFT JOIN users u ON u.id = s.user_id
     WHERE s.team_id = ? ORDER BY s.created_at DESC`
  ).bind(id).all();
  return c.json({ team, members: members.results, solves: solves.results });
});

// Kick a member out of a team.
app.post("/teams/:id/kick", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  await c.env.DB.prepare("UPDATE users SET team_id = NULL, is_captain = 0 WHERE id = ? AND team_id = ?")
    .bind(Number(b.user_id), id).run();
  return c.json({ ok: true });
});

// Set a team's captain.
app.post("/teams/:id/captain", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  const uid = Number(b.user_id);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET is_captain = 0 WHERE team_id = ?").bind(id),
    c.env.DB.prepare("UPDATE users SET is_captain = 1 WHERE id = ? AND team_id = ?").bind(uid, id),
    c.env.DB.prepare("UPDATE teams SET captain_id = ? WHERE id = ?").bind(uid, id),
  ]);
  return c.json({ ok: true });
});

app.delete("/teams/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const nm = await c.env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(id).first<{ name: string }>();
  await c.env.DB.prepare("UPDATE users SET team_id = NULL, is_captain = 0 WHERE team_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM teams WHERE id = ?").bind(id).run();
  await logEvent(c, EVENTS.ADMIN_ACTION, { message: `Deleted team ${nm?.name ?? `#${id}`}` });
  return c.json({ ok: true });
});

/* ---------------- Submissions log ---------------- */

app.get("/submissions", async (c) => {
  const correct = c.req.query("correct");
  const where = correct === "1" ? "WHERE s.correct = 1" : correct === "0" ? "WHERE s.correct = 0" : "";
  const rows = await c.env.DB.prepare(
    `SELECT s.id, s.provided, s.correct, s.created_at, s.ip,
            u.name AS user_name, t.name AS team_name, ch.name AS challenge_name
     FROM submissions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN teams t ON t.id = s.team_id
     JOIN challenges ch ON ch.id = s.challenge_id
     ${where} ORDER BY s.id DESC LIMIT 200`
  ).all();
  return c.json({ submissions: rows.results });
});

/* ---------------- Awards ---------------- */

app.post("/awards", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!b.name || (b.user_id == null && b.team_id == null))
    return c.json({ error: "name and a user_id or team_id required" }, 400);
  const res = await c.env.DB.prepare(
    "INSERT INTO awards (user_id, team_id, name, description, category, value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(b.user_id ?? null, b.team_id ?? null, b.name, b.description ?? null, b.category ?? null, Number(b.value ?? 0), nowSeconds())
    .run();
  return c.json({ ok: true, id: res.meta.last_row_id });
});

app.delete("/awards/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM awards WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

/* ---------------- Event log ---------------- */

app.get("/events", async (c) => {
  const type = c.req.query("type");
  const vpn = c.req.query("vpn");
  const page = Math.max(0, Math.floor(Number(c.req.query("page")) || 0));
  const limit = 100;
  const clauses: string[] = [];
  const binds: any[] = [];
  if (type) { clauses.push("e.type = ?"); binds.push(type); }
  if (vpn === "1") clauses.push("e.is_vpn = 1");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await c.env.DB.prepare(
    `SELECT e.*, u.name AS user_name, ch.name AS challenge_name
     FROM events e
     LEFT JOIN users u ON u.id = e.user_id
     LEFT JOIN challenges ch ON ch.id = e.challenge_id
     ${where} ORDER BY e.id DESC LIMIT ${limit} OFFSET ${page * limit}`
  ).bind(...binds).all();
  const types = await c.env.DB.prepare("SELECT DISTINCT type FROM events ORDER BY type").all<{ type: string }>();
  return c.json({ events: rows.results, types: types.results.map((t) => t.type), page });
});

/* ---------------- Discord webhooks ---------------- */

app.get("/webhooks", async (c) => c.json({ webhooks: await listWebhooks(c.env) }));

app.post("/webhooks", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = await createWebhook(c.env, String(b.name || "New webhook"));
  return c.json({ ok: true, id });
});

app.put("/webhooks/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  await updateWebhook(c.env, id, String(b.name || "Webhook"), !!b.enabled, b.config ?? {});
  return c.json({ ok: true });
});

app.delete("/webhooks/:id", async (c) => {
  await deleteWebhook(c.env, Number(c.req.param("id")));
  return c.json({ ok: true });
});

app.post("/webhooks/:id/test", async (c) => {
  const w = await getWebhook(c.env, Number(c.req.param("id")));
  if (!w) return c.json({ error: "Not found" }, 404);
  const base = {
    actor: { id: c.var.user!.id, name: c.var.user!.name },
    challenge_id: null, challenge_name: "Test Challenge", team_id: null, team_name: "Test Team",
    metadata: {}, ip: "203.0.113.1", is_vpn: false, at: nowSeconds(),
  };
  const events: string[] = Array.isArray(w.config.events) && w.config.events.length ? w.config.events : ["solve"];
  const ev = events.includes(w.config.test_event) ? String(w.config.test_event) : events[0];
  try {
    await deliverDiscord(w.config, ev, { ...base, type: ev, message: `Test of "${ev}" event` });
    return c.json({ ok: true, sent: 1, event: ev });
  } catch (e: any) {
    return c.json({ error: e?.message || "Delivery failed" }, 502);
  }
});

/* ---------------- Bans (IP / username) ---------------- */

app.get("/bans", async (c) => c.json({ bans: await listBans(c.env) }));

app.post("/bans", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!b.value) return c.json({ error: "value required" }, 400);
  const id = await addBan(c.env, b.type, String(b.value), b.match, b.reason || null);
  await logEvent(c, EVENTS.ADMIN_ACTION, { message: `Added ${b.type} ban: ${b.value}` });
  return c.json({ ok: true, id });
});

app.delete("/bans/:id", async (c) => {
  await removeBan(c.env, Number(c.req.param("id")));
  return c.json({ ok: true });
});

/* ---------------- Review flags (suspicious activity) ---------------- */

app.get("/review-flags", async (c) => {
  const showAll = c.req.query("all") === "1";
  const rows = await c.env.DB.prepare(
    `SELECT rf.*, u.name AS user_name, t.name AS team_name, ch.name AS challenge_name
     FROM review_flags rf
     LEFT JOIN users u ON u.id = rf.user_id
     LEFT JOIN teams t ON t.id = rf.team_id
     LEFT JOIN challenges ch ON ch.id = rf.challenge_id
     ${showAll ? "" : "WHERE rf.resolved = 0"} ORDER BY rf.id DESC LIMIT 300`
  ).all();
  return c.json({ flags: rows.results });
});

app.post("/review-flags/:id/resolve", async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("UPDATE review_flags SET resolved = 1 WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

app.post("/review-flags", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!b.user_id) return c.json({ error: "user_id required" }, 400);
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO review_flags (user_id, team_id, challenge_id, type, detail, created_at) VALUES (?, ?, ?, 'manual', ?, ?)"
  ).bind(Number(b.user_id), b.team_id ?? null, b.challenge_id ?? null, String(b.detail || "Manually flagged"), nowSeconds()).run();
  return c.json({ ok: true });
});

/* ---------------- Anti-slop review cases ---------------- */

function appendNote(existing: string | null | undefined, admin: string, note: string): string {
  const trimmed = note.trim();
  if (!trimmed) return existing || "";
  const stamp = new Date().toISOString();
  return `${existing || ""}${existing ? "\n\n" : ""}[${stamp}] ${admin}: ${trimmed}`;
}

async function getReviewCase(env: Env, id: number) {
  return env.DB.prepare("SELECT * FROM review_cases WHERE id = ?").bind(id).first<any>();
}

app.get("/review-cases", async (c) => {
  const clauses: string[] = [];
  const binds: any[] = [];
  const status = c.req.query("status");
  const minRisk = c.req.query("min_risk");
  const from = c.req.query("from");
  const to = c.req.query("to");
  for (const [query, col] of [
    ["challenge_id", "rc.challenge_id"],
    ["user_id", "rc.user_id"],
    ["team_id", "rc.team_id"],
  ] as const) {
    const value = c.req.query(query);
    if (value) {
      clauses.push(`${col} = ?`);
      binds.push(Number(value));
    }
  }
  if (status && status !== "all") {
    clauses.push("rc.status = ?");
    binds.push(status);
  } else if (status !== "all") {
    clauses.push("rc.status NOT IN ('clean','resolved')");
  }
  if (minRisk) {
    clauses.push("rc.risk_score >= ?");
    binds.push(Number(minRisk));
  }
  if (from) {
    clauses.push("rc.created_at >= ?");
    binds.push(Number(from));
  }
  if (to) {
    clauses.push("rc.created_at <= ?");
    binds.push(Number(to));
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await c.env.DB.prepare(
    `SELECT rc.*, u.name AS user_name, t.name AS team_name, ch.name AS challenge_name,
            s.correct AS submission_correct, s.created_at AS submission_at
     FROM review_cases rc
     LEFT JOIN users u ON u.id = rc.user_id
     LEFT JOIN teams t ON t.id = rc.team_id
     LEFT JOIN challenges ch ON ch.id = rc.challenge_id
     LEFT JOIN submissions s ON s.id = rc.submission_id
     ${where}
     ORDER BY rc.risk_score DESC, rc.updated_at DESC
     LIMIT 300`
  ).bind(...binds).all();
  return c.json({ cases: rows.results });
});

app.post("/review-cases", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const userId = Number(b.user_id || 0);
  const teamId = b.team_id == null || b.team_id === "" ? null : Number(b.team_id);
  if (!userId && teamId == null) return c.json({ error: "user_id or team_id required" }, 400);
  const now = nowSeconds();
  const res = await c.env.DB.prepare(
    `INSERT INTO review_cases
     (user_id, team_id, challenge_id, submission_id, risk_score, status, reason, evidence, proof_state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?, ?, 'not_required', ?, ?)`
  ).bind(
    userId || null,
    teamId,
    b.challenge_id || null,
    b.submission_id || null,
    Number(b.risk_score ?? 25),
    String(b.reason || "Manually opened by admin"),
    JSON.stringify({ manual: true, opened_by: c.var.user!.id, note: b.note || null }),
    now,
    now
  ).run();
  const id = Number(res.meta.last_row_id);
  await logAbuseEvent(c, ABUSE_EVENTS.REVIEW_CASE_CREATED, { user_id: userId || null, team_id: teamId, challenge_id: b.challenge_id || null, review_case_id: id, message: "Manual review case" });
  await logAdminReviewAction(c, id, "Created manual review case", { reason: b.reason || null });
  return c.json({ ok: true, id });
});

app.get("/review-cases/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(
    `SELECT rc.*, u.name AS user_name, t.name AS team_name, ch.name AS challenge_name,
            s.provided AS submitted_flag, s.correct AS submission_correct, s.created_at AS submission_at
     FROM review_cases rc
     LEFT JOIN users u ON u.id = rc.user_id
     LEFT JOIN teams t ON t.id = rc.team_id
     LEFT JOIN challenges ch ON ch.id = rc.challenge_id
     LEFT JOIN submissions s ON s.id = rc.submission_id
     WHERE rc.id = ?`
  ).bind(id).first<any>();
  if (!row) return c.json({ error: "Not found" }, 404);
  const events = await c.env.DB.prepare(
    `SELECT ae.*, u.name AS user_name, t.name AS team_name, ch.name AS challenge_name
     FROM anti_abuse_events ae
     LEFT JOIN users u ON u.id = ae.user_id
     LEFT JOIN teams t ON t.id = ae.team_id
     LEFT JOIN challenges ch ON ch.id = ae.challenge_id
     WHERE ae.review_case_id = ?
        OR ae.submission_id = ?
        OR (ae.challenge_id = ? AND (ae.user_id = ? OR (ae.team_id IS NOT NULL AND ae.team_id = ?)))
     ORDER BY ae.id DESC
     LIMIT 200`
  ).bind(id, row.submission_id ?? -1, row.challenge_id ?? -1, row.user_id ?? -1, row.team_id ?? -1).all();
  const submissions = row.challenge_id
    ? await c.env.DB.prepare(
      `SELECT s.id, s.provided, s.correct, s.created_at, u.name AS user_name, t.name AS team_name
       FROM submissions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN teams t ON t.id = s.team_id
       WHERE s.challenge_id = ? AND (s.user_id = ? OR (s.team_id IS NOT NULL AND s.team_id = ?))
       ORDER BY s.id DESC
       LIMIT 100`
    ).bind(row.challenge_id, row.user_id ?? -1, row.team_id ?? -1).all()
    : { results: [] };
  const appeals = await c.env.DB.prepare(
    "SELECT * FROM appeals WHERE review_case_id = ? ORDER BY id DESC"
  ).bind(id).all();
  return c.json({ case: row, events: events.results, submissions: submissions.results, appeals: appeals.results });
});

app.post("/review-cases/:id/action", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  const action = String(b.action || "");
  const note = String(b.note || "");
  const rc = await getReviewCase(c.env, id);
  if (!rc) return c.json({ error: "Not found" }, 404);
  const now = nowSeconds();
  const adminName = c.var.user!.name || `admin #${c.var.user!.id}`;
  const newNotes = appendNote(rc.admin_notes, adminName, note);
  const touch = async (sets: string[], binds: any[]) => {
    sets.push("admin_notes = ?", "updated_at = ?");
    binds.push(newNotes, now, id);
    await c.env.DB.prepare(`UPDATE review_cases SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
  };

  if (action === "mark_clean") {
    await touch(["status = 'clean'", "resolution = ?", "resolved_by = ?", "resolved_at = ?", "proof_state = CASE WHEN proof_state = 'submitted' THEN 'accepted' ELSE proof_state END"], [b.resolution || "Marked clean", c.var.user!.id, now]);
  } else if (action === "request_proof") {
    await touch(["status = 'proof_required'", "proof_state = 'requested'", "proof_requested_at = COALESCE(proof_requested_at, ?)"], [now]);
  } else if (action === "freeze_leaderboard") {
    await touch(["leaderboard_frozen = 1", "status = CASE WHEN status = 'monitor' THEN 'open' ELSE status END"], []);
    if (rc.team_id) await c.env.DB.prepare("UPDATE teams SET under_review = 1 WHERE id = ?").bind(rc.team_id).run();
    else if (rc.user_id) await c.env.DB.prepare("UPDATE users SET under_review = 1 WHERE id = ?").bind(rc.user_id).run();
  } else if (action === "remove_solve") {
    if (rc.challenge_id && rc.team_id) {
      await c.env.DB.prepare("DELETE FROM solves WHERE challenge_id = ? AND team_id = ?").bind(rc.challenge_id, rc.team_id).run();
    } else if (rc.challenge_id && rc.user_id) {
      await c.env.DB.prepare("DELETE FROM solves WHERE challenge_id = ? AND user_id = ?").bind(rc.challenge_id, rc.user_id).run();
    }
    await touch(["status = 'resolved'", "resolution = ?", "resolved_by = ?", "resolved_at = ?"], [b.resolution || "Solve removed after review", c.var.user!.id, now]);
  } else if (action === "disqualify_prizes") {
    if (rc.team_id) await c.env.DB.prepare("UPDATE teams SET prize_disqualified = 1 WHERE id = ?").bind(rc.team_id).run();
    else if (rc.user_id) await c.env.DB.prepare("UPDATE users SET prize_disqualified = 1 WHERE id = ?").bind(rc.user_id).run();
    await touch(["prize_disqualified = 1", "status = 'resolved'", "resolution = ?", "resolved_by = ?", "resolved_at = ?"], [b.resolution || "Disqualified from prizes", c.var.user!.id, now]);
  } else if (action === "suspend") {
    if (rc.team_id) await c.env.DB.prepare("UPDATE teams SET suspended = 1 WHERE id = ?").bind(rc.team_id).run();
    else if (rc.user_id) await c.env.DB.prepare("UPDATE users SET suspended = 1 WHERE id = ?").bind(rc.user_id).run();
    await touch(["suspended = 1", "status = 'resolved'", "resolution = ?", "resolved_by = ?", "resolved_at = ?"], [b.resolution || "Suspended by admin review", c.var.user!.id, now]);
  } else if (action === "ban") {
    if (rc.team_id) await c.env.DB.prepare("UPDATE teams SET banned = 1 WHERE id = ?").bind(rc.team_id).run();
    else if (rc.user_id) await c.env.DB.prepare("UPDATE users SET banned = 1 WHERE id = ?").bind(rc.user_id).run();
    await touch(["banned = 1", "status = 'resolved'", "resolution = ?", "resolved_by = ?", "resolved_at = ?"], [b.resolution || "Banned by admin review", c.var.user!.id, now]);
  } else if (action === "accept_proof") {
    await touch(["proof_state = 'accepted'", "status = 'clean'", "resolution = ?", "resolved_by = ?", "resolved_at = ?"], [b.resolution || "Proof accepted", c.var.user!.id, now]);
  } else if (action === "reject_proof") {
    await touch(["proof_state = 'rejected'", "status = 'high_risk'", "resolution = ?"], [b.resolution || "Proof rejected"]);
  } else if (action === "resolve") {
    await touch(["status = 'resolved'", "resolution = ?", "resolved_by = ?", "resolved_at = ?"], [b.resolution || "Resolved", c.var.user!.id, now]);
  } else if (action === "note") {
    await touch([], []);
  } else {
    return c.json({ error: "Unknown action" }, 400);
  }

  await logAdminReviewAction(c, id, `Review action: ${action}`, { note: note || null, resolution: b.resolution || null });
  await logEvent(c, EVENTS.ADMIN_ACTION, { challenge_id: rc.challenge_id, message: `Review case #${id}: ${action}` });
  return c.json({ ok: true });
});

app.get("/appeals", async (c) => {
  const status = c.req.query("status");
  const where = status && status !== "all" ? "WHERE a.status = ?" : "";
  const stmt = c.env.DB.prepare(
    `SELECT a.*, u.name AS user_name, t.name AS team_name, rc.risk_score, rc.reason AS case_reason
     FROM appeals a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN teams t ON t.id = a.team_id
     LEFT JOIN review_cases rc ON rc.id = a.review_case_id
     ${where}
     ORDER BY a.id DESC
     LIMIT 300`
  );
  const rows = status && status !== "all" ? await stmt.bind(status).all() : await stmt.all();
  return c.json({ appeals: rows.results });
});

app.post("/appeals/:id/action", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  const action = String(b.action || "");
  const row = await c.env.DB.prepare("SELECT * FROM appeals WHERE id = ?").bind(id).first<any>();
  if (!row) return c.json({ error: "Not found" }, 404);
  const status = action === "accept" ? "accepted" : action === "reject" ? "rejected" : action === "resolve" ? "resolved" : action === "note" ? row.status : "";
  if (!status) return c.json({ error: "Unknown action" }, 400);
  const notes = appendNote(row.admin_notes, c.var.user!.name || `admin #${c.var.user!.id}`, String(b.note || ""));
  await c.env.DB.prepare(
    `UPDATE appeals
     SET status = ?, admin_notes = ?, resolution = COALESCE(?, resolution),
         resolved_by = CASE WHEN ? != 'note' THEN ? ELSE resolved_by END,
         resolved_at = CASE WHEN ? != 'note' THEN ? ELSE resolved_at END
     WHERE id = ?`
  ).bind(status, notes, b.resolution || null, action, c.var.user!.id, action, nowSeconds(), id).run();
  await logAbuseEvent(c, ABUSE_EVENTS.ADMIN_ACTION, { user_id: row.user_id, team_id: row.team_id, review_case_id: row.review_case_id, message: `Appeal #${id}: ${action}` });
  await logEvent(c, EVENTS.ADMIN_ACTION, { message: `Appeal #${id}: ${action}` });
  return c.json({ ok: true });
});

/* ---------------- Branding ---------------- */

app.post("/branding/:key", async (c) => {
  const key = c.req.param("key");
  if (key !== "logo" && key !== "favicon") return c.json({ error: "Invalid key" }, 400);
  const form = await c.req.formData();
  const file = form.get("file") as unknown as
    | { arrayBuffer(): Promise<ArrayBuffer>; name: string; type: string }
    | string
    | null;
  if (!file || typeof file === "string") return c.json({ error: "No file provided" }, 400);
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.length > 2 * 1024 * 1024) return c.json({ error: "Image too large (max 2MB)" }, 413);
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  await c.env.DB.prepare(
    `INSERT INTO branding (key, content_type, data, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET content_type = excluded.content_type, data = excluded.data, r2_key = NULL, updated_at = excluded.updated_at`
  )
    .bind(key, file.type || "image/png", btoa(bin), nowSeconds())
    .run();
  return c.json({ ok: true });
});

app.delete("/branding/:key", async (c) => {
  await c.env.DB.prepare("DELETE FROM branding WHERE key = ?").bind(c.req.param("key")).run();
  return c.json({ ok: true });
});

/* ---------------- Pages (CMS) ---------------- */

app.get("/pages", async (c) => {
  const rows = await c.env.DB.prepare("SELECT id, slug, title, published, nav, nav_order, auth_required, updated_at FROM pages ORDER BY nav_order, title").all();
  return c.json({ pages: rows.results });
});

app.get("/pages/:id", async (c) => {
  const p = await c.env.DB.prepare("SELECT * FROM pages WHERE id = ?").bind(Number(c.req.param("id"))).first();
  if (!p) return c.json({ error: "Not found" }, 404);
  return c.json({ page: p });
});

app.post("/pages", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!b.slug || !b.title) return c.json({ error: "slug and title required" }, 400);
  const slug = String(b.slug).toLowerCase().replace(/[^a-z0-9-]/g, "-");
  try {
    const res = await c.env.DB.prepare(
      `INSERT INTO pages (slug, title, content, format, published, auth_required, nav, footer, nav_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(slug, b.title, b.content || "", b.format === "html" ? "html" : "markdown",
        b.published ? 1 : 0, b.auth_required ? 1 : 0, b.nav ? 1 : 0, b.footer ? 1 : 0, Number(b.nav_order ?? 0), nowSeconds())
      .run();
    return c.json({ ok: true, id: res.meta.last_row_id });
  } catch {
    return c.json({ error: "Slug already exists" }, 409);
  }
});

app.patch("/pages/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  const cols = ["slug", "title", "content", "format", "published", "auth_required", "nav", "footer", "nav_order"];
  const sets: string[] = [];
  const binds: any[] = [];
  for (const col of cols) if (col in b) { sets.push(`${col} = ?`); binds.push(col === "slug" ? String(b[col]).toLowerCase().replace(/[^a-z0-9-]/g, "-") : b[col]); }
  sets.push("updated_at = ?"); binds.push(nowSeconds());
  binds.push(id);
  await c.env.DB.prepare(`UPDATE pages SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
  return c.json({ ok: true });
});

app.delete("/pages/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM pages WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

/* ---------------- Brackets (divisions) ---------------- */

app.get("/brackets", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT b.*,
       (SELECT COUNT(*) FROM users u WHERE u.bracket_id = b.id) AS users,
       (SELECT COUNT(*) FROM teams t WHERE t.bracket_id = b.id) AS teams
     FROM brackets b ORDER BY b.name`
  ).all();
  return c.json({ brackets: rows.results });
});

app.post("/brackets", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!b.name) return c.json({ error: "name required" }, 400);
  const res = await c.env.DB.prepare(
    "INSERT INTO brackets (name, description, type, created_at) VALUES (?, ?, ?, ?)"
  )
    .bind(b.name, b.description || null, b.type === "teams" ? "teams" : "users", nowSeconds())
    .run();
  return c.json({ ok: true, id: res.meta.last_row_id });
});

app.patch("/brackets/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  const cols = ["name", "description", "type"];
  const sets: string[] = [];
  const binds: any[] = [];
  for (const col of cols) if (col in b) { sets.push(`${col} = ?`); binds.push(b[col]); }
  if (!sets.length) return c.json({ ok: true });
  binds.push(id);
  await c.env.DB.prepare(`UPDATE brackets SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
  return c.json({ ok: true });
});

app.delete("/brackets/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("UPDATE users SET bracket_id = NULL WHERE bracket_id = ?").bind(id).run();
  await c.env.DB.prepare("UPDATE teams SET bracket_id = NULL WHERE bracket_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM brackets WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

/* ---------------- Email test ---------------- */

app.post("/email/test", async (c) => {
  const cfg = await getConfig(c.env);
  const body = await c.req.json().catch(() => ({}));
  const to = String(body.to || c.var.user!.email);
  const r = await sendEmail(
    c.env, cfg, to, `${cfg.ctf_name} — test email`,
    `<p>This is a test email from <strong>${cfg.ctf_name}</strong>. If you received it, email sending works! ✅</p>`
  );
  return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, 502);
});

export default app;
