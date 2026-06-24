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

export function selectedOptionId(votes, memberId) {
  return votes.find(vote => vote.member_id === memberId)?.option_id ?? null;
}

export function winningOptionIds(options, counts) {
  const highest = Math.max(0, ...options.map(option => counts[option.id] ?? 0));
  if (highest === 0) return [];
  return options.filter(option => counts[option.id] === highest).map(option => option.id);
}
