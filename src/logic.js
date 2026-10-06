export function parseOptions(value) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(option => option && typeof option.id === "string" && typeof option.text === "string")
      .map(option => ({ id: option.id, text: option.text }));
  } catch {
    return [];
  }
}

export function voteCounts(options, votes) {
  const counts = Object.fromEntries(options.map(option => [option.id, 0]));
  for (const vote of votes) {
    if (Object.hasOwn(counts, vote.option_id)) counts[vote.option_id] += 1;
  }
  return counts;
}

/**
 * Ballots whose option_id is not one of the poll's choices.
 *
 * The vote endpoint takes the answer as an opaque string, so a crafted request
 * can record a choice that does not exist. Such a ballot is also permanent —
 * `sealed_until` with `endpoint_writes_only` gives the app no way to delete a
 * vote — so the only remedy is to stop it counting and say it is there.
 * `voteCounts` already ignores unknown ids; this reports them so a poll's total
 * cannot silently disagree with the sum of its options.
 */
export function spoiledVotes(options, votes) {
  const valid = new Set(options.map(option => option.id));
  return votes.filter(vote => !valid.has(vote.option_id));
}

/** Ballots that count toward the result. */
export function countedVotes(options, votes) {
  const valid = new Set(options.map(option => option.id));
  return votes.filter(vote => valid.has(vote.option_id));
}

/**
 * This member's choice, or null. Anonymous ballots carry no member id at all,
 * so there is nothing to match — "have I voted?" is answered by the receipt
 * table instead, never by scanning the votes.
 */
export function selectedOptionId(votes, memberId) {
  if (!memberId) return null;
  return votes.find(vote => vote.member_id === memberId)?.option_id ?? null;
}

/**
 * "3 votes so far" for an open poll, or "" when the count is unknown.
 *
 * Turnout cannot be counted from the app's own reads: `vote_receipts` is
 * `owner_only` with `adults_bypass: false`, so a member sees exactly one row —
 * their own — and `poll_votes` stays sealed until the poll closes. The hub
 * counts the receipts and returns the aggregate alone, never the rows, which is
 * what makes this safe on an anonymous poll: the list of who has voted is a
 * step towards who voted for what, and this never exposes it.
 *
 * An unknown count renders nothing at all. A failed or not-yet-made read is not
 * evidence that nobody has voted, and "0 votes so far" would say it is.
 */
export function turnoutLabel(count) {
  if (typeof count !== "number" || !Number.isFinite(count) || count < 0) return "";
  return `${count} vote${count === 1 ? "" : "s"} so far`;
}

/**
 * Choices that have no row in `poll_options` yet.
 *
 * The public form's choices are drawn from that table (manifest
 * `submit.fields[].values_from`), but a poll's choices are authored into the
 * `options_json` blob, and a migration cannot copy them across — it runs
 * outside the encryption codec, so the blob reads as ciphertext there. The app
 * therefore projects them itself, just before a poll is shared, and this says
 * what is still missing. Keyed on the option's own id, so it is idempotent: a
 * poll shared twice inserts nothing the second time, and every ballot already
 * cast keeps naming the same choice.
 *
 * `position` is the choice's index in the blob, so the public form offers them
 * in the order the author wrote them.
 */
export function missingOptionRows(options, existingIds) {
  const have = existingIds instanceof Set ? existingIds : new Set(existingIds ?? []);
  return options
    .map((option, index) => ({ id: option.id, text: option.text, position: index }))
    .filter(row => !have.has(row.id));
}

/**
 * "3 from the shared link", or "" when none are. Guest ballots are counted in
 * the result like any other, but they are not the same evidence: a link has no
 * identity behind it and nothing stops one visitor voting twice. A household
 * reading a result deserves to see how much of it arrived that way.
 */
export function guestVoteLabel(count) {
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) return "";
  return `${count} from the shared link`;
}

/**
 * Whether a poll's closing time has passed. `closes_at` is an instant (the
 * app writes UTC ISO); an unset or unparseable value never passes — a poll
 * with no deadline is open until an adult closes it.
 */
export function deadlinePassed(closesAt, now = new Date()) {
  if (typeof closesAt !== "string" || !closesAt) return false;
  const at = new Date(closesAt).getTime();
  return Number.isFinite(at) && at <= now.getTime();
}

/**
 * A poll whose time ran out before an adult closed it. Its `status` is still
 * "open" — the hub refuses new ballots past the deadline, and the ballot rows
 * (guest votes included) are already readable because the app wrote
 * `results_at = closes_at`. Only an adult's close flips the row and freezes it.
 */
export function pollEnded(poll, now = new Date()) {
  return poll?.status !== "closed" && deadlinePassed(poll?.closes_at, now);
}

/**
 * Whether the household may read this poll's ballots: the poll is closed, or
 * its `results_at` instant has passed. Mirrors the `sealed_until` row policy
 * (`visible_parent_status_values: ["closed"]` + `visible_after_parent_column:
 * "results_at"`), so the view asks the same question the hub answers — and
 * never renders a tally the rows would not have supported.
 */
export function resultsReleased(poll, now = new Date()) {
  if (poll?.status === "closed") return true;
  return deadlinePassed(poll?.results_at, now);
}

/**
 * The `results_at` to store for a new poll. "live" releases the ballots from
 * the first vote; "at_close" releases them when the deadline passes (or never
 * by time, if there is no deadline — only an adult's close reveals them).
 */
export function resultsAtFor(mode, createdAt, closesAt) {
  if (mode === "live") return createdAt;
  return closesAt ?? null;
}

/** Whole minutes left before `closesAt`, or null when there is no deadline. */
export function minutesLeft(closesAt, now = new Date()) {
  if (typeof closesAt !== "string" || !closesAt) return null;
  const at = new Date(closesAt).getTime();
  if (!Number.isFinite(at)) return null;
  return Math.floor((at - now.getTime()) / 60_000);
}

/** Five minutes or less to go — the card turns red. */
export function countdownUrgent(closesAt, now = new Date()) {
  const left = minutesLeft(closesAt, now);
  return left !== null && left <= 5;
}

/**
 * "Closes in 42 min" for a timed poll, "Time's up" once it has passed, or ""
 * when the poll has no deadline. Coarse on purpose: a dinner poll is read at a
 * glance, and the tick that refreshes it runs every half minute.
 */
export function countdownLabel(closesAt, now = new Date()) {
  const left = minutesLeft(closesAt, now);
  if (left === null) return "";
  if (left < 0) return "Time's up";
  if (left < 1) return "Closes in under a minute";
  if (left < 60) return `Closes in ${left} min`;
  const hours = Math.floor(left / 60);
  const minutes = left % 60;
  if (hours < 24) return minutes ? `Closes in ${hours} hr ${minutes} min` : `Closes in ${hours} hr`;
  const days = Math.floor(hours / 24);
  return `Closes in ${days} day${days === 1 ? "" : "s"}`;
}

/**
 * The closing instant for a choice in the create form, as UTC ISO, or null for
 * no deadline. Presets are minutes from now; "eod" is the end of the author's
 * local day — midnight that starts tomorrow, so the whole of today stays open
 * and a poll made at 23:59 is not refused as already past; "custom" takes a
 * `datetime-local` value (local wall time, which `Date` resolves in the
 * browser's zone). An unparseable custom value is null too, which the form
 * reports rather than saving an open-ended poll by mistake.
 */
export function closesAtFromChoice(choice, now = new Date(), custom = "") {
  if (!choice) return null;
  if (choice === "eod") {
    const end = new Date(now);
    end.setHours(24, 0, 0, 0);
    return end.toISOString();
  }
  if (choice === "custom") {
    if (typeof custom !== "string" || !custom) return null;
    const at = new Date(custom);
    return Number.isFinite(at.getTime()) ? at.toISOString() : null;
  }
  const minutes = Number(choice);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

/**
 * Open polls in the order the list shows them: polls whose time is up first
 * (the result is in, and an adult still has to close them), then timed polls
 * soonest-closing first, then polls with no deadline in the order given
 * (newest first, as read). Stable within each group.
 */
export function sortOpenPolls(polls, now = new Date()) {
  const rank = (poll) => pollEnded(poll, now) ? 0 : poll.closes_at ? 1 : 2;
  return polls
    .map((poll, index) => ({ poll, index }))
    .sort((a, b) => {
      const byRank = rank(a.poll) - rank(b.poll);
      if (byRank) return byRank;
      if (rank(a.poll) === 1) {
        const byClose = new Date(a.poll.closes_at).getTime() - new Date(b.poll.closes_at).getTime();
        if (byClose) return byClose;
      }
      return a.index - b.index;
    })
    .map(({ poll }) => poll);
}

export function winningOptionIds(options, counts) {
  const highest = Math.max(0, ...options.map(option => counts[option.id] ?? 0));
  if (highest === 0) return [];
  return options.filter(option => counts[option.id] === highest).map(option => option.id);
}

/**
 * Fields the in-app search matches against (see hub-sdk `searchMatch`).
 * The options carry as much meaning as the question ("Friday or
 * Saturday"), so they are flattened in alongside it. The column stores
 * JSON, so the caller passes the option labels in as text.
 */
export function searchableFields(poll, optionText = "") {
  return [poll.question, optionText];
}
