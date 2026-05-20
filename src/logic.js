// Shared utilities (memberColor, initial, esc, isAdult, formatRelativeDate) live in /hub-sdk.js.
// This file exports polls-specific logic only.

export function pollStatus(poll) {
  if (poll.closed) return "closed";
  if (poll.settings.expiresAt && new Date(poll.settings.expiresAt) < new Date()) return "expired";
  return "open";
}

export function isPollOpen(poll) {
  return pollStatus(poll) === "open";
}

export function upVoters(votes, optId)   { return votes[optId]?.up   ?? []; }
export function downVoters(votes, optId) { return votes[optId]?.down ?? []; }
export function upCount(votes, optId)    { return upVoters(votes, optId).length; }
export function downCount(votes, optId)  { return downVoters(votes, optId).length; }
export function netScore(votes, optId)   { return upCount(votes, optId) - downCount(votes, optId); }

export function memberUpVotedOptions(poll, votes, memberId) {
  return poll.options.filter(o => upVoters(votes, o.id).includes(memberId)).map(o => o.id);
}

export function memberDownVotedOptions(poll, votes, memberId) {
  return poll.options.filter(o => downVoters(votes, o.id).includes(memberId)).map(o => o.id);
}

export function votesUsed(poll, votes, memberId) {
  return memberUpVotedOptions(poll, votes, memberId).length;
}

export function hasVoted(poll, votes, memberId) {
  return votesUsed(poll, votes, memberId) > 0;
}

export function totalUpVotes(poll, votes) {
  return poll.options.reduce((s, o) => s + upCount(votes, o.id), 0);
}

export function winningOptionId(poll, votes) {
  if (poll.options.length === 0) return null;
  if (totalUpVotes(poll, votes) === 0) return null;
  const score = (opt) => poll.settings.allowDownvote ? netScore(votes, opt.id) : upCount(votes, opt.id);
  return poll.options.reduce((best, opt) => score(opt) > score(best) ? opt : best).id;
}

export function expiryLabel(poll) {
  if (!poll.settings.expiresAt) return null;
  const diff = new Date(poll.settings.expiresAt) - new Date();
  if (diff < 0) return "Expired";
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "Expires soon";
  if (h < 24) return `Expires in ${h}h`;
  return `Expires in ${Math.ceil(diff / 86400000)}d`;
}
