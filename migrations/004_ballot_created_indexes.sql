-- The app's first-render reads (declared in manifest.preload) page the newest
-- ballots with `ORDER BY created_at LIMIT n`. Without an index on created_at
-- each of them sorts the whole table before the LIMIT applies, so D1 bills a
-- full scan on every page load.
CREATE INDEX IF NOT EXISTS poll_votes_created
  ON app_family_polls__poll_votes(created_at);

CREATE INDEX IF NOT EXISTS guest_votes_created
  ON app_family_polls__guest_votes(created_at);
