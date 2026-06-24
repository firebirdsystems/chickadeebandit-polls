import { describe, expect, it } from "vitest";
import {
  parseOptions,
  selectedOptionId,
  voteCounts,
  winningOptionIds,
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
