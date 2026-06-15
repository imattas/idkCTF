import { Hono } from "hono";
import type { Env, Variables } from "./types";
import { loadUser } from "./middleware/auth";
import { getConfig, competitionState } from "./lib/config";
import { nowSeconds } from "./lib/validate";
import { buildOpenApi } from "./lib/openapi";

import setup from "./routes/setup";
import auth from "./routes/auth";
import teams from "./routes/teams";
import challenges from "./routes/challenges";
import submissions from "./routes/submissions";
import hints from "./routes/hints";
import scoreboard from "./routes/scoreboard";
import files from "./routes/files";
import branding from "./routes/branding";
import pages from "./routes/pages";
import brackets from "./routes/brackets";
import profiles from "./routes/profiles";
import telemetry from "./routes/telemetry";
import me from "./routes/me";
import admin from "./routes/admin";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const api = new Hono<{ Bindings: Env; Variables: Variables }>();
api.use("*", loadUser);

// Everything the frontend needs on load: public config + current user.
api.get("/bootstrap", async (c) => {
  const cfg = await getConfig(c.env);
  const u = c.var.user;
  const logo = await c.env.DB.prepare("SELECT 1 FROM branding WHERE key = 'logo'").first();
  const feats = await c.env.DB.prepare("SELECT name FROM plugins WHERE enabled = 1 AND name IN ('challenge_reviews','writeups')").all<{ name: string }>();
  const featNames = new Set(feats.results.map((f) => f.name));
  return c.json({
    config: {
      setup_complete: cfg.setup_complete,
      ctf_name: cfg.ctf_name,
      ctf_description: cfg.ctf_description,
      mode: cfg.mode,
      registration_open: cfg.registration_open,
      visibility: cfg.visibility,
      scoreboard_visible: cfg.scoreboard_visible,
      start_time: cfg.start_time,
      end_time: cfg.end_time,
      freeze_time: cfg.freeze_time,
      team_size_limit: cfg.team_size_limit,
      paused: cfg.paused,
      theme: cfg.theme,
      accent: cfg.accent,
      custom_css: cfg.custom_css,
      footer_html: cfg.footer_html,
      home_content: cfg.home_content,
      home_format: cfg.home_format,
      custom_head: cfg.custom_head,
      has_logo: !!logo,
      require_access_code: cfg.require_access_code,
    },
    features: { reviews: featNames.has("challenge_reviews"), writeups: featNames.has("writeups") },
    competition_state: competitionState(cfg, nowSeconds()),
    server_time: nowSeconds(),
    user: u
      ? { id: u.id, name: u.name, email: u.email, role: u.role, team_id: u.team_id, is_captain: u.is_captain }
      : null,
  });
});

// Machine-readable API spec (downloadable from the docs page).
api.get("/openapi.json", async (c) => {
  const cfg = await getConfig(c.env);
  const origin = new URL(c.req.url).origin;
  c.header("Content-Disposition", "attachment; filename=cloudctf-openapi.json");
  return c.json(buildOpenApi(origin, cfg.ctf_name));
});

api.route("/setup", setup);
api.route("/auth", auth);
api.route("/teams", teams);
api.route("/challenges", challenges);
api.route("/submit", submissions);
api.route("/hints", hints);
api.route("/scoreboard", scoreboard);
api.route("/files", files);
api.route("/branding", branding);
api.route("/pages", pages);
api.route("/brackets", brackets);
api.route("/profile", profiles);
api.route("/telemetry", telemetry);
api.route("/me", me);
api.route("/admin", admin);

api.notFound((c) => c.json({ error: "Not found" }, 404));
api.onError((err, c) => {
  console.error("API error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

app.route("/api", api);

// Everything else => static SPA assets (wrangler serves index.html for unknown routes).
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
