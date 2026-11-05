import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { EXPORT_TABLES, exportedColumns, NOT_EXPORTED } from "@/server/services/data-export";

const tables = (Object.values(schema) as unknown[]).filter((v): v is PgTable => is(v, PgTable));
const userTables = tables.filter((t) => getTableConfig(t).columns.some((c) => c.name === "user_id")).map((t) => getTableConfig(t).name);
const exported = new Set(Object.values(EXPORT_TABLES).map((t) => getTableConfig(t).name));

describe("Download my data", () => {
  it("finds the schema's user tables (sanity)", () => {
    expect(tables.length).toBeGreaterThan(50);
    expect(userTables.length).toBeGreaterThan(40);
  });

  it("exports every table with a user_id, unless it is on the commented exclusion list", () => {
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

  it("keeps the exclusion list short and real: each entry is a user table that isn't also exported", () => {
    expect(Object.keys(NOT_EXPORTED).length).toBeLessThanOrEqual(10);
    for (const [name, reason] of Object.entries(NOT_EXPORTED)) {
      expect(userTables, name).toContain(name);
      expect(exported.has(name), name).toBe(false);
      expect(reason.length, name).toBeGreaterThan(10);
    }
  });

  it("never exports a secret or a hash column", () => {
    const secretLike = /hash|secret|password|credential|sha256|^p256dh$|^auth$|_token$|^token$|search_vector|data_base64/;
    const leaks: string[] = [];
    for (const key of Object.keys(EXPORT_TABLES) as (keyof typeof EXPORT_TABLES)[]) {
      for (const col of exportedColumns(key)) if (secretLike.test(col)) leaks.push(`${key}.${col}`);
    }
    expect(leaks).toEqual([]);
  });
});
