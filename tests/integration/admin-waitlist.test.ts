import { and, eq, like } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { adminFor } from "@/server/auth/admin";
import { closeDb, getDb } from "@/server/db/client";
import { adminActions, appAccess, users } from "@/server/db/schema";
import { AdminError, acceptFromWaitlist, setWaitlist, waitlistHistory, waitlistNext, waitlistView } from "@/server/services/admin";
import { accessSettings, waitlistPlace } from "@/server/services/waitlist";
import { makeUser } from "../helpers";

afterAll(async () => {
  await getDb().update(appAccess).set({ waitlistOn: false, launchNote: null });
  await closeDb();
});

const db = () => getDb();

async function makeAdmin() {
  const { user } = await makeUser("Owner");
  await db().update(users).set({ totpEnabledAt: new Date() }).where(eq(users.id, user.id));
  process.env.ADMIN_EMAILS = [process.env.ADMIN_EMAILS, user.email].filter(Boolean).join(",");
  const admin = await adminFor(db(), user.id);
  expect(admin).not.toBeNull();
  return admin!;
}

/** A fresh line: everyone already in the test database is let in first. */
async function line(...names: string[]) {
  await db().update(users).set({ access: "in" }).where(eq(users.access, "waiting"));
  const people = [];
  for (const n of names) people.push((await makeUser(n)).user);
  return people;
}

describe("the waitlist in HQ", () => {
  it("shows the line in order with true places, even when searching", async () => {
    const admin = await makeAdmin();
    const [a, b, c] = await line("Ana Ruiz", "Ben Okafor", "Cleo Park");
    const v = await waitlistView(db());
    expect(v.waiting).toBe(3);
    expect(v.rows.map((r) => [r.place, r.id])).toEqual([
      [1, a.id],
      [2, b.id],
      [3, c.id],
    ]);
    const found = await waitlistView(db(), { q: "cleo" });
    expect(found.total).toBe(1);
    expect(found.rows[0]).toMatchObject({ id: c.id, place: 3 });
    // the admin isn't in line
    expect(v.rows.some((r) => r.id === admin.id)).toBe(false);
    expect((await waitlistNext(db(), 5)).map((p) => p.id)).toEqual([a.id, b.id, c.id]);
  });

  it("lets in only after the confirm, logs each person, and is safe to press twice", async () => {
    const admin = await makeAdmin();
    const [a, b, c] = await line("Ana", "Ben", "Cleo");
    await expect(acceptFromWaitlist(db(), admin, [a.id, b.id], false)).rejects.toThrow(AdminError);
    expect(await waitlistPlace(db(), a.id)).toBe(1);

    expect(await acceptFromWaitlist(db(), admin, [a.id, b.id], true)).toEqual({ accepted: 2, already: 0 });
    expect(await waitlistPlace(db(), c.id)).toBe(1);
    expect(await acceptFromWaitlist(db(), admin, [a.id, b.id], true)).toEqual({ accepted: 0, already: 2 });

    const logged = await db()
      .select({ target: adminActions.targetUserId, meta: adminActions.metadata })
      .from(adminActions)
      .where(and(eq(adminActions.action, "waitlist.accept"), eq(adminActions.actorUserId, admin.id)));
    expect(logged.map((l) => l.target).sort()).toEqual([a.id, b.id].sort());
    expect(new Set(logged.map((l) => l.meta.batch)).size).toBe(1);
    const history = await waitlistHistory(db());
    expect(history.filter((e) => e.action === "waitlist.accept" && e.actorEmail === admin.email)).toHaveLength(2);
  });

  it("never touches the admin, another admin or the demo account, and refuses junk and huge batches", async () => {
    const admin = await makeAdmin();
    const other = await makeAdmin();
    const [demo] = await line("Demo");
    await db().update(users).set({ accountKind: "demo" }).where(eq(users.id, demo.id));
    expect(await acceptFromWaitlist(db(), admin, [admin.id, other.id, demo.id], true)).toEqual({ accepted: 0, already: 3 });
    const [row] = await db().select({ access: users.access }).from(users).where(eq(users.id, demo.id));
    expect(row.access).toBe("waiting");
    await expect(acceptFromWaitlist(db(), admin, ["not-an-id"], true)).rejects.toThrow("Nobody was chosen.");
    const many = Array.from({ length: 101 }, () => crypto.randomUUID());
    await expect(acceptFromWaitlist(db(), admin, many, true)).rejects.toThrow("At most 100");
  });

  it("the switch needs a confirm to turn on, keeps the launch line, and logs changes", async () => {
    const admin = await makeAdmin();
    await expect(setWaitlist(db(), admin, { on: true, confirmed: false })).rejects.toThrow(AdminError);
    expect((await accessSettings(db())).waitlistOn).toBe(false);

    await setWaitlist(db(), admin, { on: true, confirmed: true, launchNote: "  We're aiming for   January 2027. " });
    expect(await accessSettings(db())).toEqual({ waitlistOn: true, launchNote: "We're aiming for January 2027." });
    await setWaitlist(db(), admin, { on: false, confirmed: false });
    expect(await accessSettings(db())).toEqual({ waitlistOn: false, launchNote: "We're aiming for January 2027." });
    await setWaitlist(db(), admin, { on: false, confirmed: true, launchNote: "" });
    expect((await accessSettings(db())).launchNote).toBeNull();

    const actions = await db()
      .select({ action: adminActions.action })
      .from(adminActions)
      .where(and(like(adminActions.action, "waitlist.%"), eq(adminActions.actorUserId, admin.id)));
    expect(actions.map((a) => a.action).sort()).toEqual(["waitlist.note", "waitlist.note", "waitlist.off", "waitlist.on"]);
  });
});
