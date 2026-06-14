-- Event / audit log: every meaningful action (views, submissions, auth, etc.)
CREATE TABLE events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL,        -- e.g. challenge.view, flag.submit, solve, auth.login
  user_id      INTEGER,
  team_id      INTEGER,
  challenge_id INTEGER,
  ip           TEXT,
  country      TEXT,
  asn          INTEGER,
  as_org       TEXT,
  colo         TEXT,
  is_vpn       INTEGER NOT NULL DEFAULT 0,
  user_agent   TEXT,
  message      TEXT,
  metadata     TEXT,                 -- JSON blob
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_user ON events(user_id);
CREATE INDEX idx_events_created ON events(created_at);

-- Plugins / integrations. Built-ins are seeded; config is a JSON blob.
CREATE TABLE plugins (
  name       TEXT PRIMARY KEY,
  enabled    INTEGER NOT NULL DEFAULT 0,
  config     TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER
);

-- Personal API tokens for the user-facing REST API (stored hashed).
CREATE TABLE api_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  prefix     TEXT NOT NULL,
  last_used  INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_api_tokens_user ON api_tokens(user_id);
CREATE UNIQUE INDEX idx_api_tokens_hash ON api_tokens(token_hash);

-- Branding assets (logo, favicon). Stored in R2 when available, else inline base64.
CREATE TABLE branding (
  key          TEXT PRIMARY KEY,     -- 'logo' | 'favicon'
  content_type TEXT,
  data         TEXT,
  r2_key       TEXT,
  updated_at   INTEGER
);

-- Seed built-in plugins (disabled by default).
INSERT INTO plugins (name, enabled, config) VALUES
  ('discord_webhook', 0, '{"url":"","events":["solve","first_blood"],"username":"CloudCTF","mention":""}'),
  ('generic_webhook', 0, '{"url":"","events":["solve","first_blood","auth.register"],"secret":""}');
