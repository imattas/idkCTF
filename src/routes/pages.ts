import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { getConfig } from "../lib/config";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Published pages for the top nav and the footer.
app.get("/", async (c) => {
  const cfg = await getConfig(c.env);
  if (cfg.site_lockdown && !c.var.user) return c.json({ nav: [], footer: [], pages: [] });
  const nav = await c.env.DB.prepare(
    "SELECT slug, title, nav_order FROM pages WHERE published = 1 AND nav = 1 ORDER BY nav_order, title"
  ).all();
  const footer = await c.env.DB.prepare(
    "SELECT slug, title, nav_order FROM pages WHERE published = 1 AND footer = 1 ORDER BY nav_order, title"
  ).all();
  return c.json({ nav: nav.results, footer: footer.results, pages: nav.results });
});

// Fetch a single page by slug.
app.get("/:slug", async (c) => {
  const cfg = await getConfig(c.env);
  if (cfg.site_lockdown && !c.var.user) return c.json({ error: "Login required" }, 401);
  const slug = c.req.param("slug");
  const isAdmin = c.var.user?.role === "admin";
  const page = await c.env.DB.prepare("SELECT * FROM pages WHERE slug = ?").bind(slug).first<any>();
  if (!page || (!page.published && !isAdmin)) return c.json({ error: "Not found" }, 404);
  if (page.auth_required && !c.var.user) return c.json({ error: "Login required" }, 401);
  return c.json({ page });
});

export default app;
