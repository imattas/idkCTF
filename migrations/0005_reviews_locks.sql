-- Remove the webhook-only plugins that were just added.
DELETE FROM plugins WHERE name IN ('slack_webhook', 'telegram', 'msteams_webhook');

-- Prerequisite challenge IDs (JSON array). A challenge is "locked" until the
-- account has solved all listed challenges.
ALTER TABLE challenges ADD COLUMN prerequisites TEXT;
