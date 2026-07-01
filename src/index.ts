import { Hono } from "hono";
import type { Env, Variables } from "./types";
import { loadUser } from "./middleware/auth";
import { getConfig, competitionState } from "./lib/config";
import { nowSeconds } from "./lib/validate";

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
// Defense-in-depth security headers on API responses (best-effort; some
// responses like file streams have immutable headers).
api.use("*", async (c, next) => {
  await next();
  try {
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("X-Robots-Tag", "noindex, nofollow, noarchive, noimageindex");
  } catch {}
});
api.use("*", loadUser);

// Everything the frontend needs on load: public config + current user.
api.get("/bootstrap", async (c) => {
  const cfg = await getConfig(c.env);
  const u = c.var.user;
  const logo = await c.env.DB.prepare("SELECT 1 FROM branding WHERE key = 'logo'").first();
  return c.json({
    config: {
      setup_complete: cfg.setup_complete,
      ctf_name: cfg.ctf_name,
      ctf_description: cfg.ctf_description,
      mode: cfg.mode,
      registration_open: cfg.registration_open,
      site_lockdown: cfg.site_lockdown,
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
      email_verification_required: cfg.email_verification_required,
    },
    competition_state: competitionState(cfg, nowSeconds()),
    server_time: nowSeconds(),
    user: u
      ? {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          team_id: u.team_id,
          is_captain: u.is_captain,
          affiliation: u.affiliation,
          country: u.country,
          website: u.website,
          verified: u.verified,
          suspended: u.suspended,
          prize_disqualified: u.prize_disqualified,
          under_review: u.under_review,
        }
      : null,
  });
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
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

// Everything else => static SPA assets (wrangler serves index.html for unknown
// routes). Add security headers (clickjacking / MIME-sniff protection).
app.all("*", async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  const out = new Response(res.body, res);
  out.headers.set("X-Content-Type-Options", "nosniff");
  out.headers.set("X-Frame-Options", "SAMEORIGIN");
  out.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  out.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, noimageindex");
  return out;
});

export default app;
