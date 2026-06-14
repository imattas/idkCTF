# CloudCTF

A full **CTFd-style capture-the-flag platform that runs entirely on Cloudflare** — Workers, D1, KV, and (optionally) R2. No origin server, no containers, no database to babysit.

**Live:** https://cloudctf.imattas.workers.dev

---

## Features

- **Auth & sessions** — register / login / logout, PBKDF2 password hashing (WebCrypto), HttpOnly cookie sessions stored in KV (revocable, 7-day TTL).
- **Both competition modes** — run as **teams** or **individuals**; switch in Admin → Settings. Team mode has create/join (invite codes), captain, size limits.
- **Both scoring models, per challenge** — **static** (fixed value) or **dynamic** (CTFd quadratic decay: value drops as more solve it). The scoreboard always reflects live values.
- **Challenges** — categories, descriptions, connection info, multiple flags per challenge (`static`, case-insensitive, or `regex`), hidden/visible state, max-attempt limits, sort order.
- **Hints** — point-cost hints; unlocking deducts from score and is shared across a team.
- **File attachments** — stored in **R2** when available, otherwise **inline in D1** (≤8 MB) so it works even without R2. Downloads stream through the Worker with access control.
- **Scoreboard** — ranked standings with correct tiebreaks (earliest-to-reach wins), a score-over-time chart (Recharts), and **scoreboard freeze** support.
- **Competition timing** — start / end times gate submissions; a countdown shows on the home page.
- **Admin panel** — dashboard stats, full challenge editor (flags/hints/files), user & team management (hide/ban/role/delete), point awards (bonus/penalty), submission log, and all site settings.
- **First-run setup wizard** — creates the first admin and core config; locks itself after completion.

### Configurability, plugins & integrations

- **Plugin system** — built-in, config-driven integrations that fire on events. Ships with **Discord webhook** (solve / first-blood / registration announcements, with embeds + role mentions) and a **generic webhook** (HMAC-signed JSON POST to any URL). Enable/configure/test each from Admin → Plugins. A first blood also satisfies "solve" subscribers.
- **Event & audit logging** — every meaningful action is logged: challenge views, flag submissions (correct/incorrect), solves, first bloods, hint unlocks, logins, registrations, team create/join. Each event records the **IP, country, ASN, AS organization, Cloudflare colo, user-agent**, and a **heuristic VPN/proxy flag** (based on the connecting network's AS org). Browse/filter it in Admin → Logs.
- **VPN/proxy controls** — optionally **block submissions** from detected VPN/proxy networks; blocked attempts are logged.
- **Themes & branding** — 6 preset themes (Midnight, Hacker Green, Synthwave, Crimson, Ocean, Light), a live **accent colour** picker, **logo + favicon upload** (R2 or inline D1), **custom CSS**, and **footer HTML** — all in Admin → Appearance.
- **Email (Cloudflare Email Sending)** — welcome emails on registration + admin test sends via the `send_email` Worker binding. Configure the from-address (on an onboarded domain) and toggles in Admin → Settings.
- **User API tokens** — users mint personal tokens in their profile and call the API with `Authorization: Bearer <token>` (challenges, submissions, scoreboard, etc.). Tokens are stored hashed; shown once.
- **More site controls** — pause submissions (lockdown), allow/forbid display-name changes, toggle challenge-view logging, scoreboard freeze, and the rest of the CTFd-style knobs.

## Architecture

| Layer | Tech |
|------|------|
| API / server | **Hono** on **Cloudflare Workers** (TypeScript) |
| Database | **D1** (SQLite) — schema in [migrations/0001_init.sql](migrations/0001_init.sql) |
| Sessions / rate-limit | **KV** |
| File storage | **R2** if bound, else inline D1 (automatic fallback) |
| Frontend | **React 19 + Vite + TypeScript + Tailwind v4 + TanStack Query + React Router**, served as Worker static assets (SPA) |

A single Worker serves both the API (`/api/*`) and the built SPA (everything else, with SPA fallback).

```
src/                Worker backend
  index.ts          entry: mounts /api + static assets
  routes/           auth, setup, teams, challenges, submissions, hints, scoreboard, files, admin
  lib/              auth (PBKDF2), session, config, scoring, validate, standings
  middleware/       auth guards
web/                React app (built into dist/)
migrations/         D1 schema
```

## Local development

```bash
npm install

# terminal 1 — Worker + API on :8787 against local D1
npm run db:migrate:local     # apply schema to local D1
npm run build                # build the SPA once so the Worker can serve it
npm run dev                  # wrangler dev

# terminal 2 — Vite with HMR on :5173, proxies /api -> :8787
npm run dev:web
```

Open http://localhost:5173 and complete the setup wizard.

## Deploy

```bash
# one-time: create resources, then put the IDs in wrangler.jsonc
npx wrangler d1 create cloudctf
npx wrangler kv namespace create SESSIONS

npm run db:migrate           # apply schema to remote D1
npm run deploy               # vite build && wrangler deploy
```

`wrangler.jsonc` already contains the IDs for the deployed instance.

### Enabling R2 file storage (optional)

The platform stores files inline in D1 by default. To use R2 for larger attachments:

```bash
npx wrangler r2 bucket create cloudctf-files
```

Then uncomment the `r2_buckets` block at the bottom of `wrangler.jsonc` and redeploy. The Worker detects the `FILES` binding automatically.

## Admin

Log in with the admin account created during setup, then open **Admin** in the nav:

- **Challenges** — create challenges, attach flags/hints/files, toggle visible.
- **Users / Teams** — hide, ban, change roles, grant point awards, delete.
- **Submissions** — full audit log (correct/incorrect, IP, time).
- **Settings** — mode, visibility, registration, scoreboard visibility, start/end/freeze times.

## Scoring formulas

- **Static:** challenge is always worth its fixed `value`.
- **Dynamic:** `value = ((minimum − initial) / decay²) · solves² + initial`, clamped to `[minimum, initial]`. Every solver of a challenge is worth its *current* value (matching CTFd).
- **Score** = Σ current value of solved challenges + awards − hint costs. Ties broken by earliest last-scoring-event.
