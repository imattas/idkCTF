-- Pages can be flagged to appear in the site footer.
ALTER TABLE pages ADD COLUMN footer INTEGER NOT NULL DEFAULT 0;

-- Seed starter Rules and Terms of Service pages (published, in footer).
-- Admins can edit these in Admin -> Pages.
INSERT INTO pages (slug, title, content, format, published, footer, nav, nav_order, created_at) VALUES
  ('rules',
   'Rules',
   '## Rules

1. **Be respectful.** No harassment of organizers or other competitors.
2. **No attacking the infrastructure.** Only attack the challenge targets you are given. Do not attack the scoreboard, this platform, or other teams.
3. **No flag sharing.** Sharing flags or solutions with other teams is prohibited.
4. **No brute forcing** the flag submission endpoint or challenge services beyond what a challenge intends.
5. **One account per person.** In team mode, one team per person.
6. Decisions of the organizers are final. Have fun!',
   'markdown', 1, 1, 0, 0, unixepoch()),
  ('tos',
   'Terms of Service',
   '## Terms of Service

By creating an account and participating, you agree to the following:

- You are responsible for activity under your account and for keeping your credentials secure.
- Content you submit (team names and profiles) must not be illegal, offensive, or infringing.
- The organizers may modify, suspend, or remove accounts that violate the rules.
- The competition and this platform are provided "as is" without warranty of any kind.
- Personal data you provide is used solely to operate the competition.

These terms may be updated; continued participation constitutes acceptance.',
   'markdown', 1, 1, 0, 0, unixepoch());
