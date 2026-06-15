import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { getConfig } from "../lib/config";
import { logEvent, EVENTS } from "../lib/events";
import { canAccessChallenge } from "../lib/access";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Download a challenge file (from R2 when available, else inline D1 storage).
app.get("/:id", async (c) => {
  const cfg = await getConfig(c.env);
  if (cfg.visibility === "private" && !c.var.user) return c.json({ error: "Forbidden" }, 403);

  const id = Number(c.req.param("id"));
  const file = await c.env.DB.prepare(
    `SELECT f.*, ch.state AS ch_state FROM files f JOIN challenges ch ON ch.id = f.challenge_id WHERE f.id = ?`
  )
    .bind(id)
    .first<any>();
  if (!file) return c.json({ error: "Not found" }, 404);
  // Hidden and still-locked (prerequisite) challenges' files are inaccessible.
  if (!(await canAccessChallenge(c.env, file.challenge_id, c.var.user, cfg.mode)))
    return c.json({ error: "Not found" }, 404);

  if (c.var.user) {
    await logEvent(c, EVENTS.DOWNLOAD, { challenge_id: file.challenge_id, message: file.name });
  }

  const headers: Record<string, string> = {
    "Content-Type": file.content_type || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${String(file.name).replace(/"/g, "")}"`,
    "X-Content-Type-Options": "nosniff",
  };

  if (file.r2_key && c.env.FILES) {
    const obj = await c.env.FILES.get(file.r2_key);
    if (!obj) return c.json({ error: "Missing object" }, 404);
    return new Response(obj.body, { headers });
  }
  if (file.data) {
    return new Response(b64ToBytes(file.data), { headers });
  }
  return c.json({ error: "File data unavailable" }, 404);
});

export default app;
