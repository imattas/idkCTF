import { Hono } from "hono";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Public list of brackets (divisions) for registration + scoreboard filtering.
app.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT id, name, description, type FROM brackets ORDER BY name"
  ).all();
  return c.json({ brackets: rows.results });
});

export default app;
