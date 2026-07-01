import type { Env } from "../types";

export interface SiteConfig {
  setup_complete: boolean;
  ctf_name: string;
  ctf_description: string;
  mode: "teams" | "users"; // team-based or individual
  team_size_limit: number; // 0 = unlimited
  registration_open: boolean;
  site_lockdown: boolean; // require an existing account; disables public registration
  visibility: "public" | "private"; // private => must be logged in to see challenges/scoreboard
  scoreboard_visible: boolean;
  freeze_time: number | null; // epoch seconds; scoreboard frozen after this
  start_time: number | null;
  end_time: number | null;
  // Behaviour
  paused: boolean; // when true, submissions are blocked
  block_vpn: boolean; // reject submissions from detected VPN/proxy IPs
  block_vpn_signup: boolean; // reject registrations from detected VPN/proxy IPs
  allow_name_change: boolean;
  log_challenge_views: boolean;
  require_access_code: boolean; // require a code to register
  access_code: string;
  auto_review: boolean; // auto-flag suspicious solves for review
  review_fast_solve_seconds: number; // flag solves faster than this after first view
  // Appearance
  theme: string; // preset id
  accent: string; // hex accent colour
  custom_css: string;
  footer_html: string;
  home_content: string; // HTML/markdown shown on the landing page
  home_format: "markdown" | "html";
  custom_head: string; // raw HTML injected into <head> (analytics, fonts, meta)
  // Email (Cloudflare Email Sending)
  email_enabled: boolean;
  email_from: string; // address on an onboarded domain
  email_from_name: string;
  email_on_register: boolean;
}

const DEFAULTS: SiteConfig = {
  setup_complete: false,
  ctf_name: "idkCTF",
  ctf_description: "A capture-the-flag competition by idktheflag.",
  mode: "teams",
  team_size_limit: 0,
  registration_open: true,
  site_lockdown: false,
  visibility: "private",
  scoreboard_visible: true,
  freeze_time: null,
  start_time: null,
  end_time: null,
  paused: false,
  block_vpn: false,
  block_vpn_signup: false,
  allow_name_change: true,
  log_challenge_views: true,
  require_access_code: false,
  access_code: "",
  auto_review: true,
  review_fast_solve_seconds: 30,
  theme: "idktheflag",
  accent: "#cf2336",
  custom_css: "",
  footer_html: "",
  home_content: "",
  home_format: "markdown",
  custom_head: "",
  email_enabled: false,
  email_from: "",
  email_from_name: "idkCTF",
  email_on_register: false,
};

export async function getConfig(env: Env): Promise<SiteConfig> {
  const rows = await env.DB.prepare("SELECT key, value FROM config").all<{ key: string; value: string }>();
  const map = new Map(rows.results.map((r) => [r.key, r.value]));
  const out: SiteConfig = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof SiteConfig)[]) {
    if (!map.has(key)) continue;
    const raw = map.get(key)!;
    const def = DEFAULTS[key];
    if (typeof def === "boolean") (out as any)[key] = raw === "true" || raw === "1";
    else if (typeof def === "number") (out as any)[key] = raw === "" ? null : Number(raw);
    else if (def === null) (out as any)[key] = raw === "" ? null : Number(raw);
    else (out as any)[key] = raw;
  }
  return out;
}

export async function setConfig(env: Env, updates: Partial<SiteConfig>): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  for (const [key, value] of Object.entries(updates)) {
    const str = value === null || value === undefined ? "" : String(value);
    stmts.push(
      env.DB.prepare(
        "INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).bind(key, str)
    );
  }
  if (stmts.length) await env.DB.batch(stmts);
}

// Whether the competition is currently accepting submissions.
export function competitionState(cfg: SiteConfig, now: number): "before" | "running" | "ended" {
  if (cfg.start_time && now < cfg.start_time) return "before";
  if (cfg.end_time && now > cfg.end_time) return "ended";
  return "running";
}
