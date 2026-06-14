-- Remove the webhook-only plugins that were just added.
DELETE FROM plugins WHERE name IN ('slack_webhook', 'telegram', 'msteams_webhook');

-- Feature plugins (not webhooks): enable to unlock in-app functionality.
INSERT INTO plugins (name, enabled, config) VALUES
  ('challenge_reviews', 0, '{}'),
  ('writeups', 0, '{}');

-- Player reviews/ratings on challenges they've solved.
CREATE TABLE reviews (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id      INTEGER,
  rating       INTEGER NOT NULL,       -- 1..5
  comment      TEXT,
  created_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_review_user ON reviews(challenge_id, user_id);
CREATE INDEX idx_reviews_challenge ON reviews(challenge_id);

-- Player writeup submissions (URL) for solved challenges.
CREATE TABLE writeups (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id      INTEGER,
  url          TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_writeup_user ON writeups(challenge_id, user_id);
CREATE INDEX idx_writeups_challenge ON writeups(challenge_id);

-- Prerequisite challenge IDs (JSON array). A challenge is "locked" until the
-- account has solved all listed challenges.
ALTER TABLE challenges ADD COLUMN prerequisites TEXT;
