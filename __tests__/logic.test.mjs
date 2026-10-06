import { describe, expect, it } from "vitest";
import {
  parseOptions,
  selectedOptionId,
  voteCounts,
  winningOptionIds,
  spoiledVotes,
  countedVotes, searchableFields,
  turnoutLabel,
  missingOptionRows,
  guestVoteLabel,
  deadlinePassed,
  pollEnded,
  minutesLeft,
  countdownUrgent,
  countdownLabel,
  closesAtFromChoice,
  sortOpenPolls,
  resultsReleased,
  resultsAtFor,
} from "../src/logic.js";
import { esc, initial, memberColor, AVATAR_COLORS } from "../src/shared.js";

const options = [
  { id: "pizza", text: "Pizza" },
  { id: "tacos", text: "Tacos" },
  { id: "pasta", text: "Pasta" },
];

describe("parseOptions", () => {
  it("parses valid option JSON", () => {
    expect(parseOptions(JSON.stringify(options))).toEqual(options);
  });

  it("returns an empty array for invalid data", () => {
    expect(parseOptions("not json")).toEqual([]);
    expect(parseOptions("{}")).toEqual([]);
  });

  it("drops malformed option entries", () => {
    expect(parseOptions(JSON.stringify([
      options[0],
      { id: 2, text: "Bad" },
      null,
    ]))).toEqual([options[0]]);
  });
});

describe("voteCounts", () => {
  it("counts only known choices", () => {
    expect(voteCounts(options, [
      { option_id: "pizza" },
      { option_id: "pizza" },
      { option_id: "tacos" },
      { option_id: "forged-choice" },
    ])).toEqual({ pizza: 2, tacos: 1, pasta: 0 });
  });
});

describe("selectedOptionId", () => {
  it("returns the member's selection", () => {
    expect(selectedOptionId([
      { member_id: "m1", option_id: "pizza" },
      { member_id: "m2", option_id: "tacos" },
    ], "m2")).toBe("tacos");
  });

  it("returns null when the member has not voted", () => {
    expect(selectedOptionId([], "m1")).toBeNull();
  });
});

describe("winningOptionIds", () => {
  it("returns every tied winner", () => {
    expect(winningOptionIds(options, { pizza: 2, tacos: 2, pasta: 0 }))
      .toEqual(["pizza", "tacos"]);
  });

  it("returns no winner before votes exist", () => {
    expect(winningOptionIds(options, { pizza: 0, tacos: 0, pasta: 0 })).toEqual([]);
  });
});

describe("shared presentation helpers", () => {
  it("escapes HTML content", () => {
    expect(esc('<img src=x onerror="x">')).toBe("&lt;img src=x onerror=&quot;x&quot;&gt;");
  });

  it("creates safe initials and stable colors", () => {
    expect(initial(" alice")).toBe("A");
    expect(AVATAR_COLORS).toContain(memberColor("m1"));
    expect(memberColor("m1")).toBe(memberColor("m1"));
  });
});

// ── spoiledVotes / countedVotes ───────────────────────────────────────────────
// The vote endpoint takes the answer as an opaque string, so a crafted request
// can record an option that isn't on the poll — and `sealed_until` with
// `endpoint_writes_only` gives the app no way to delete a vote afterwards. The
// tally therefore has to exclude them, and the UI has to say they exist.
describe("spoiled ballots", () => {
  const options = [{ id: "a", text: "A" }, { id: "b", text: "B" }];
  const votes = [
    { option_id: "a", member_id: "m1" },
    { option_id: "b", member_id: "m2" },
    { option_id: "not-an-option", member_id: "m3" },
  ];

  it("separates ballots naming an option that isn't on the poll", () => {
    expect(spoiledVotes(options, votes)).toEqual([{ option_id: "not-an-option", member_id: "m3" }]);
    expect(countedVotes(options, votes)).toHaveLength(2);
  });

  it("keeps percentages honest — the total is the counted ballots, not all of them", () => {
    const counted = countedVotes(options, votes);
    const counts = voteCounts(options, counted);
    expect(counts.a + counts.b).toBe(counted.length);
  });

  it("finds nothing to exclude in a clean poll", () => {
    expect(spoiledVotes(options, votes.slice(0, 2))).toEqual([]);
  });
});

describe("selectedOptionId with anonymous ballots", () => {
  it("returns null when there is no member to match", () => {
    // Anonymous ballots carry no member_id at all; "have I voted?" is answered
    // by the receipt table instead.
    expect(selectedOptionId([{ option_id: "a", member_id: null }], null)).toBeNull();
    expect(selectedOptionId([{ option_id: "a", member_id: null }], "m1")).toBeNull();
  });
});

describe("turnout while a poll is still sealed", () => {
  it("reads as a count of voters, singular and plural", () => {
    expect(turnoutLabel(1)).toBe("1 vote so far");
    expect(turnoutLabel(3)).toBe("3 votes so far");
  });

  it("says nobody has voted only when the hub actually said zero", () => {
    expect(turnoutLabel(0)).toBe("0 votes so far");
  });

  it("renders nothing for an unknown count", () => {
    // A poll missing from the turnout map — never fetched, or the request
    // failed — must show no turnout at all. "0 votes so far" would assert
    // something the app does not know, and on an open poll that is the exact
    // question the member is asking.
    expect(turnoutLabel(undefined)).toBe("");
    expect(turnoutLabel(null)).toBe("");
    expect(turnoutLabel(Number.NaN)).toBe("");
    expect(turnoutLabel("4")).toBe("");
    expect(turnoutLabel(-1)).toBe("");
  });
});

describe("searchableFields", () => {
  it("matches on the option labels as well as the question", () => {
    const fields = searchableFields({ question: "When shall we meet?" }, "Friday Saturday");
    expect(fields).toContain("When shall we meet?");
    expect(fields).toContain("Friday Saturday");
  });
});

describe("projecting choices for the public form", () => {
  it("returns every choice the options table does not have yet, in author order", () => {
    expect(missingOptionRows(options, new Set())).toEqual([
      { id: "pizza", text: "Pizza", position: 0 },
      { id: "tacos", text: "Tacos", position: 1 },
      { id: "pasta", text: "Pasta", position: 2 },
    ]);
  });

  it("is idempotent — a poll shared twice inserts nothing the second time", () => {
    // The ids come from the poll's own blob, so a re-run matches by identity
    // rather than by text, and every ballot already cast keeps naming the same
    // choice.
    const all = new Set(["pizza", "tacos", "pasta"]);
    expect(missingOptionRows(options, all)).toEqual([]);
  });

  it("fills in only the gap when a choice was added after the first share", () => {
    expect(missingOptionRows(options, ["pizza", "pasta"]))
      .toEqual([{ id: "tacos", text: "Tacos", position: 1 }]);
  });
});

describe("guest ballots in the result", () => {
  it("names how many votes came through the link", () => {
    expect(guestVoteLabel(1)).toBe("1 from the shared link");
    expect(guestVoteLabel(4)).toBe("4 from the shared link");
  });

  it("says nothing for a choice no visitor picked", () => {
    // The line appears only where it carries information; a household reading a
    // closed poll should not have "0 from the shared link" under every choice.
    expect(guestVoteLabel(0)).toBe("");
    expect(guestVoteLabel(undefined)).toBe("");
    expect(guestVoteLabel(-2)).toBe("");
  });
});

// ── Timed polls ──────────────────────────────────────────────────────────────
// A fixed "now" throughout: these helpers take the clock as an argument so no
// test depends on when it runs.
describe("timed polls", () => {
  const now = new Date("2026-03-14T18:00:00Z");
  const at = (minutes) => new Date(now.getTime() + minutes * 60_000).toISOString();

  describe("deadlinePassed / pollEnded", () => {
    it("never passes without a deadline — an untimed poll is open until an adult closes it", () => {
      expect(deadlinePassed(null, now)).toBe(false);
      expect(deadlinePassed("", now)).toBe(false);
      expect(deadlinePassed(undefined, now)).toBe(false);
      expect(deadlinePassed("not a date", now)).toBe(false);
      expect(pollEnded({ status: "open", closes_at: null }, now)).toBe(false);
    });

    it("passes at the instant itself and after, not before", () => {
      expect(deadlinePassed(at(1), now)).toBe(false);
      expect(deadlinePassed(at(0), now)).toBe(true);
      expect(deadlinePassed(at(-1), now)).toBe(true);
    });

    it("an ended poll is an OPEN poll past its deadline — a closed one is just closed", () => {
      expect(pollEnded({ status: "open", closes_at: at(-5) }, now)).toBe(true);
      expect(pollEnded({ status: "open", closes_at: at(5) }, now)).toBe(false);
      // Closing is what freezes the row and unseals the ballots; once that has
      // happened the deadline is history and the view must not call it "ended".
      expect(pollEnded({ status: "closed", closes_at: at(-5) }, now)).toBe(false);
    });
  });

  describe("countdownLabel", () => {
    it("renders nothing for an untimed poll", () => {
      expect(countdownLabel(null, now)).toBe("");
      expect(countdownLabel("garbage", now)).toBe("");
    });

    it("counts down in minutes, then hours and minutes, then days", () => {
      expect(countdownLabel(at(0.5), now)).toBe("Closes in under a minute");
      expect(countdownLabel(at(42), now)).toBe("Closes in 42 min");
      expect(countdownLabel(at(60), now)).toBe("Closes in 1 hr");
      expect(countdownLabel(at(65), now)).toBe("Closes in 1 hr 5 min");
      expect(countdownLabel(at(23 * 60 + 59), now)).toBe("Closes in 23 hr 59 min");
      expect(countdownLabel(at(24 * 60), now)).toBe("Closes in 1 day");
      expect(countdownLabel(at(3 * 24 * 60 + 30), now)).toBe("Closes in 3 days");
    });

    it("says time is up once the deadline has passed", () => {
      expect(countdownLabel(at(-1), now)).toBe("Time's up");
      expect(countdownLabel(at(-3 * 24 * 60), now)).toBe("Time's up");
    });
  });

  describe("countdownUrgent", () => {
    it("turns red at five minutes and stays red through the deadline", () => {
      expect(countdownUrgent(at(6), now)).toBe(false);
      expect(countdownUrgent(at(5), now)).toBe(true);
      expect(countdownUrgent(at(0.2), now)).toBe(true);
      expect(countdownUrgent(at(-1), now)).toBe(true);
      expect(countdownUrgent(null, now)).toBe(false);
      expect(minutesLeft(null, now)).toBeNull();
    });
  });

  describe("closesAtFromChoice", () => {
    it("maps the presets to instants from now, as UTC ISO", () => {
      expect(closesAtFromChoice("", now)).toBeNull();
      expect(closesAtFromChoice("30", now)).toBe(at(30));
      expect(closesAtFromChoice("60", now)).toBe(at(60));
      expect(closesAtFromChoice("180", now)).toBe(at(180));
    });

    it("ends the author's local day at the midnight that starts tomorrow", () => {
      const iso = closesAtFromChoice("eod", now);
      const end = new Date(iso);
      expect(end.getHours()).toBe(0);
      expect(end.getMinutes()).toBe(0);
      expect(end.getSeconds()).toBe(0);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(end.toDateString()).toBe(tomorrow.toDateString());
      // The whole of today stays open: a poll made at 23:59 is still in the future.
      const lateTonight = new Date(now);
      lateTonight.setHours(23, 59, 30, 0);
      expect(deadlinePassed(closesAtFromChoice("eod", lateTonight), lateTonight)).toBe(false);
    });

    it("takes a datetime-local value for 'custom' and refuses garbage", () => {
      // datetime-local is wall time in the browser's zone; `Date` parses it the
      // same way, so a round trip lands on the same instant.
      const local = new Date(2026, 2, 14, 19, 30);
      expect(closesAtFromChoice("custom", now, "2026-03-14T19:30")).toBe(local.toISOString());
      expect(closesAtFromChoice("custom", now, "")).toBeNull();
      expect(closesAtFromChoice("custom", now, "soon")).toBeNull();
    });

    it("refuses a preset that is not a positive number of minutes", () => {
      expect(closesAtFromChoice("0", now)).toBeNull();
      expect(closesAtFromChoice("-30", now)).toBeNull();
      expect(closesAtFromChoice("later", now)).toBeNull();
    });
  });

  describe("resultsReleased / resultsAtFor — the view asks what the row policy answers", () => {
    it("releases on close, or once results_at has passed, never otherwise", () => {
      expect(resultsReleased({ status: "closed", results_at: null }, now)).toBe(true);
      expect(resultsReleased({ status: "open", results_at: at(-1) }, now)).toBe(true);
      expect(resultsReleased({ status: "open", results_at: at(0) }, now)).toBe(true);
      expect(resultsReleased({ status: "open", results_at: at(1) }, now)).toBe(false);
      expect(resultsReleased({ status: "open", results_at: null }, now)).toBe(false);
      expect(resultsReleased({ status: "open" }, now)).toBe(false);
    });

    it("a live poll's results_at is its creation — visible from the first vote", () => {
      expect(resultsAtFor("live", at(0), at(60))).toBe(at(0));
      expect(resultsAtFor("live", at(0), null)).toBe(at(0));
    });

    it("an at-close poll releases at its deadline, or only by closing when it has none", () => {
      expect(resultsAtFor("at_close", at(0), at(60))).toBe(at(60));
      expect(resultsAtFor("at_close", at(0), null)).toBeNull();
      expect(resultsAtFor("at_close", at(0), undefined)).toBeNull();
    });

    it("a timed at-close poll is readable exactly when it has ended", () => {
      // The two instants coincide, so "time's up" and "results visible" agree
      // — which is what lets the ended view count guest ballots from the rows.
      const poll = { status: "open", closes_at: at(30), results_at: at(30) };
      expect(pollEnded(poll, now)).toBe(false);
      expect(resultsReleased(poll, now)).toBe(false);
      const later = new Date(now.getTime() + 31 * 60_000);
      expect(pollEnded(poll, later)).toBe(true);
      expect(resultsReleased(poll, later)).toBe(true);
    });
  });

  describe("sortOpenPolls", () => {
    const untimedNewest = { id: "u1", status: "open", closes_at: null };
    const untimedOlder = { id: "u2", status: "open", closes_at: null };
    const soon = { id: "t1", status: "open", closes_at: at(10) };
    const later = { id: "t2", status: "open", closes_at: at(120) };
    const over = { id: "e1", status: "open", closes_at: at(-10) };

    it("puts time's-up polls first, then soonest-closing, then untimed in the order given", () => {
      const sorted = sortOpenPolls([untimedNewest, later, untimedOlder, over, soon], now);
      expect(sorted.map(poll => poll.id)).toEqual(["e1", "t1", "t2", "u1", "u2"]);
    });

    it("is stable and leaves the input untouched", () => {
      const input = [untimedNewest, untimedOlder];
      expect(sortOpenPolls(input, now).map(p => p.id)).toEqual(["u1", "u2"]);
      expect(input.map(p => p.id)).toEqual(["u1", "u2"]);
    });
  });
});

describe("counting member and guest ballots together", () => {
  const memberVotes = [
    { option_id: "pizza", member_id: "m1" },
    { option_id: "tacos", member_id: "m2" },
  ];
  const linkVotes = [
    { option_id: "tacos" },
    { option_id: "tacos" },
  ];

  it("sums both sources into one tally and can still separate them", () => {
    // This is what the results view does: one set of counts for the bars, a
    // second over guests alone for the provenance line under them.
    const counts = voteCounts(options, [...memberVotes, ...linkVotes]);
    expect(counts).toEqual({ pizza: 1, tacos: 3, pasta: 0 });
    expect(voteCounts(options, linkVotes)).toEqual({ pizza: 0, tacos: 2, pasta: 0 });
    expect(winningOptionIds(options, counts)).toEqual(["tacos"]);
  });
});
