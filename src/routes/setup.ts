import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { getConfig, setConfig } from "../lib/config";
import { hashPassword } from "../lib/auth";
import { createSession, sessionCookie } from "../lib/session";
import { nowSeconds } from "../lib/validate";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// One-time setup wizard: creates the first admin and core config.
app.post("/", async (c) => {
  const cfg = await getConfig(c.env);
  if (cfg.setup_complete) return c.json({ error: "Setup already completed" }, 400);

  const body = await c.req.json().catch(() => ({}));
  const { ctf_name, ctf_description, mode, admin_name, admin_email, admin_password } = body;
  if (!admin_name || !admin_email || !admin_password)
    return c.json({ error: "Admin name, email and password are required" }, 400);
  if (String(admin_password).length < 8)
    return c.json({ error: "Admin password must be at least 8 characters" }, 400);

  const now = nowSeconds();
  const hash = await hashPassword(admin_password);
  const res = await c.env.DB.prepare(
    "INSERT INTO users (name, email, password_hash, role, verified, hidden, created_at) VALUES (?, ?, ?, 'admin', 1, 1, ?)"
  )
    .bind(admin_name, admin_email, hash, now)
    .run();
  const userId = res.meta.last_row_id as number;

  await setConfig(c.env, {
    setup_complete: true,
    ctf_name: ctf_name || "idkCTF",
    ctf_description: ctf_description || "A capture-the-flag competition by idktheflag.",
    mode: mode === "users" ? "users" : "teams",
    registration_open: true,
    site_lockdown: false,
    visibility: body.visibility === "public" ? "public" : "private",
    scoreboard_visible: true,
    start_time: body.start_time || null,
    end_time: body.end_time || null,
    theme: "idktheflag",
    accent: "#cf2336",
    email_enabled: true,
    email_from: "no-reply@idktheflag.sh",
    email_from_name: "idkCTF",
    email_on_register: true,
    email_verification_required: true,
  });

  const token = await createSession(c.env, userId);
  c.header("Set-Cookie", sessionCookie(token));
  return c.json({ ok: true });
});

export default app;
