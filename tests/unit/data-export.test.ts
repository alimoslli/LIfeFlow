import { getTableColumns, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { EXPORT_TABLES, exportedColumns, NOT_EXPORTED } from "@/server/services/data-export";

const tables = (Object.values(schema) as unknown[]).filter((v): v is PgTable => is(v, PgTable));
const usersTable = getTableConfig(schema.users).name;

/**
 * A table holds data about a person when it points at users.id (a foreign key, whatever the column is called)
 * or has a column named user_id or *_user_id (admin_actions.target_user_id has no foreign key on purpose).
 * The users table itself is the account; its profile and preferences are exported as `profile`.
 */
function userColumns(t: PgTable): string[] {
  const c = getTableConfig(t);
  const viaKey = c.foreignKeys.flatMap((fk) => {
    const ref = fk.reference();
    return getTableConfig(ref.foreignTable).name === usersTable ? ref.columns.map((col) => col.name) : [];
  });
  const byName = c.columns.filter((col) => col.name === "user_id" || col.name.endsWith("_user_id")).map((col) => col.name);
  return [...new Set([...viaKey, ...byName])];
}
const userTables = tables.filter((t) => getTableConfig(t).name !== usersTable && userColumns(t).length > 0).map((t) => getTableConfig(t).name);
const exported = new Set(Object.values(EXPORT_TABLES).map((t) => getTableConfig(t).name));

describe("Download my data", () => {
  it("finds the schema's user tables, by foreign key as well as by name (sanity)", () => {
    expect(tables.length).toBeGreaterThan(50);
    expect(userTables.length).toBeGreaterThan(40);
    for (const name of ["owner_inbox", "admin_actions", "auth_challenges"]) expect(userTables, name).toContain(name);
  });

  it("exports every table about a person, unless it is on the commented exclusion list", () => {
    const missing = userTables.filter((name) => !exported.has(name) && !(name in NOT_EXPORTED));
    expect(missing).toEqual([]);
  });

  it("includes the user content the audit found missing", () => {
    for (const name of [
      "life_milestones",
      "personal_goals",
      "goal_checkins",
      "habits",
      "habit_checks",
      "goal_contributions",
      "category_rules",
      "jarvis_messages",
      "attachments",
      "net_worth_snapshots",
      "inbox_items",
      "savings_opportunities",
      "feedback",
    ]) {
      expect(exported.has(name), name).toBe(true);
    }
  });

  it("leaves the background sync log out: a row every 30 minutes per bank, not the person's content", () => {
    expect(exported.has("sync_jobs")).toBe(false);
    expect(NOT_EXPORTED.sync_jobs).toBeDefined();
  });

  it("keeps the exclusion list short and real: each entry is a user table that isn't also exported", () => {
    expect(Object.keys(NOT_EXPORTED).length).toBeLessThanOrEqual(17);
    for (const [name, reason] of Object.entries(NOT_EXPORTED)) {
      expect(userTables, name).toContain(name);
      expect(exported.has(name), name).toBe(false);
      expect(reason.length, name).toBeGreaterThan(10);
    }
  });

  it("reads each exported table by its owner and in id order (what the streamed export pages by)", () => {
    for (const [key, table] of Object.entries(EXPORT_TABLES)) {
      const cols = getTableColumns(table);
      expect(cols.userId?.name, key).toBe("user_id");
      expect(cols.id?.primary, key).toBe(true);
    }
  });

  // Columns that match the pattern but hold no secret. Anything new that matches must be omitted or added here with a reason.
  const NAMED_LIKE_A_KEY_BUT_NOT_SECRET: Record<string, string> = {
    "categoryRules.merchant_key": "the normalised merchant name the rule matches",
    "recurring.merchant_key": "the normalised merchant name of the bill or subscription",
    "assignments.dedupe_key": "an id like canvas:123 so an assignment is imported once",
    "assistantMessages.dedupe_key": "an id like bill:<id>:<date> so a message isn't repeated",
    "notifications.key": "which reminder was sent, like task:<id>:<time>",
    "skyRewards.key": "what earned a star or sun on the skyling's cloud, like task:<id> or milestone:<id>",
  };

  it("never exports a column named like a secret, key or hash", () => {
    const secretLike = /hash|secret|password|credential|sha256|key|encrypted|cipher|otp|salt|nonce|^p256dh$|^auth$|_token$|^token$|search_vector|data_base64/;
    const leaks: string[] = [];
    for (const key of Object.keys(EXPORT_TABLES) as (keyof typeof EXPORT_TABLES)[]) {
      for (const col of exportedColumns(key)) if (secretLike.test(col) && !(`${key}.${col}` in NAMED_LIKE_A_KEY_BUT_NOT_SECRET)) leaks.push(`${key}.${col}`);
    }
    expect(leaks).toEqual([]);
    // The exceptions are real columns that are still exported.
    for (const name of Object.keys(NAMED_LIKE_A_KEY_BUT_NOT_SECRET)) {
      const [key, col] = name.split(".");
      expect(exportedColumns(key as keyof typeof EXPORT_TABLES), name).toContain(col);
    }
  });
});
