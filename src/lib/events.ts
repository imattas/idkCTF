import type { AppContext, Env } from "../types";
import { dispatchToPlugins } from "./plugins";

export const EVENTS = {
  REGISTER: "auth.register",
  LOGIN: "auth.login",
  LOGOUT: "auth.logout",
  CHALLENGE_VIEW: "challenge.view",
  DOWNLOAD: "challenge.download",
  PAGE_VIEW: "page.view",
  FLAG_SUBMIT: "flag.submit",
  SOLVE: "solve",
  FIRST_BLOOD: "first_blood",
  HINT_UNLOCK: "hint.unlock",
  TEAM_CREATE: "team.create",
  TEAM_JOIN: "team.join",
  VPN_BLOCKED: "vpn.blocked",
  ADMIN_ACTION: "admin.action",
  CHALLENGE_CREATE: "challenge.create",
  CHALLENGE_UPDATE: "challenge.update",
  CHALLENGE_DELETE: "challenge.delete",
  REVIEW_FLAG: "review.flag",
} as const;

// Organisations commonly associated with hosting / proxy / VPN exit nodes.
// This is a heuristic (hosting ASN != always VPN), surfaced as a flag, not a verdict.
const VPN_ASORG_KEYWORDS = [
  "vpn", "proxy", "hosting", "datacenter", "data center", "colocation", "colo ",
  "cloud", "ovh", "digitalocean", "linode", "vultr", "amazon", "aws", "google",
  "azure", "microsoft", "hetzner", "m247", "leaseweb", "choopa", "quadranet",
  "nordvpn", "mullvad", "expressvpn", "private internet", "surfshark", "cyberghost",
  "cogent", "datacamp", "g-core", "contabo", "scaleway", "oracle",
];

export interface RequestMeta {
  ip: string | null;
  country: string | null;
  asn: number | null;
  as_org: string | null;
  colo: string | null;
  is_vpn: number;
  user_agent: string | null;
}

export function extractMeta(c: AppContext): RequestMeta {
  const cf = (c.req.raw as any).cf || {};
  const asOrg: string | null = cf.asOrganization ?? null;
  const lower = (asOrg || "").toLowerCase();
  const is_vpn = VPN_ASORG_KEYWORDS.some((k) => lower.includes(k)) ? 1 : 0;
  return {
    ip: c.req.header("CF-Connecting-IP") || null,
    country: cf.country ?? null,
    asn: typeof cf.asn === "number" ? cf.asn : null,
    as_org: asOrg,
    colo: cf.colo ?? null,
    is_vpn,
    user_agent: c.req.header("User-Agent") || null,
  };
}

export interface LogOpts {
  team_id?: number | null;
  challenge_id?: number | null;
  message?: string;
  metadata?: Record<string, unknown>;
}

// Record an event and fan it out to enabled plugins (non-blocking).
export async function logEvent(c: AppContext, type: string, opts: LogOpts = {}): Promise<void> {
  const meta = extractMeta(c);
  const user = c.var.user;
  const now = Math.floor(Date.now() / 1000);
  const row = {
    type,
    user_id: user?.id ?? null,
    team_id: opts.team_id ?? user?.team_id ?? null,
    challenge_id: opts.challenge_id ?? null,
    ...meta,
    message: opts.message ?? null,
    metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
    created_at: now,
  };
  try {
    await c.env.DB.prepare(
      `INSERT INTO events (type, user_id, team_id, challenge_id, ip, country, asn, as_org, colo, is_vpn, user_agent, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        row.type, row.user_id, row.team_id, row.challenge_id, row.ip, row.country,
        row.asn, row.as_org, row.colo, row.is_vpn, row.user_agent, row.message, row.metadata, row.created_at
      )
      .run();
  } catch (e) {
    console.error("logEvent insert failed", e);
  }

  // Fan out to plugins in the background.
  const payload = {
    type,
    actor: user ? { id: user.id, name: user.name } : null,
    challenge_id: row.challenge_id,
    team_id: row.team_id,
    message: row.message,
    metadata: opts.metadata ?? {},
    ip: row.ip,
    is_vpn: !!row.is_vpn,
    at: now,
  };
  try {
    c.executionCtx.waitUntil(dispatchToPlugins(c.env, type, payload));
  } catch {
    // executionCtx may be unavailable in some contexts; dispatch inline as fallback.
    await dispatchToPlugins(c.env, type, payload).catch(() => {});
  }
}

export type PluginPayload = {
  type: string;
  actor: { id: number; name: string } | null;
  challenge_id: number | null;
  team_id: number | null;
  message: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  is_vpn: boolean;
  at: number;
};

export type { Env };
