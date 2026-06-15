-- Multiple Discord webhooks (each can target a different server/channel).
CREATE TABLE webhooks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 0,
  config     TEXT NOT NULL DEFAULT '{}',   -- {url, username, mention, format, template, templates, events}
  created_at INTEGER NOT NULL
);

-- Migrate the existing single discord_webhook plugin into a webhook row, then drop it.
INSERT INTO webhooks (name, enabled, config, created_at)
  SELECT 'Discord', enabled, config, unixepoch() FROM plugins WHERE name = 'discord_webhook';
DELETE FROM plugins WHERE name = 'discord_webhook';
