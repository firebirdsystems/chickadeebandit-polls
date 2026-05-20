import { describe, it, expect } from "vitest";
import {
  memberColor, initial, AVATAR_COLORS,
  isPollOpen, pollStatus,
  upVoters, downVoters, upCount, downCount, netScore,
  memberUpVotedOptions, memberDownVotedOptions, votesUsed, hasVoted,
  totalUpVotes, winningOptionId, expiryLabel, esc,
} from "../src/logic.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────
function makePoll(overrides = {}) {
  return {
    id: "poll-1",
    options: [
      { id: "opt-a", text: "Pizza" },
      { id: "opt-b", text: "Tacos" },
    ],
    settings: { expiresAt: null, allowDownvote: false, maxChoices: 1 },
    closed: false,
    ...overrides,
  };
}

function makeVotes(optId, ups = [], downs = []) {
  return { [optId]: { up: ups, down: downs } };
}

// ── memberColor ───────────────────────────────────────────────────────────────
describe("memberColor", () => {
  it("returns a color from AVATAR_COLORS", () => {
    const color = memberColor("member-1");
    expect(AVATAR_COLORS).toContain(color);
  });

  it("returns the same color for the same id", () => {
    expect(memberColor("abc")).toBe(memberColor("abc"));
  });

  it("returns different colors for different ids (usually)", () => {
    const colors = new Set(["a","b","c","d","e","f","g","h"].map(memberColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});

// ── initial ───────────────────────────────────────────────────────────────────
describe("initial", () => {
  it("returns the first character uppercased", () => {
    expect(initial("alice")).toBe("A");
    expect(initial("bob")).toBe("B");
  });

  it("handles leading whitespace", () => {
    expect(initial("  carol")).toBe("C");
  });

  it("returns ? for empty string", () => {
    expect(initial("")).toBe("?");
  });
});

// ── isPollOpen / pollStatus ───────────────────────────────────────────────────
describe("isPollOpen", () => {
  it("returns true for an open poll with no expiry", () => {
    expect(isPollOpen(makePoll())).toBe(true);
  });

  it("returns false for a closed poll", () => {
    expect(isPollOpen(makePoll({ closed: true }))).toBe(false);
  });

  it("returns false when expiry is in the past", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isPollOpen(makePoll({ settings: { expiresAt: past } }))).toBe(false);
  });

  it("returns true when expiry is in the future", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(isPollOpen(makePoll({ settings: { expiresAt: future } }))).toBe(true);
  });
});

describe("pollStatus", () => {
  it("returns 'open' for an active poll", () => {
    expect(pollStatus(makePoll())).toBe("open");
  });

  it("returns 'closed' for a manually closed poll", () => {
    expect(pollStatus(makePoll({ closed: true }))).toBe("closed");
  });

  it("returns 'expired' for a past-expiry poll", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(pollStatus(makePoll({ settings: { expiresAt: past } }))).toBe("expired");
  });
});

// ── Vote helpers ──────────────────────────────────────────────────────────────
describe("upVoters / downVoters / upCount / downCount / netScore", () => {
  const votes = { "opt-a": { up: ["m1","m2"], down: ["m3"] } };

  it("returns up voters for an option", () => {
    expect(upVoters(votes, "opt-a")).toEqual(["m1","m2"]);
  });

  it("returns down voters for an option", () => {
    expect(downVoters(votes, "opt-a")).toEqual(["m3"]);
  });

  it("returns empty array for an option with no votes", () => {
    expect(upVoters(votes, "opt-b")).toEqual([]);
    expect(downVoters(votes, "opt-b")).toEqual([]);
  });

  it("counts up votes correctly", () => {
    expect(upCount(votes, "opt-a")).toBe(2);
    expect(upCount(votes, "opt-b")).toBe(0);
  });

  it("counts down votes correctly", () => {
    expect(downCount(votes, "opt-a")).toBe(1);
  });

  it("computes net score", () => {
    expect(netScore(votes, "opt-a")).toBe(1);
    expect(netScore(votes, "opt-b")).toBe(0);
  });
});

// ── memberUpVotedOptions / votesUsed / hasVoted ───────────────────────────────
describe("memberUpVotedOptions / votesUsed / hasVoted", () => {
  const poll = makePoll();
  const votes = {
    "opt-a": { up: ["m1"], down: [] },
    "opt-b": { up: [],    down: ["m1"] },
  };

  it("returns option ids the member upvoted", () => {
    expect(memberUpVotedOptions(poll, votes, "m1")).toEqual(["opt-a"]);
  });

  it("returns option ids the member downvoted", () => {
    expect(memberDownVotedOptions(poll, votes, "m1")).toEqual(["opt-b"]);
  });

  it("counts votes used correctly", () => {
    expect(votesUsed(poll, votes, "m1")).toBe(1);
    expect(votesUsed(poll, votes, "m2")).toBe(0);
  });

  it("hasVoted returns true when member has voted", () => {
    expect(hasVoted(poll, votes, "m1")).toBe(true);
    expect(hasVoted(poll, votes, "m2")).toBe(false);
  });
});

// ── totalUpVotes / winningOptionId ────────────────────────────────────────────
describe("totalUpVotes", () => {
  it("sums all up votes across options", () => {
    const poll = makePoll();
    const votes = {
      "opt-a": { up: ["m1","m2"], down: [] },
      "opt-b": { up: ["m3"],      down: [] },
    };
    expect(totalUpVotes(poll, votes)).toBe(3);
  });

  it("returns 0 with no votes", () => {
    expect(totalUpVotes(makePoll(), {})).toBe(0);
  });
});

describe("winningOptionId", () => {
  it("returns null for a poll with no options", () => {
    expect(winningOptionId({ ...makePoll(), options: [] }, {})).toBeNull();
  });

  it("returns the option with the most up votes", () => {
    const poll = makePoll();
    const votes = {
      "opt-a": { up: ["m1","m2"], down: [] },
      "opt-b": { up: ["m3"],      down: [] },
    };
    expect(winningOptionId(poll, votes)).toBe("opt-a");
  });

  it("uses net score when allowDownvote is true", () => {
    const poll = makePoll({ settings: { allowDownvote: true } });
    const votes = {
      "opt-a": { up: ["m1","m2"], down: ["m3","m4","m5"] }, // net -1
      "opt-b": { up: ["m3"],      down: [] },                // net +1
    };
    expect(winningOptionId(poll, votes)).toBe("opt-b");
  });
});

// ── expiryLabel ───────────────────────────────────────────────────────────────
describe("expiryLabel", () => {
  it("returns null when no expiry is set", () => {
    expect(expiryLabel(makePoll())).toBeNull();
  });

  it("returns 'Expired' for a past expiry", () => {
    const past = new Date(Date.now() - 10000).toISOString();
    expect(expiryLabel(makePoll({ settings: { expiresAt: past } }))).toBe("Expired");
  });

  it("returns 'Expires soon' for an expiry under 1 hour away", () => {
    const soon = new Date(Date.now() + 30 * 60000).toISOString();
    expect(expiryLabel(makePoll({ settings: { expiresAt: soon } }))).toBe("Expires soon");
  });

  it("returns hours label for expiry within the same day", () => {
    const in3h = new Date(Date.now() + 3 * 3600000).toISOString();
    expect(expiryLabel(makePoll({ settings: { expiresAt: in3h } }))).toBe("Expires in 3h");
  });

  it("returns days label for multi-day expiry", () => {
    const in2d = new Date(Date.now() + 2 * 86400000).toISOString();
    expect(expiryLabel(makePoll({ settings: { expiresAt: in2d } }))).toBe("Expires in 2d");
  });
});

// ── esc ───────────────────────────────────────────────────────────────────────
describe("esc", () => {
  it("escapes & < > and \"", () => {
    expect(esc('A & B < C > D "E"')).toBe("A &amp; B &lt; C &gt; D &quot;E&quot;");
  });

  it("returns the string unchanged when no special chars", () => {
    expect(esc("hello world")).toBe("hello world");
  });

  it("coerces non-strings to string", () => {
    expect(esc(42)).toBe("42");
  });
});
