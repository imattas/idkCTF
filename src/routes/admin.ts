import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { requireAdmin } from "../middleware/auth";
import { getConfig, setConfig } from "../lib/config";
import { randomToken, hashPassword } from "../lib/auth";
import { nowSeconds } from "../lib/validate";
import { listPlugins, savePlugin, getPlugin, deliverDiscord, deliverGeneric } from "../lib/plugins";
import { sendEmail } from "../lib/email";
import { logEvent, EVENTS } from "../lib/events";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("*", requireAdmin);

const INLINE_LIMIT = 8 * 1024 * 1024; // 8MB max for D1 inline file storage

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
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
    "visibility", "scoreboard_visible", "freeze_time", "start_time", "end_time",
    "paused", "block_vpn", "allow_name_change", "log_challenge_views",
    "theme", "accent", "custom_css", "footer_html", "home_content", "home_format", "custom_head",
    "email_enabled", "email_from", "email_from_name", "email_on_register",
  ];
  const updates: any = {};
  for (const k of allowed) if (k in body) updates[k] = body[k];
  await setConfig(c.env, updates);
  await logEvent(c, EVENTS.ADMIN_ACTION, { message: `Updated site settings (${Object.keys(updates).join(", ")})` });
  return c.json({ ok: true });
});

app.get("/stats", async (c) => {
  const q = (sql: string) => c.env.DB.prepare(sql).first<{ n: number }>();
  const [users, teams, challenges, solves, submissions, correct] = await Promise.all([
    q("SELECT COUNT(*) AS n FROM users"),
    q("SELECT COUNT(*) AS n FROM teams"),
    q("SELECT COUNT(*) AS n FROM challenges"),
    q("SELECT COUNT(*) AS n FROM solves"),
    q("SELECT COUNT(*) AS n FROM submissions"),
    q("SELECT COUNT(*) AS n FROM submissions WHERE correct = 1"),
  ]);
  return c.json({
    users: users?.n ?? 0,
    teams: teams?.n ?? 0,
    challenges: challenges?.n ?? 0,
    solves: solves?.n ?? 0,
    submissions: submissions?.n ?? 0,
    correct: correct?.n ?? 0,
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
  const res = await c.env.DB.prepare(
    `INSERT INTO challenges (name, category, description, connection_info, type, state, value, initial, minimum, decay, max_attempts, sort_order, prerequisites, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      b.name, b.category || "misc", b.description || "", b.connection_info || null,
      b.type === "dynamic" ? "dynamic" : "static", b.state === "visible" ? "visible" : "hidden",
      Number(b.value ?? b.initial ?? 100), b.initial ?? null, b.minimum ?? null, b.decay ?? null,
      Number(b.max_attempts ?? 0), Number(b.sort_order ?? 0),
      Array.isArray(b.prerequisites) && b.prerequisites.length ? JSON.stringify(b.prerequisites) : null,
      Array.isArray(b.tags) && b.tags.length ? JSON.stringify(b.tags) : null,
      nowSeconds()
    )
    .run();
  await logEvent(c, EVENTS.CHALLENGE_CREATE, { challenge_id: res.meta.last_row_id as number, message: b.name });
  return c.json({ ok: true, id: res.meta.last_row_id });
});

app.patch("/challenges/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  const cols = [
    "name", "category", "description", "connection_info", "type", "state",
    "value", "initial", "minimum", "decay", "max_attempts", "sort_order",
  ];
  const sets: string[] = [];
  const binds: any[] = [];
  for (const col of cols) if (col in b) { sets.push(`${col} = ?`); binds.push(b[col]); }
  if ("prerequisites" in b) {
    sets.push("prerequisites = ?");
    binds.push(Array.isArray(b.prerequisites) && b.prerequisites.length ? JSON.stringify(b.prerequisites) : null);
  }
  if ("tags" in b) {
    sets.push("tags = ?");
    binds.push(Array.isArray(b.tags) && b.tags.length ? JSON.stringify(b.tags) : null);
  }
  if (!sets.length) return c.json({ ok: true });
  binds.push(id);
  await c.env.DB.prepare(`UPDATE challenges SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
  const nm = await c.env.DB.prepare("SELECT name FROM challenges WHERE id = ?").bind(id).first<{ name: string }>();
  await logEvent(c, EVENTS.CHALLENGE_UPDATE, { challenge_id: id, message: nm?.name ?? `#${id}` });
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
    `INSERT INTO challenges (name, category, description, connection_info, type, state, value, initial, minimum, decay, max_attempts, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, 'hidden', ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(`${src.name} (copy)`, src.category, src.description, src.connection_info, src.type,
      src.value, src.initial, src.minimum, src.decay, src.max_attempts, src.sort_order, now)
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
  await c.env.DB.prepare("DELETE FROM flags WHERE id = ?").bind(Number(c.req.param("id"))).run();
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
    `SELECT u.id, u.name, u.email, u.role, u.team_id, u.is_captain, u.hidden, u.banned, u.created_at,
            t.name AS team_name FROM users u LEFT JOIN teams t ON t.id = u.team_id ORDER BY u.id`
  ).all();
  return c.json({ users: rows.results });
});

app.patch("/users/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  // Safety: an admin can't remove their own admin role or ban themselves
  // (prevents accidentally locking yourself out of the admin panel).
  if (id === c.var.user!.id) {
    if ("role" in b && b.role !== "admin") return c.json({ error: "You can't remove your own admin role" }, 400);
    if ("banned" in b && b.banned) return c.json({ error: "You can't ban yourself" }, 400);
  }
  const cols = ["role", "hidden", "banned", "name", "email", "affiliation", "country", "website", "bracket_id", "team_id", "is_captain"];
  const sets: string[] = [];
  const binds: any[] = [];
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
  else if ("role" in b) await logEvent(c, EVENTS.ADMIN_ACTION, { message: `Set user #${id} role to ${b.role}` });
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
  return c.json({ user, solves: solves.results, awards: awards.results });
});

// Grant a solve to a user (and their team, if any).
app.post("/users/:id/grant-solve", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  const challengeId = Number(b.challenge_id);
  if (!challengeId) return c.json({ error: "challenge_id required" }, 400);
  const u = await c.env.DB.prepare("SELECT team_id FROM users WHERE id = ?").bind(id).first<{ team_id: number | null }>();
  if (!u) return c.json({ error: "User not found" }, 404);
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
  const cols = ["name", "hidden", "banned", "bracket_id", "affiliation", "country", "website"];
  const sets: string[] = [];
  const binds: any[] = [];
  for (const col of cols) if (col in b) { sets.push(`${col} = ?`); binds.push(b[col] === "" ? null : b[col]); }
  if (!sets.length) return c.json({ ok: true });
  binds.push(id);
  await c.env.DB.prepare(`UPDATE teams SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
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
  const page = Math.max(0, Number(c.req.query("page") || 0));
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

/* ---------------- Plugins ---------------- */

app.get("/plugins", async (c) => c.json({ plugins: await listPlugins(c.env) }));

app.put("/plugins/:name", async (c) => {
  const name = c.req.param("name");
  const body = await c.req.json().catch(() => ({}));
  await savePlugin(c.env, name, !!body.enabled, body.config ?? {});
  await logEvent(c, EVENTS.ADMIN_ACTION, { message: `Updated plugin ${name}` });
  return c.json({ ok: true });
});

app.post("/plugins/:name/test", async (c) => {
  const name = c.req.param("name");
  const p = await getPlugin(c.env, name);
  if (!p) return c.json({ error: "Unknown plugin" }, 404);
  const payload = {
    type: "test", actor: { id: c.var.user!.id, name: c.var.user!.name },
    challenge_id: null, challenge_name: "Test Challenge", team_id: null,
    message: "This is a test event from CloudCTF", metadata: {}, ip: null, is_vpn: false,
    at: nowSeconds(),
  };
  try {
    if (name === "discord_webhook") await deliverDiscord(p.config, "solve", payload);
    else if (name === "generic_webhook") await deliverGeneric(p.config, "test", payload);
    else return c.json({ error: "This plugin has no test action" }, 400);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e?.message || "Delivery failed" }, 502);
  }
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
