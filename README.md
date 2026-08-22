# Polls

A simple Chickadee Bandit family polling app.

- Adults create polls with fixed choices.
- Each household member may cast one final vote.
- Voters can see their own selection.
- Adults can see the full tally.

Votes are submitted through the Hub's manifest-driven response endpoint. Direct
database writes to votes and receipts are disabled by row policy.

## Sharing a poll

An open poll can be shared as a link (`shareable.poll`). Visitors see the
question and its choices — never who voted, never the running result — and, on a
writable link (premium `sharing`), can vote without an account.

The public form's choices come from `poll_options` via the hub's
`values_from` select: a projection of the poll's own `options_json`, keyed on
the same option ids, written by the app when a steward opens the share dialog.
A migration cannot fill that table, because migrations run outside the
encryption codec and would copy ciphertext.

Guest ballots land in `guest_votes`, kept apart from member ballots: the
external write path only sets the columns the manifest declares, so every other
column needs a database default, and a guest ballot is a different kind of
evidence — anonymous, with no identity to dedupe on. They are sealed by the same
row policy as member ballots, counted in the result when the poll closes, and
labelled there as having come from the link.
