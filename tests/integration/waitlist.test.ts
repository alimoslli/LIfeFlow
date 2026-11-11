import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { appAccess, users } from "@/server/db/schema";
import { acceptUsers, accessSettings, canUseApp, moveUpOne, nextInLine, waitingCount, waitlistPlace } from "@/server/services/waitlist";
import { makeUser } from "../helpers";

afterAll(closeDb);

/** Lets everyone already in the test database in, so places count only the people a test makes. */
async function clearLine() {
  await getDb().update(users).set({ access: "in" }).where(eq(users.access, "waiting"));
}

async function line(...names: string[]) {
  await clearLine();
  const people = [];
  for (const n of names) people.push((await makeUser(n)).user);
  return people;
}

const place = (id: string) => waitlistPlace(getDb(), id);

describe("the waitlist", () => {
  const savedAdmins = process.env.ADMIN_EMAILS;
  afterEach(() => {
    process.env.ADMIN_EMAILS = savedAdmins;
  });

  it("is off until the owner switches it on, and access never touches the plan", async () => {
    expect(await accessSettings(getDb())).toEqual({ waitlistOn: false, launchNote: null });
    const [maya] = await line("Maya Chen");
    const [row] = await getDb().select({ access: users.access, plan: users.plan, acceptedAt: users.acceptedAt }).from(users).where(eq(users.id, maya.id));
    expect(row).toEqual({ access: "waiting", plan: "free", acceptedAt: null });
    const person = { email: maya.email, accountKind: "standard" as const, access: "waiting" as const };
    expect(canUseApp(person, false)).toBe(true);
    expect(canUseApp(person, true)).toBe(false);
    expect(canUseApp({ ...person, access: "in" }, true)).toBe(true);
    // admins and the demo account are always in
    expect(canUseApp(person, true, { ADMIN_EMAILS: ` ${maya.email.toUpperCase()} ` })).toBe(true);
    expect(canUseApp({ ...person, accountKind: "demo" }, true)).toBe(true);

    await acceptUsers(getDb(), [maya.id]);
    const [after] = await getDb().select({ plan: users.plan }).from(users).where(eq(users.id, maya.id));
    expect(after.plan).toBe("free");
  });

  it("keeps sign-up order: new accounts join the end, and everyone below moves up when someone is let in", async () => {
    const [a, b, c] = await line("Ana", "Ben", "Cleo");
    expect([await place(a.id), await place(b.id), await place(c.id)]).toEqual([1, 2, 3]);
    expect(await waitingCount(getDb())).toBe(3);

    const d = (await makeUser("Dev")).user;
    expect(await place(d.id)).toBe(4);

    await acceptUsers(getDb(), [a.id]);
    expect(await place(a.id)).toBeNull();
    expect([await place(b.id), await place(c.id), await place(d.id)]).toEqual([1, 2, 3]);
    expect((await nextInLine(getDb(), 2)).map((p) => p.id)).toEqual([b.id, c.id]);
  });

  it("leaves suspended accounts and admins out of the count", async () => {
    const [a, b, c] = await line("Ana", "Ben", "Cleo");
    await getDb().update(users).set({ suspendedAt: new Date() }).where(eq(users.id, a.id));
    process.env.ADMIN_EMAILS = b.email;
    expect(await place(a.id)).toBeNull();
    expect(await place(b.id)).toBeNull();
    expect(await place(c.id)).toBe(1);
  });

  it("accepting is safe to retry and reports who was already in", async () => {
    const [a, b] = await line("Ana", "Ben");
    expect(await acceptUsers(getDb(), [a.id, a.id])).toEqual({ accepted: [a.id], already: [] });
    const again = await acceptUsers(getDb(), [a.id, b.id]);
    expect(again).toEqual({ accepted: [b.id], already: [a.id] });
    expect(await acceptUsers(getDb(), [])).toEqual({ accepted: [], already: [] });
    const rows = await getDb()
      .select({ access: users.access, at: users.acceptedAt })
      .from(users)
      .where(inArray(users.id, [a.id, b.id]));
    expect(rows.every((r) => r.access === "in" && r.at instanceof Date)).toBe(true);
  });

  it("a move puts someone ahead of the person just above; first stays first, and people already in are skipped", async () => {
    const [a, b, c, d] = await line("Ana", "Ben", "Cleo", "Dev");
    expect(await moveUpOne(getDb(), a.id)).toBe(false);
    expect(await moveUpOne(getDb(), c.id)).toBe(true);
    expect([await place(a.id), await place(c.id), await place(b.id), await place(d.id)]).toEqual([1, 2, 3, 4]);

    // Ben is let in, so the person just above Dev is now Cleo.
    await acceptUsers(getDb(), [b.id]);
    expect(await place(d.id)).toBe(3);
    expect(await moveUpOne(getDb(), d.id)).toBe(true);
    expect([await place(a.id), await place(d.id), await place(c.id)]).toEqual([1, 2, 3]);

    // Someone not in line can't move.
    expect(await moveUpOne(getDb(), b.id)).toBe(false);
  });

  it("moves at the same time never lose or share a place", async () => {
    const people = await line("P1", "P2", "P3", "P4", "P5", "P6");
    const movers = [people[5], people[4], people[3], people[2], people[5], people[1]];
    await Promise.all(movers.map((p) => moveUpOne(getDb(), p.id)));
    const places = await Promise.all(people.map((p) => place(p.id)));
    expect([...places].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("the database change is safe to run again and ranks existing accounts by sign-up", async () => {
    const [a, b, c] = await line("Ana", "Ben", "Cleo");
    const before = await getDb()
      .select({ id: users.id, rank: users.waitlistRank })
      .from(users)
      .where(inArray(users.id, [a.id, b.id, c.id]));
    const file = readFileSync(path.join(import.meta.dirname, "../../drizzle/0061_waitlist.sql"), "utf8");
    const steps = file
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    // Re-run every step: nothing changes and nothing fails.
    for (const s of steps) await getDb().execute(sql.raw(s));
    const after = await getDb()
      .select({ id: users.id, rank: users.waitlistRank })
      .from(users)
      .where(inArray(users.id, [a.id, b.id, c.id]));
    expect(after.sort((x, y) => x.rank - y.rank)).toEqual(before.sort((x, y) => x.rank - y.rank));
    const [settings] = await getDb().select().from(appAccess);
    expect(settings.waitlistOn).toBe(false);

    // Accounts made before the change (no place yet) get one in sign-up order, after everyone already placed.
    await getDb()
      .transaction(async (tx) => {
        await tx.execute(sql`alter table users alter column waitlist_rank drop not null`);
        await tx
          .update(users)
          .set({ waitlistRank: sql`null` })
          .where(inArray(users.id, [a.id, b.id, c.id]));
        await tx
          .update(users)
          .set({ createdAt: new Date("2026-01-03") })
          .where(eq(users.id, a.id));
        await tx
          .update(users)
          .set({ createdAt: new Date("2026-01-01") })
          .where(eq(users.id, b.id));
        await tx
          .update(users)
          .set({ createdAt: new Date("2026-01-02") })
          .where(eq(users.id, c.id));
        const [{ max }] = (await tx.execute(sql`select coalesce(max(waitlist_rank), 0)::int as max from users`)).rows as { max: number }[];
        await tx.execute(sql.raw(steps.find((s) => s.includes('SET "waitlist_rank" = r.n'))!));
        const ranks = await tx
          .select({ id: users.id, rank: users.waitlistRank })
          .from(users)
          .where(inArray(users.id, [a.id, b.id, c.id]));
        const byRank = ranks.sort((x, y) => x.rank - y.rank);
        expect(byRank.map((r) => r.id)).toEqual([b.id, c.id, a.id]);
        expect(byRank[0].rank).toBe(max + 1);
        throw new Error("rollback");
      })
      .catch((e) => {
        if ((e as Error).message !== "rollback") throw e;
      });
  });
});
