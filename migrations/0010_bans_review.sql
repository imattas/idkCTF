-- IP and username bans.
CREATE TABLE bans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,                 -- 'ip' | 'username'
  value      TEXT NOT NULL,
  match      TEXT NOT NULL DEFAULT 'exact', -- 'exact' | 'contains' (username)
  reason     TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_bans_type ON bans(type);

-- Auto/manual review flags (suspected cheating).
CREATE TABLE review_flags (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER,
  team_id      INTEGER,
  challenge_id INTEGER,
  type         TEXT NOT NULL,   -- 'fast_solve' | 'no_view' | 'rapid' | 'manual'
  detail       TEXT,
  resolved     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_review_resolved ON review_flags(resolved);
CREATE UNIQUE INDEX idx_review_uniq ON review_flags(user_id, challenge_id, type);
