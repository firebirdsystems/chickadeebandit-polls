# Polls

A [Chickadee Bandit](https://chickadeebandit.com/app-library/family-polls) app.

A simple Chickadee Bandit family polling app.

- Adults create polls with fixed choices.
- Each household member may cast one final vote.
- Voters can see their own selection.
- Adults can see the full tally.

Votes are submitted through the Hub's manifest-driven response endpoint. Direct
database writes to votes and receipts are disabled by row policy.

## Timed and live polls

A poll may be given a closing time at creation (`closes_at`, a UTC instant;
presets like "in 1 hour" or "end of today", or a picked time), and a results
mode: revealed at the close (default) or **live**, as votes land. Both NULL is
the long-lived default: open until an adult closes it, sealed until then.

The hub enforces both, not the app:

- `closes_at` is the `anonymous_responses` session deadline — the vote endpoint
  refuses a ballot once it has passed. The row's `status` stays `open` until an
  adult closes it, which is what freezes the poll.
- `results_at` is `visible_after_parent_column` on every sealed ballot table
  (member ballots, legacy votes, guest ballots), so the seal lifts on its own at
  that instant. The app writes it as `closes_at` for a timed poll (results the
  moment time is up, guest ballots included), as `created_at` for a live poll,
  and NULL otherwise.

The list shows a countdown on timed polls, floats them to the top soonest-first,
and leads with polls whose time is up. "Notify everyone" on the form sends a
real notification through `/api/notifications/send` (the hub's household policy
lets an adult notify everyone), which is why the manifest no longer declares
`alert_on` — the same news twice.

The share link stops taking guest votes at `closes_at` too
(`shareable.poll.submit.until_column`): the public page still shows the
question, the form says responses are closed, and a late post is refused with
409. The manifest schema is strict, so this key needs the hub that knows it
deployed first — release order: hub, then this app.

## Sharing a poll

An open poll can be shared as a link (`shareable.poll`). Visitors see the
question and its choices — never who voted, never the running result — and, on a
writable link (the `sharing` capability), can vote without an account.

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
