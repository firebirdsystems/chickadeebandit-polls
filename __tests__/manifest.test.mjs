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
    expect(manifest.row_policies.polls).toEqual({
      kind: "adult_writable",
      // In a roster space only the steward authors polls; a no-op elsewhere.
      steward_writes_only: true,
      frozen_when: { status_column: "status", locked_values: ["closed"] },
    });
  });

  it("seals votes until the poll closes and keeps writes endpoint-only", () => {
    expect(manifest.row_policies.votes).toEqual({
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

  it("uses attributed one-shot response submission", () => {
    expect(manifest.anonymous_responses).toMatchObject({
      receipt_table: "vote_receipts",
      response_table: "votes",
      response_member_column: "member_id",
      response_answer_column: "option_id",
      session_table: "polls",
      session_status_column: "status",
      session_open_value: "open",
    });
    expect(manifest.anonymous_responses.response_question_column).toBeUndefined();
    expect(manifest.anonymous_responses.session_anonymous_column).toBeUndefined();
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

  it("stores fixed choices on the poll", () => {
    expect(migration).toMatch(/options_json\s+TEXT\s+NOT NULL/i);
  });

  it("enforces one vote per member per poll", () => {
    expect(migration).toMatch(/UNIQUE \(poll_id, member_id\)/i);
  });
});
