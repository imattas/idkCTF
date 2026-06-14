-- Custom CMS pages (CTFd-style "Pages"): rendered at /p/<slug>.
CREATE TABLE pages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL DEFAULT '',
  format       TEXT NOT NULL DEFAULT 'markdown',  -- 'markdown' | 'html'
  published    INTEGER NOT NULL DEFAULT 0,
  auth_required INTEGER NOT NULL DEFAULT 0,
  nav          INTEGER NOT NULL DEFAULT 0,         -- show in top nav
  nav_order    INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER
);

-- Brackets / divisions: separate leaderboards (e.g. High School, University, Open).
CREATE TABLE brackets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT,
  type        TEXT NOT NULL DEFAULT 'users',       -- 'users' | 'teams'
  created_at  INTEGER NOT NULL
);

-- Each account may belong to a bracket.
ALTER TABLE users ADD COLUMN bracket_id INTEGER REFERENCES brackets(id) ON DELETE SET NULL;
ALTER TABLE teams ADD COLUMN bracket_id INTEGER REFERENCES brackets(id) ON DELETE SET NULL;
