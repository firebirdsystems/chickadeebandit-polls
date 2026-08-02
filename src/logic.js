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
