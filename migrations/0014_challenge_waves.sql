-- Challenge waves let admins stage and release groups of challenges together.

CREATE TABLE challenge_waves (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  state       TEXT NOT NULL DEFAULT 'draft',
  release_at  INTEGER,
  released_at INTEGER,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER
);
CREATE INDEX idx_challenge_waves_state ON challenge_waves(state);
CREATE INDEX idx_challenge_waves_release_at ON challenge_waves(release_at);

ALTER TABLE challenges ADD COLUMN wave_id INTEGER REFERENCES challenge_waves(id) ON DELETE SET NULL;
CREATE INDEX idx_challenges_wave ON challenges(wave_id);
