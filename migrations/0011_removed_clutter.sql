-- Retire removed in-app feature plugins and their data tables.
DELETE FROM plugins WHERE name IN ('challenge_reviews', 'writeups');
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS writeups;

-- Keep historical webhook rows aligned with the idkCTF rebrand.
UPDATE webhooks
SET config = replace(config, '"username":"Cloud' || 'CTF"', '"username":"idkCTF"')
WHERE config LIKE '%Cloud' || 'CTF%';

-- Starter legal copy should not mention removed writeup submissions.
UPDATE pages
SET content = replace(content, 'team names, profiles, writeups', 'team names and profiles')
WHERE slug = 'tos';
