-- idkCTF schema (D1 / SQLite)
-- A CTFd-style platform supporting both team & individual modes and
-- per-challenge static or dynamic scoring.

-- Site configuration: a simple key/value store.
CREATE TABLE config (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Users (competitors and admins).
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
  team_id       INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  is_captain    INTEGER NOT NULL DEFAULT 0,
  affiliation   TEXT,
  country       TEXT,
  website       TEXT,
  hidden        INTEGER NOT NULL DEFAULT 0,      -- excluded from scoreboard
  banned        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_users_team ON users(team_id);

-- Teams (used when the CTF runs in team mode).
CREATE TABLE teams (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  invite_code   TEXT NOT NULL UNIQUE,
  captain_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  affiliation   TEXT,
  country       TEXT,
  website       TEXT,
  hidden        INTEGER NOT NULL DEFAULT 0,
  banned        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

-- Challenges.
CREATE TABLE challenges (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'misc',
  description     TEXT NOT NULL DEFAULT '',
  connection_info TEXT,                            -- e.g. nc host port / URL
  type            TEXT NOT NULL DEFAULT 'static',  -- 'static' | 'dynamic'
  state           TEXT NOT NULL DEFAULT 'hidden',  -- 'visible' | 'hidden'
  value           INTEGER NOT NULL DEFAULT 100,    -- static value OR dynamic initial value
  initial         INTEGER,                         -- dynamic: starting value
  minimum         INTEGER,                         -- dynamic: floor value
  decay           INTEGER,                         -- dynamic: solves to reach minimum
  max_attempts    INTEGER NOT NULL DEFAULT 0,      -- 0 = unlimited
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_challenges_state ON challenges(state);

-- Flags for a challenge. A challenge may have multiple acceptable flags.
CREATE TABLE flags (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  type         TEXT NOT NULL DEFAULT 'static',  -- 'static' | 'static_ci' | 'regex'
  content      TEXT NOT NULL
);
CREATE INDEX idx_flags_challenge ON flags(challenge_id);

-- Hints (cost points to unlock).
CREATE TABLE hints (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  cost         INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_hints_challenge ON hints(challenge_id);

-- Hint unlocks (records who paid for which hint).
CREATE TABLE hint_unlocks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  hint_id    INTEGER NOT NULL REFERENCES hints(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id    INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_hint_unlock_unique ON hint_unlocks(hint_id, user_id);

-- Challenge file attachments. Stored in R2 when available (r2_key set),
-- otherwise inline in D1 as base64 (data set).
CREATE TABLE files (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  size         INTEGER NOT NULL DEFAULT 0,
  content_type TEXT,
  r2_key       TEXT,
  data         TEXT,                              -- base64 fallback
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_files_challenge ON files(challenge_id);

-- Every submission attempt (correct or not), for auditing & rate limiting.
CREATE TABLE submissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id      INTEGER,
  provided     TEXT NOT NULL,
  correct      INTEGER NOT NULL DEFAULT 0,
  ip           TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_submissions_challenge ON submissions(challenge_id);
CREATE INDEX idx_submissions_user ON submissions(user_id);

-- Confirmed solves. One per (challenge, account). In team mode the account is
-- the team; in individual mode it is the user. We store both for flexibility.
CREATE TABLE solves (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id      INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_solve_user ON solves(challenge_id, user_id);
CREATE UNIQUE INDEX idx_solve_team ON solves(challenge_id, team_id) WHERE team_id IS NOT NULL;
CREATE INDEX idx_solves_challenge ON solves(challenge_id);

-- Manual point adjustments / bonuses (positive or negative).
CREATE TABLE awards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  team_id    INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  description TEXT,
  category   TEXT,
  value      INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
