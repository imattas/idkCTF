-- No-slop anti-abuse layer. Automated signals create auditable review cases;
-- they do not permanently ban competitors.

ALTER TABLE users ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN prize_disqualified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN under_review INTEGER NOT NULL DEFAULT 0;

ALTER TABLE teams ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teams ADD COLUMN prize_disqualified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teams ADD COLUMN under_review INTEGER NOT NULL DEFAULT 0;

ALTER TABLE challenges ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE challenges ADD COLUMN generated_team_flags INTEGER NOT NULL DEFAULT 0;
ALTER TABLE challenges ADD COLUMN quality_checklist TEXT;

CREATE TABLE anti_abuse_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  type           TEXT NOT NULL,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  team_id        INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  challenge_id   INTEGER REFERENCES challenges(id) ON DELETE SET NULL,
  submission_id  INTEGER REFERENCES submissions(id) ON DELETE SET NULL,
  review_case_id INTEGER,
  ip_hash        TEXT,
  user_agent_hash TEXT,
  message        TEXT,
  metadata       TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_abuse_events_type ON anti_abuse_events(type);
CREATE INDEX idx_abuse_events_user ON anti_abuse_events(user_id);
CREATE INDEX idx_abuse_events_team ON anti_abuse_events(team_id);
CREATE INDEX idx_abuse_events_challenge ON anti_abuse_events(challenge_id);
CREATE INDEX idx_abuse_events_case ON anti_abuse_events(review_case_id);
CREATE INDEX idx_abuse_events_created ON anti_abuse_events(created_at);
CREATE INDEX idx_abuse_events_ip_hash ON anti_abuse_events(ip_hash);

CREATE TABLE review_cases (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  team_id         INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  challenge_id    INTEGER REFERENCES challenges(id) ON DELETE SET NULL,
  submission_id   INTEGER REFERENCES submissions(id) ON DELETE SET NULL,
  risk_score      INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'open',
  reason          TEXT NOT NULL,
  evidence        TEXT NOT NULL DEFAULT '{}',
  admin_notes     TEXT NOT NULL DEFAULT '',
  proof_state     TEXT NOT NULL DEFAULT 'not_required',
  proof_requested_at INTEGER,
  proof_submitted_at INTEGER,
  proof_text      TEXT,
  proof_attachment_name TEXT,
  proof_attachment_type TEXT,
  proof_attachment_data TEXT,
  resolution      TEXT,
  resolved_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at     INTEGER,
  leaderboard_frozen INTEGER NOT NULL DEFAULT 0,
  prize_disqualified INTEGER NOT NULL DEFAULT 0,
  suspended       INTEGER NOT NULL DEFAULT 0,
  banned          INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_review_cases_status ON review_cases(status);
CREATE INDEX idx_review_cases_risk ON review_cases(risk_score);
CREATE INDEX idx_review_cases_user ON review_cases(user_id);
CREATE INDEX idx_review_cases_team ON review_cases(team_id);
CREATE INDEX idx_review_cases_challenge ON review_cases(challenge_id);
CREATE UNIQUE INDEX idx_review_cases_submission ON review_cases(submission_id) WHERE submission_id IS NOT NULL;

CREATE TABLE appeals (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  team_id        INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  review_case_id INTEGER REFERENCES review_cases(id) ON DELETE SET NULL,
  target_type    TEXT NOT NULL,
  target_id      INTEGER,
  email          TEXT,
  reason         TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open',
  admin_notes    TEXT NOT NULL DEFAULT '',
  resolution     TEXT,
  resolved_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at    INTEGER,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_appeals_status ON appeals(status);
CREATE INDEX idx_appeals_user ON appeals(user_id);
CREATE INDEX idx_appeals_case ON appeals(review_case_id);

CREATE TABLE email_verification_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);
CREATE INDEX idx_email_verify_user ON email_verification_tokens(user_id);

INSERT INTO config (key, value) VALUES
  ('anti_abuse_enabled', 'true'),
  ('submit_challenge_limit', '8'),
  ('submit_challenge_window', '60'),
  ('submit_global_limit', '30'),
  ('submit_global_window', '300'),
  ('wrong_flag_cooldown_threshold', '5'),
  ('wrong_flag_cooldown_seconds', '120'),
  ('risk_normal_threshold', '20'),
  ('risk_soft_review_threshold', '40'),
  ('risk_proof_required_threshold', '65'),
  ('risk_high_review_threshold', '80'),
  ('proof_threshold', '65'),
  ('leaderboard_review_enabled', 'true'),
  ('leaderboard_review_threshold', '80'),
  ('checklist_enforced', 'false'),
  ('honeypot_enabled', 'true'),
  ('honeypot_secret', ''),
  ('honeypot_risk_weight', '35'),
  ('team_flag_secret', ''),
  ('email_verification_required', 'true'),
  ('email_enabled', 'true'),
  ('email_from', 'no-reply@idktheflag.sh'),
  ('email_from_name', 'idkCTF'),
  ('email_on_register', 'true')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
