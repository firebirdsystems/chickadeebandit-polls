-- True anonymity, per poll.
--
-- The app promised "votes stay sealed", but every vote carried the voter's
-- member_id and `sealed_until` unseals the whole table to the household the
-- moment an adult closes the poll. Sealed meant "not yet", not "not attributed",
-- and nothing in the UI said so.
--
-- The platform already has the machinery: `anonymous_responses` omits the member
-- column entirely when the session's anonymous flag is set (see
-- governance-protocols.ts — the column is left out of the INSERT, and the
-- response row is timestamped with a constant so submission order cannot
-- reidentify anyone). It needs two things this schema did not have.
--
-- 1. A per-poll flag. Defaults to 0, so every existing poll keeps the behaviour
--    it was created under; only the copy changes to describe it honestly.
ALTER TABLE app_family_polls__polls ADD COLUMN anonymous INTEGER NOT NULL DEFAULT 0;

-- 2. A response table whose member column is NULLABLE. `votes.member_id` is
--    TEXT NOT NULL, so an anonymous submission — which omits the column — would
--    fail its constraint on every insert. Columns cannot be altered or dropped
--    in an append-only migration, so the response table is replaced rather than
--    changed, and the old rows are copied across.
--
--    Every column copied here is plaintext at rest (`_id` / `_at` suffixes and
--    the `id` primary key are all in the platform skip-list), so a straight
--    SQL copy carries the values intact — no decrypt is available in a
--    migration, and one is not needed.
--
--    UNIQUE (poll_id, member_id) is kept: SQLite treats NULLs as distinct, so
--    it still stops a member voting twice on an attributed poll while allowing
--    any number of anonymous rows. One-vote-per-member on anonymous polls is
--    enforced by the receipt table, which the protocol writes with
--    `requireChanges` inside the same transaction as the vote.
CREATE TABLE IF NOT EXISTS app_family_polls__poll_votes (
  id         TEXT NOT NULL,
  poll_id    TEXT NOT NULL,
  member_id  TEXT,
  option_id  TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (poll_id, member_id)
);

INSERT OR IGNORE INTO app_family_polls__poll_votes (id, poll_id, member_id, option_id, created_at)
SELECT id, poll_id, member_id, option_id, created_at FROM app_family_polls__votes;

CREATE INDEX IF NOT EXISTS poll_votes_poll
  ON app_family_polls__poll_votes(poll_id);

CREATE INDEX IF NOT EXISTS poll_votes_poll_option
  ON app_family_polls__poll_votes(poll_id, option_id);

-- Retention is keyed on the poll, not on the votes: anonymous rows carry a
-- constant timestamp, so a sweep over them would purge every one on its first
-- run. Ageing out the poll takes its votes and receipts with it, which is the
-- correct unit — a poll from three years ago and its ballots go together.
CREATE INDEX IF NOT EXISTS polls_retention
  ON app_family_polls__polls(created_at, id);
