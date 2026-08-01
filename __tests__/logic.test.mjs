import { describe, expect, it } from "vitest";
import {
  parseOptions,
  selectedOptionId,
  voteCounts,
  winningOptionIds,
  spoiledVotes,
  countedVotes, searchableFields,
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

describe("searchableFields", () => {
  it("matches on the option labels as well as the question", () => {
    const fields = searchableFields({ question: "When shall we meet?" }, "Friday Saturday");
    expect(fields).toContain("When shall we meet?");
    expect(fields).toContain("Friday Saturday");
  });
});
