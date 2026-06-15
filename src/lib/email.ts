import type { Env } from "../types";
import type { SiteConfig } from "./config";

export interface SendResult {
  ok: boolean;
  error?: string;
}

// Send a transactional email via the Cloudflare Email Sending binding.
// The `from` domain must be onboarded (`wrangler email sending enable <domain>`).
export async function sendEmail(
  env: Env,
  cfg: SiteConfig,
  to: string,
  subject: string,
  html: string,
  text?: string
): Promise<SendResult> {
  if (!cfg.email_enabled) return { ok: false, error: "Email is disabled in settings" };
  if (!env.EMAIL) return { ok: false, error: "EMAIL binding not configured on this Worker" };
  if (!cfg.email_from) return { ok: false, error: "No from-address configured" };
  try {
    await env.EMAIL.send({
      to,
      from: { email: cfg.email_from, name: cfg.email_from_name || cfg.ctf_name },
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ""),
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export function welcomeEmail(cfg: SiteConfig, name: string): { subject: string; html: string } {
  return {
    subject: `Welcome to ${cfg.ctf_name}`,
    html: `<div style="font-family:sans-serif">
      <h2>Welcome, ${escapeHtml(name)} 👋</h2>
      <p>Your account on <strong>${escapeHtml(cfg.ctf_name)}</strong> is ready. Good luck and happy hacking!</p>
    </div>`,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
