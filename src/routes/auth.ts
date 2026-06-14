import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { getConfig } from "../lib/config";
import { hashPassword, verifyPassword, randomToken, sha256hex } from "../lib/auth";
import { createSession, destroySession, sessionCookie, clearCookie, readCookie } from "../lib/session";
import { requireAuth } from "../middleware/auth";
import { nowSeconds } from "../lib/validate";
import { logEvent, EVENTS } from "../lib/events";
import { sendEmail, welcomeEmail, verificationEmail } from "../lib/email";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

app.post("/register", async (c) => {
  const cfg = await getConfig(c.env);
  if (!cfg.setup_complete) return c.json({ error: "Site not set up yet" }, 400);
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

  const canEmail = cfg.email_enabled && !!c.env.EMAIL && !!cfg.email_from;
  const shouldVerify = cfg.require_email_verification && canEmail;

  const hash = await hashPassword(password);
  const res = await c.env.DB.prepare(
    "INSERT INTO users (name, email, password_hash, role, affiliation, country, website, bracket_id, verified, created_at) VALUES (?, ?, ?, 'user', ?, ?, ?, ?, ?, ?)"
  )
    .bind(name, email, hash, body.affiliation || null, body.country || null, body.website || null, body.bracket_id || null, shouldVerify ? 0 : 1, nowSeconds())
    .run();
  const userId = res.meta.last_row_id as number;
  const token = await createSession(c.env, userId);
  c.header("Set-Cookie", sessionCookie(token));
  c.set("user", { id: userId, name, email, role: "user", team_id: null, is_captain: 0, verified: shouldVerify ? 0 : 1 });
  await logEvent(c, EVENTS.REGISTER, { message: name });

  if (shouldVerify) {
    await sendVerification(c, cfg, userId, email, name);
  } else if (cfg.email_on_register && canEmail) {
    const tpl = welcomeEmail(cfg, name);
    c.executionCtx.waitUntil(sendEmail(c.env, cfg, email, tpl.subject, tpl.html).then(() => {}));
  }
  return c.json({ ok: true, verification_required: shouldVerify });
});

// Generate a verification token, store it in KV (24h), and email the link.
async function sendVerification(c: any, cfg: any, userId: number, email: string, name: string) {
  const token = randomToken(24);
  await c.env.SESSIONS.put(`verify:${token}`, String(userId), { expirationTtl: 60 * 60 * 24 });
  const link = `${new URL(c.req.url).origin}/api/auth/verify?token=${token}`;
  const tpl = verificationEmail(cfg, name, link);
  c.executionCtx.waitUntil(sendEmail(c.env, cfg, email, tpl.subject, tpl.html).then(() => {}));
}

// Verify link target (clicked from email) → marks user verified, redirects to app.
app.get("/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.redirect("/?verified=invalid");
  const userId = await c.env.SESSIONS.get(`verify:${token}`);
  if (!userId) return c.redirect("/?verified=expired");
  await c.env.DB.prepare("UPDATE users SET verified = 1 WHERE id = ?").bind(Number(userId)).run();
  await c.env.SESSIONS.delete(`verify:${token}`);
  return c.redirect("/?verified=1");
});

// Resend the verification email to the logged-in (unverified) user.
app.post("/resend-verification", requireAuth, async (c) => {
  const u = c.var.user!;
  if (u.verified) return c.json({ ok: true, already: true });
  const cfg = await getConfig(c.env);
  if (!(cfg.email_enabled && c.env.EMAIL && cfg.email_from))
    return c.json({ error: "Email sending is not configured" }, 400);
  await sendVerification(c, cfg, u.id, u.email, u.name);
  return c.json({ ok: true });
});

app.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ident = String(body.email || body.name || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!ident || !password) return c.json({ error: "Missing credentials" }, 400);

  const user = await c.env.DB.prepare(
    "SELECT id, password_hash, banned FROM users WHERE lower(email) = ? OR lower(name) = ?"
  )
    .bind(ident, ident)
    .first<{ id: number; password_hash: string; banned: number }>();
  if (!user || !(await verifyPassword(password, user.password_hash)))
    return c.json({ error: "Invalid credentials" }, 401);
  if (user.banned) return c.json({ error: "Account banned" }, 403);

  const token = await createSession(c.env, user.id);
  c.header("Set-Cookie", sessionCookie(token));
  c.set("user", { id: user.id, name: "", email: "", role: "user", team_id: null, is_captain: 0, verified: 1 });
  await logEvent(c, EVENTS.LOGIN, {});
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
