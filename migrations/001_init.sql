CREATE TABLE IF NOT EXISTS app_family_polls__polls (
  id           TEXT NOT NULL,
  question     TEXT NOT NULL,
  options_json TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open',
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS app_family_polls__votes (
  id         TEXT NOT NULL,
  poll_id    TEXT NOT NULL,
  member_id  TEXT NOT NULL,
  option_id  TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (poll_id, member_id)
);

CREATE TABLE IF NOT EXISTS app_family_polls__vote_receipts (
  poll_id    TEXT NOT NULL,
  member_id  TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (poll_id, member_id)
);

CREATE INDEX IF NOT EXISTS polls_created
  ON app_family_polls__polls(created_at DESC);

CREATE INDEX IF NOT EXISTS votes_poll
  ON app_family_polls__votes(poll_id);

CREATE INDEX IF NOT EXISTS votes_poll_option
  ON app_family_polls__votes(poll_id, option_id);
