import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const migration = readFileSync(join(root, "migrations/001_init.sql"), "utf8");

describe("manifest", () => {
  it("declares the DB app basics", () => {
    expect(manifest.id).toBe("family-polls");
    expect(manifest.version).toMatch(/^1\.\d+\.\d+$/);
    expect(manifest.storage).toBe("db");
    expect(manifest.data_access.reads).toEqual(["family.members"]);
  });

  it("allows only adults to create or modify poll rows, frozen once closed", () => {
    expect(manifest.row_policies.polls).toMatchObject({
      kind: "adult_writable",
      // In a roster space only the steward authors polls; a no-op elsewhere.
      steward_writes_only: true,
      frozen_when: { status_column: "status", locked_values: ["closed"] },
    });
  });

  it("ages polls out together with their ballots and receipts", () => {
    // Retention is keyed on the POLL. Anonymous rows carry a constant
    // timestamp so that submission order cannot reidentify anyone, which means
    // a sweep over the ballots themselves would purge every one on its first
    // run — the platform refuses retain_days on a protocol-written table for
    // exactly that reason.
    const retain = manifest.row_policies.polls.retain_days;
    expect(retain.timestamp_column).toBe("created_at");
    expect(retain.dependent_tables.map(d => d.table).sort())
      .toEqual(["poll_votes", "vote_receipts", "votes"]);
  });

  it("seals votes until the poll closes and keeps writes endpoint-only", () => {
    // `votes` is the pre-anonymity table, kept because migrations are
    // append-only; it stays governed so it can never become readable.
    expect(manifest.row_policies.votes).toEqual({
      kind: "sealed_until",
      fk_column: "poll_id",
      parent_table: "polls",
      writer_column: "member_id",
      parent_status_column: "status",
      visible_parent_status_values: ["closed"],
      endpoint_writes_only: true,
    });
    expect(manifest.row_policies.poll_votes).toEqual({
      kind: "sealed_until",
      fk_column: "poll_id",
      parent_table: "polls",
      writer_column: "member_id",
      parent_status_column: "status",
      visible_parent_status_values: ["closed"],
      endpoint_writes_only: true,
    });
  });

  it("makes receipts private, immutable, and endpoint-only", () => {
    expect(manifest.row_policies.vote_receipts).toEqual({
      kind: "owner_only",
      member_column: "member_id",
      adults_bypass: false,
      member_can_update: false,
      endpoint_writes_only: true,
    });
  });

  it("supports both attributed and anonymous one-shot submission", () => {
    expect(manifest.anonymous_responses).toMatchObject({
      receipt_table: "vote_receipts",
      // Writes go to the replacement table, whose member column is nullable —
      // an anonymous submission omits that column entirely, which the original
      // `votes.member_id TEXT NOT NULL` would have rejected on every insert.
      response_table: "poll_votes",
      response_member_column: "member_id",
      response_answer_column: "option_id",
      session_table: "polls",
      session_status_column: "status",
      session_open_value: "open",
      session_anonymous_column: "anonymous",
    });
    expect(manifest.anonymous_responses.response_question_column).toBeUndefined();
  });

  it("publishes only an adult-gated creation event", () => {
    expect(manifest.publishes).toEqual(["poll.created"]);
    expect(manifest.publish_acls["poll.created"].require_role).toBe("adult");
    expect(manifest.alert_on).toEqual(["poll.created"]);
    expect(manifest.notification_acls).toBeUndefined();
  });
});

describe("migration", () => {
  it("exists and defines only polls, votes, and receipts", () => {
    expect(existsSync(join(root, "migrations/001_init.sql"))).toBe(true);
    for (const table of ["polls", "votes", "vote_receipts"]) {
      expect(migration).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS app_family_polls__${table}`));
    }
    expect(migration).not.toMatch(/app_family_polls__options/);
  });

  it("adds the per-poll anonymous flag and a nullable-voter ballot table", () => {
    const anon = readFileSync(join(root, "migrations/002_anonymous_polls.sql"), "utf8");
    expect(anon).toMatch(/ALTER TABLE app_family_polls__polls ADD COLUMN anonymous INTEGER NOT NULL DEFAULT 0/);
    // member_id must be nullable here: the protocol omits the column entirely
    // for an anonymous ballot.
    expect(anon).toMatch(/CREATE TABLE IF NOT EXISTS app_family_polls__poll_votes[\s\S]*?member_id\s+TEXT,/);
    // Existing ballots are carried across, so closed polls keep their results.
    expect(anon).toMatch(/INSERT OR IGNORE INTO app_family_polls__poll_votes[\s\S]*?FROM app_family_polls__votes/);
    // Still one vote per member on an attributed poll (SQLite treats NULLs as
    // distinct, so anonymous rows are unaffected).
    expect(anon).toMatch(/UNIQUE \(poll_id, member_id\)/i);
  });

  it("stores fixed choices on the poll", () => {
    expect(migration).toMatch(/options_json\s+TEXT\s+NOT NULL/i);
  });

  it("enforces one vote per member per poll", () => {
    expect(migration).toMatch(/UNIQUE \(poll_id, member_id\)/i);
  });
});

// Member removal (manifest.member_references). A cast vote stays in the tally
// — removing someone from the household must not retroactively rewrite a poll
// result — but it loses its attribution: `poll_votes.member_id` is nullable
// precisely because an anonymous ballot omits it, so clearing it leaves the
// vote counted and unattributed. The legacy `votes` table is NOT NULL and has
// no readers left (superseded by poll_votes in 002), so its rows go entirely.
// Receipts must go too: they are the one-vote-per-member guard, keyed
// (poll_id, member_id) with no `id` column.
describe("member_references", () => {
  it("unattributes votes, deletes receipts and legacy rows", () => {
    expect(manifest.member_references).toEqual({
      polls: { column: "created_by", on_removed: "keep" },
      poll_votes: { column: "member_id", on_removed: "null" },
      votes: { column: "member_id", on_removed: "delete" },
      vote_receipts: { column: "member_id", on_removed: "delete", id_column: "rowid" },
    });
  });
});
