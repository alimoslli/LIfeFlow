import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { createTask } from "@/server/services/tasks";
import { createCourse } from "@/server/services/school";
import { tablesPointingAtUsers, undecidedTables } from "../fk-guard";
import { makeUser, TZ } from "../helpers";

/**
 * Every table that holds a user's data must hide other users' rows. This covers all of
 * them, not just the ones a feature test happens to touch.
 */
afterAll(closeDb);

// Tables that aren't owned by one user. `users` is the account table (sign-in looks users
// up by email before anyone is signed in); `error_reports` is shared, scrubbed error grouping.
const NOT_PER_USER = new Set(["users", "error_reports"]);

// Looked up before anyone is signed in (by a hash of a cookie or key, or by a provider id), so
// row-level security can't apply. Each read and write in the app filters by user id or by that
// secret hash; the lists here are the only exceptions and must be reviewed when they change.
const LOOKED_UP_BEFORE_SIGN_IN = new Set([
  "sessions",
  "recovery_codes",
  "passkeys",
  "auth_challenges",
  "oauth_identities",
  "password_resets",
  "login_challenges",
  "remembered_devices",
  "connection_registry",
  "health_tokens",
]);

// Tables that point at a user by a column NOT called user_id (found by their foreign key to users, so a new one is caught too).
// Each is account data read before and after sign-in (like login_challenges) or owner operations data, reached only through
// services, so none has row-level security: they hold hashes, links between accounts and owner copies, never a person's own content.
// Reviewed here with the reason. `waitlist_fingerprints` has no foreign key (it keeps only a one-way hash), so it isn't found by this guard.
const POINTS_AT_USER_BY_OTHER_NAME: Record<string, string> = {
  email_confirmations: "account data: the hashed confirm code, read before and after sign-in (like login_challenges); only email-confirm.ts reaches it",
  waitlist_referrals: "account data: who invited whom for the waitlist (keyed email hash), read by the queue services before and after sign-in",
  owner_inbox: "owner operations data behind requireAdmin; written by sendFeedback, never read in a user's scope",
  admin_actions: "the owner's log of admin actions behind requireAdmin; names the admin, not user content",
};

describe("every user-owned table is locked to its user", () => {
  it("every table with a foreign key to users has row-level security, is a listed sign-in table, or is a reviewed exception", async () => {
    const tables = await tablesPointingAtUsers(getDb());
    expect(undecidedTables(tables, (n) => n in POINTS_AT_USER_BY_OTHER_NAME)).toEqual([]);
    // the reviewed list holds only real tables
    expect(Object.keys(POINTS_AT_USER_BY_OTHER_NAME).filter((n) => !tables.some((t) => t.name === n))).toEqual([]);
    // and a new table pointing at a user by another name is caught
    expect(undecidedTables([...tables, { name: "zz_new_table", columns: ["owner_ref"], hasUserId: false }], (n) => n in POINTS_AT_USER_BY_OTHER_NAME)).toEqual([
      "zz_new_table",
    ]);
  });

  it("each table with a user_id column forces RLS and has the owner policy", async () => {
    const { rows } = await getDb().execute(sql`
      select c.table_name as name,
             (select relforcerowsecurity from pg_class where oid = (quote_ident(c.table_name))::regclass) as forced,
             exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.table_name and p.policyname = 'owner_isolation') as has_policy
      from information_schema.columns c
      where c.table_schema = 'public' and c.column_name = 'user_id'
      order by c.table_name`);
    const tables = rows as { name: string; forced: boolean; has_policy: boolean }[];
    expect(tables.length).toBeGreaterThan(30);
    const unprotected = tables.filter((t) => (!t.forced || !t.has_policy) && !LOOKED_UP_BEFORE_SIGN_IN.has(t.name)).map((t) => t.name);
    expect(unprotected).toEqual([]);
    // And the exceptions are real: nothing on the list is secured by accident.
    const listed = tables.filter((t) => LOOKED_UP_BEFORE_SIGN_IN.has(t.name)).map((t) => t.name);
    expect(listed.sort()).toEqual([...LOOKED_UP_BEFORE_SIGN_IN].sort());
  });

  it("another user sees zero rows from every user-owned table, even when filtering on the owner's id", async () => {
    const alice = await makeUser("Alice");
    const bob = await makeUser("Bob");
    await alice.run(async (s) => {
      await createTask(s, TZ, { title: "Alice task" });
      await createCourse(s, { name: "Alice course" });
    });
    const { rows } = await getDb().execute(sql`
      select table_name as name from information_schema.columns
      where table_schema = 'public' and column_name = 'user_id'`);
    const names = (rows as { name: string }[]).map((r) => r.name).filter((n) => !NOT_PER_USER.has(n) && !LOOKED_UP_BEFORE_SIGN_IN.has(n));

    const leaks: string[] = [];
    await bob.run(async ({ tx }) => {
      for (const name of names) {
        const res = await tx.execute(sql`select count(*)::int as n from ${sql.identifier(name)} where user_id = ${alice.user.id}`);
        if ((res.rows[0] as { n: number }).n !== 0) leaks.push(name);
      }
    });
    expect(leaks).toEqual([]);

    // The same query returns Alice's own rows, so the check isn't passing by accident.
    const own = await alice.run(({ tx }) => tx.execute(sql`select count(*)::int as n from tasks where user_id = ${alice.user.id}`));
    expect((own.rows[0] as { n: number }).n).toBeGreaterThan(0);
  });
});
