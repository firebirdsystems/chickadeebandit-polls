# Polls

A simple Chickadee Bandit family polling app.

- Adults create polls with fixed choices.
- Each household member may cast one final vote.
- Voters can see their own selection.
- Adults can see the full tally.

Votes are submitted through the Hub's manifest-driven response endpoint. Direct
database writes to votes and receipts are disabled by row policy.
