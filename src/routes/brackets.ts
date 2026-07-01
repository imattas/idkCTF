import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { getConfig } from "../lib/config";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Public list of brackets (divisions) for registration + scoreboard filtering.
app.get("/", async (c) => {
  const cfg = await getConfig(c.env);
  if (cfg.site_lockdown && !c.var.user) return c.json({ brackets: [] });
  const rows = await c.env.DB.prepare(
    "SELECT id, name, description, type FROM brackets ORDER BY name"
  ).all();
  return c.json({ brackets: rows.results });
});

export default app;
