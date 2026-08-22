-- Let people outside the household vote on a poll through a share link.
--
-- The hub's writable-share protocol composes the public form from the manifest,
-- and a select field can now draw its choices from a sibling table
-- (`submit.fields[].values_from`). This app had no such table: a poll's choices
-- live in `polls.options_json`, a JSON blob on the poll row, which SQL can
-- neither list nor match a submitted answer against. Two tables close that gap.
--
-- 1. `poll_options` — one row per choice, carrying the SAME id the blob already
--    assigns it. That id is what every ballot stores, so a guest vote and a
--    member vote name the same choice and tally together with no translation.
--
--    This is a projection of `options_json`, not a second source of truth: the
--    app still renders and tallies from the blob, and writes these rows only
--    when a poll is about to be shared. It cannot be backfilled here —
--    migrations run outside the encryption codec, so `options_json` reads as
--    ciphertext at this point and a SQL copy would carry garbage. The app fills
--    in any missing rows when a steward opens the share dialog, which handles
--    polls created before this migration as well as after it.
--
--    `status` is plaintext by the platform's built-in list, which is what lets
--    `values_from.where` keep a retired choice off the public form.
CREATE TABLE IF NOT EXISTS app_family_polls__poll_options (
  id       TEXT NOT NULL,
  poll_id  TEXT NOT NULL,
  text     TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  status   TEXT NOT NULL DEFAULT 'open',
  PRIMARY KEY (id)
);

-- 2. `guest_votes` — ballots cast by non-members through a share link.
--
--    They are kept apart from `poll_votes` for two reasons. The protocol sets
--    only the id, the foreign key, the declared fields and the declared fixed
--    values, so every other column needs a database default — `poll_votes`
--    has `created_at TEXT NOT NULL` with none, and cannot acquire one, since a
--    column's default cannot be altered in an append-only migration. And the
--    two are not the same thing: a member ballot is one-per-member and
--    receipted, a guest ballot is anonymous with no identity to dedupe on. The
--    results view counts them together and says how many came from a link.
--
--    `member_id` is here, always NULL, because `sealed_until` needs a writer
--    column to compare against. Nobody is ever the writer of a guest ballot, so
--    nothing matches and the rows stay unreadable until the poll closes —
--    exactly the seal that covers member ballots, arrived at from the other
--    direction.
CREATE TABLE IF NOT EXISTS app_family_polls__guest_votes (
  id         TEXT NOT NULL,
  poll_id    TEXT NOT NULL,
  option_id  TEXT NOT NULL,
  member_id  TEXT,
  source     TEXT NOT NULL DEFAULT 'external',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS poll_options_poll
  ON app_family_polls__poll_options(poll_id, position);

CREATE INDEX IF NOT EXISTS guest_votes_poll
  ON app_family_polls__guest_votes(poll_id, option_id);
