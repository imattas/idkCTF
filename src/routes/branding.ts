import { Hono } from "hono";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Public branding assets: /api/branding/logo, /api/branding/favicon
app.get("/:key", async (c) => {
  const key = c.req.param("key");
  if (key !== "logo" && key !== "favicon") return c.json({ error: "Not found" }, 404);
  const row = await c.env.DB.prepare("SELECT content_type, data, r2_key FROM branding WHERE key = ?")
    .bind(key)
    .first<{ content_type: string | null; data: string | null; r2_key: string | null }>();
  if (!row) return c.json({ error: "Not found" }, 404);

  const headers: Record<string, string> = {
    "Content-Type": row.content_type || "application/octet-stream",
    "Cache-Control": "public, max-age=300",
  };
  if (row.r2_key && c.env.FILES) {
    const obj = await c.env.FILES.get(row.r2_key);
    if (obj) return new Response(obj.body, { headers });
  }
  if (row.data) return new Response(b64ToBytes(row.data), { headers });
  return c.json({ error: "Not found" }, 404);
});

export default app;
