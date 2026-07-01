-- Lockdown and admin invisibility defaults for existing instances.
INSERT INTO config (key, value) VALUES ('site_lockdown', 'false')
  ON CONFLICT(key) DO NOTHING;

UPDATE users SET hidden = 1 WHERE role = 'admin';
