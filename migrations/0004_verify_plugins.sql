-- Email verification flag (default 1 so existing accounts stay verified).
ALTER TABLE users ADD COLUMN verified INTEGER NOT NULL DEFAULT 1;

-- Additional built-in plugins (disabled by default).
INSERT INTO plugins (name, enabled, config) VALUES
  ('slack_webhook', 0, '{"url":"","events":["solve","first_blood"]}'),
  ('telegram', 0, '{"bot_token":"","chat_id":"","events":["first_blood"]}'),
  ('msteams_webhook', 0, '{"url":"","events":["solve","first_blood"]}');
