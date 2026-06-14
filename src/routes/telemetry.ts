import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { logEvent, EVENTS } from "../lib/events";
import { getConfig } from "../lib/config";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Client-side page-view beacon. Records navigation/refresh activity with full
// request metadata (IP, network, VPN flag, user-agent). Only logged-in users
// are recorded, and only when view logging is enabled, to keep the log useful.
app.post("/pageview", async (c) => {
  if (!c.var.user) return c.json({ ok: true });
  const cfg = await getConfig(c.env);
  if (!cfg.log_challenge_views) return c.json({ ok: true });
  const body = await c.req.json().catch(() => ({}));
  const path = String(body.path || "").slice(0, 200);
  const reason = body.refresh ? "refresh" : "navigate";
  await logEvent(c, EVENTS.PAGE_VIEW, { message: path, metadata: { path, reason } });
  return c.json({ ok: true });
});

export default app;
