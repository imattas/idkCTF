import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { getConfig } from "../lib/config";
import { hashPassword, verifyPassword, randomToken, sha256hex } from "../lib/auth";
import { createSession, destroySession, sessionCookie, clearCookie, readCookie } from "../lib/session";
import { requireAuth } from "../middleware/auth";
import { nowSeconds } from "../lib/validate";
import { logEvent, EVENTS, extractMeta } from "../lib/events";
import { sendEmail, welcomeEmail } from "../lib/email";
import { isIpBanned, isUsernameBanned } from "../lib/bans";
import { rateLimit } from "../lib/ratelimit";
import { logAbuseEvent, ABUSE_EVENTS, getReviewCaseLogContext } from "../lib/antiAbuse";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

app.post("/register", async (c) => {
  const cfg = await getConfig(c.env);
  if (!cfg.setup_complete) return c.json({ error: "Site not set up yet" }, 400);
  if (cfg.site_lockdown) return c.json({ error: "Registration is disabled while the site is locked down" }, 403);
  if (!cfg.registration_open) return c.json({ error: "Registration is closed" }, 403);

  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!name || !email || !password) return c.json({ error: "All fields are required" }, 400);
  if (!EMAIL_RE.test(email)) return c.json({ error: "Invalid email" }, 400);
  if (password.length < 8) return c.json({ error: "Password must be at least 8 characters" }, 400);

  const exists = await c.env.DB.prepare("SELECT id FROM users WHERE email = ? OR name = ?")
    .bind(email, name)
    .first();
  if (exists) return c.json({ error: "A user with that name or email already exists" }, 409);

  // Registration gates: rate limit, IP ban, VPN, username ban, access code.
  const ip = c.req.header("CF-Connecting-IP") || null;
  if (!(await rateLimit(c.env, `register:${ip || "?"}`, 8, 600)))
    return c.json({ error: "Too many sign-ups from your network. Try again later." }, 429);
  if (await isIpBanned(c.env, ip)) return c.json({ error: "Registration is not allowed from your network." }, 403);
  if (cfg.block_vpn_signup && extractMeta(c).is_vpn)
    return c.json({ error: "Registrations from VPN/proxy networks are not allowed." }, 403);
  if (await isUsernameBanned(c.env, name)) return c.json({ error: "That username isn't allowed. Please choose another." }, 403);
  if (cfg.require_access_code) {
    const code = String(body.access_code || "");
    if (!cfg.access_code || code !== cfg.access_code) return c.json({ error: "Invalid or missing access code." }, 403);
  }

  const canEmail = cfg.email_enabled && !!c.env.EMAIL && !!cfg.email_from;
  const needsVerify = cfg.email_verification_required && canEmail;

  const hash = await hashPassword(password);
  const res = await c.env.DB.prepare(
    "INSERT INTO users (name, email, password_hash, role, verified, affiliation, country, website, bracket_id, created_at) VALUES (?, ?, ?, 'user', ?, ?, ?, ?, ?, ?)"
  )
    .bind(name, email, hash, needsVerify ? 0 : 1, body.affiliation || null, body.country || null, body.website || null, body.bracket_id || null, nowSeconds())
    .run();
  const userId = res.meta.last_row_id as number;
  c.set("user", { id: userId, name, email, role: "user", team_id: null, is_captain: 0, affiliation: body.affiliation || null, country: body.country || null, website: body.website || null, verified: needsVerify ? 0 : 1 });
  await logEvent(c, EVENTS.REGISTER, { message: name });

  if (needsVerify) {
    const rawToken = randomToken(24);
    await c.env.DB.prepare(
      "INSERT INTO email_verification_tokens (user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)"
    ).bind(userId, await sha256hex(rawToken), nowSeconds(), nowSeconds() + 60 * 60 * 24).run();
    const url = new URL(c.req.url);
    const verifyUrl = `${url.origin}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
    c.executionCtx.waitUntil(sendEmail(
      c.env,
      cfg,
      email,
      `Verify your ${cfg.ctf_name} account`,
      `<p>Welcome to <strong>${cfg.ctf_name}</strong>. Verify your account here:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
      `Verify your account: ${verifyUrl}`
    ).then(() => {}));
    return c.json({ ok: true, verification_required: true, message: "Check your email to verify your account." });
  }

  const token = await createSession(c.env, userId);
  c.header("Set-Cookie", sessionCookie(token));

  if (cfg.email_on_register && canEmail) {
    const tpl = welcomeEmail(cfg, name);
    c.executionCtx.waitUntil(sendEmail(c.env, cfg, email, tpl.subject, tpl.html).then(() => {}));
  }
  return c.json({ ok: true });
});

app.get("/verify-email", async (c) => {
  const token = c.req.query("token") || "";
  if (!token) return c.text("Missing verification token", 400);
  const now = nowSeconds();
  const row = await c.env.DB.prepare(
    "SELECT id, user_id, used_at, expires_at FROM email_verification_tokens WHERE token_hash = ?"
  ).bind(await sha256hex(token)).first<{ id: number; user_id: number; used_at: number | null; expires_at: number }>();
  if (!row || row.used_at || row.expires_at < now) return c.text("Verification link is invalid or expired", 400);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET verified = 1 WHERE id = ?").bind(row.user_id),
    c.env.DB.prepare("UPDATE email_verification_tokens SET used_at = ? WHERE id = ?").bind(now, row.id),
  ]);
  const session = await createSession(c.env, row.user_id);
  c.header("Set-Cookie", sessionCookie(session));
  return c.redirect("/");
});

app.post("/login", async (c) => {
  const loginIp = c.req.header("CF-Connecting-IP") || null;
  if (await isIpBanned(c.env, loginIp))
    return c.json({ error: "Access from your network is blocked." }, 403);
  if (!(await rateLimit(c.env, `login:${loginIp || "?"}`, 15, 300)))
    return c.json({ error: "Too many login attempts. Please wait a few minutes." }, 429);
  const body = await c.req.json().catch(() => ({}));
  const ident = String(body.email || body.name || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!ident || !password) return c.json({ error: "Missing credentials" }, 400);

  const user = await c.env.DB.prepare(
    "SELECT id, password_hash, banned, verified, suspended FROM users WHERE lower(email) = ? OR lower(name) = ?"
  )
    .bind(ident, ident)
    .first<{ id: number; password_hash: string; banned: number; verified: number; suspended: number }>();
  if (!user || !(await verifyPassword(password, user.password_hash)))
    return c.json({ error: "Invalid credentials" }, 401);
  if (user.banned) return c.json({ error: "Account banned" }, 403);
  if (!user.verified) return c.json({ error: "Verify your email before logging in." }, 403);
  if (user.suspended) return c.json({ error: "Account suspended. You may appeal this decision." }, 403);

  const token = await createSession(c.env, user.id);
  c.header("Set-Cookie", sessionCookie(token));
  c.set("user", { id: user.id, name: "", email: "", role: "user", team_id: null, is_captain: 0, affiliation: null, country: null, website: null });
  await logEvent(c, EVENTS.LOGIN, {});
  return c.json({ ok: true });
});

app.post("/appeal", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const reason = String(body.reason || "").trim();
  const targetType = String(body.target_type || "account");
  if (!email || !reason) return c.json({ error: "Email and appeal reason are required" }, 400);
  if (!EMAIL_RE.test(email)) return c.json({ error: "Invalid email" }, 400);
  const user = await c.env.DB.prepare("SELECT id, team_id FROM users WHERE lower(email) = ?").bind(email).first<{ id: number; team_id: number | null }>();
  const reviewCaseId = body.review_case_id ? Number(body.review_case_id) : null;
  let reviewContext = null;
  if (reviewCaseId) {
    if (!user) return c.json({ error: "Review case not found" }, 404);
    const owned = await c.env.DB.prepare(
      "SELECT id FROM review_cases WHERE id = ? AND (user_id = ? OR (? IS NOT NULL AND team_id = ?))"
    ).bind(reviewCaseId, user.id, user.team_id, user.team_id).first<{ id: number }>();
    if (!owned) return c.json({ error: "Review case not found" }, 404);
    reviewContext = await getReviewCaseLogContext(c.env, reviewCaseId);
  }
  const res = await c.env.DB.prepare(
    "INSERT INTO appeals (user_id, team_id, review_case_id, target_type, target_id, email, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(user?.id ?? null, user?.team_id ?? null, reviewCaseId, targetType, body.target_id || null, email, reason, nowSeconds()).run();
  await logAbuseEvent(c, ABUSE_EVENTS.APPEAL_CREATED, {
    user_id: user?.id ?? null,
    team_id: user?.team_id ?? null,
    challenge_id: reviewContext?.challenge_id ?? null,
    submission_id: reviewContext?.submission_id ?? null,
    review_case_id: reviewCaseId,
    message: targetType,
    metadata: { appeal_id: res.meta.last_row_id, challenge_name: reviewContext?.challenge_name ?? null },
  });
  return c.json({ ok: true });
});

app.post("/logout", async (c) => {
  const token = readCookie(c.req.raw);
  if (c.var.user) await logEvent(c, EVENTS.LOGOUT, {});
  if (token) await destroySession(c.env, token);
  c.header("Set-Cookie", clearCookie());
  return c.json({ ok: true });
});

// Update own profile.
app.patch("/me", requireAuth, async (c) => {
  const u = c.var.user!;
  const cfg = await getConfig(c.env);
  const body = await c.req.json().catch(() => ({}));
  const fields: string[] = [];
  const binds: any[] = [];
  for (const key of ["affiliation", "country", "website"]) {
    if (key in body) {
      fields.push(`${key} = ?`);
      binds.push(body[key] || null);
    }
  }
  if (body.name && body.name !== u.name) {
    if (!cfg.allow_name_change) return c.json({ error: "Name changes are disabled" }, 403);
    const taken = await c.env.DB.prepare("SELECT id FROM users WHERE name = ? AND id != ?").bind(body.name, u.id).first();
    if (taken) return c.json({ error: "Name already taken" }, 409);
    fields.push("name = ?");
    binds.push(body.name);
  }
  if (body.password) {
    if (String(body.password).length < 8) return c.json({ error: "Password too short" }, 400);
    fields.push("password_hash = ?");
    binds.push(await hashPassword(body.password));
  }
  if (!fields.length) return c.json({ ok: true });
  binds.push(u.id);
  await c.env.DB.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).bind(...binds).run();
  return c.json({ ok: true });
});

/* ---------- Personal API tokens (for the user-facing REST API) ---------- */

app.get("/tokens", requireAuth, async (c) => {
  const u = c.var.user!;
  const rows = await c.env.DB.prepare(
    "SELECT id, name, prefix, last_used, created_at FROM api_tokens WHERE user_id = ? ORDER BY id DESC"
  )
    .bind(u.id)
    .all();
  return c.json({ tokens: rows.results });
});

app.post("/tokens", requireAuth, async (c) => {
  const u = c.var.user!;
  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name || "API token").slice(0, 64);
  const secret = randomToken(24);
  const token = `ctf_${secret}`;
  const prefix = token.slice(0, 12);
  const hash = await sha256hex(token);
  await c.env.DB.prepare(
    "INSERT INTO api_tokens (user_id, name, token_hash, prefix, created_at) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(u.id, name, hash, prefix, nowSeconds())
    .run();
  // The full token is returned exactly once.
  return c.json({ ok: true, token, name });
});

app.delete("/tokens/:id", requireAuth, async (c) => {
  const u = c.var.user!;
  await c.env.DB.prepare("DELETE FROM api_tokens WHERE id = ? AND user_id = ?")
    .bind(Number(c.req.param("id")), u.id)
    .run();
  return c.json({ ok: true });
});

export default app;
