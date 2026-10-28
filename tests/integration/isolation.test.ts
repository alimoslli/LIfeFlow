import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { tasks, courses } from "@/server/db/schema";
import { createTask, getTask, listTasks, updateTask, deleteTask } from "@/server/services/tasks";
import { createCourse } from "@/server/services/school";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

describe("user data isolation", () => {
  it("RLS hides other users' rows even from unfiltered queries", async () => {
    const alice = await makeUser("Alice");
    const bob = await makeUser("Bob");
    await alice.run((s) => createTask(s, TZ, { title: "Alice private task" }));
    // An intentionally unscoped query (no user_id filter) still only sees Bob's rows.
    const seenByBob = await bob.run(({ tx }) => tx.select().from(tasks));
    expect(seenByBob.find((t) => t.title === "Alice private task")).toBeUndefined();
    const seenByAlice = await alice.run(({ tx }) => tx.select().from(tasks));
    expect(seenByAlice.map((t) => t.title)).toContain("Alice private task");
  });

  it("no rows are visible without a user context", async () => {
    const rows = await getDb().select().from(tasks);
    expect(rows).toHaveLength(0);
  });

  it("RLS rejects inserting rows for another user", async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    const err = await bob.run(({ tx }) => tx.insert(tasks).values({ userId: alice.user.id, title: "spoofed" })).catch((e: Error) => e);
    expect(String((err as Error & { cause?: Error }).cause?.message)).toMatch(/row-level security/);
  });

  it("services refuse to read, update or delete another user's record by id", async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    const task = await alice.run((s) => createTask(s, TZ, { title: "mine" }));
    await expect(bob.run((s) => getTask(s, task.id))).rejects.toThrow(/not found/);
    await expect(bob.run((s) => updateTask(s, TZ, task.id, { title: "hacked" }))).rejects.toThrow(/not found/);
    await expect(bob.run((s) => deleteTask(s, task.id))).rejects.toThrow(/not found/);
    const still = await alice.run((s) => getTask(s, task.id));
    expect(still.title).toBe("mine");
  });

  it("cannot link records to another user's course (FKs bypass RLS, services check)", async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    const course = await alice.run((s) => createCourse(s, { name: "Alice's course" }));
    await expect(bob.run((s) => createTask(s, TZ, { title: "x", courseId: course.id }))).rejects.toThrow(/Course not found/);
  });

  it("the app role does not bypass RLS", async () => {
    const { rows } = await getDb().execute(sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`);
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    const forced = await getDb().execute(sql`select relname from pg_class where relname in ('tasks','transactions','memories') and relforcerowsecurity`);
    expect(forced.rows).toHaveLength(3);
  });

  it("lists only open tasks by default, sorted by due date", async () => {
    const u = await makeUser();
    await u.run(async (s) => {
      await createTask(s, TZ, { title: "later", dueDate: "2026-12-01" });
      await createTask(s, TZ, { title: "sooner", dueDate: "2026-11-01", priority: "high" });
      const done = await createTask(s, TZ, { title: "finished" });
      await updateTask(s, TZ, done.id, { status: "done" });
    });
    const open = await u.run((s) => listTasks(s));
    expect(open.map((t) => t.title)).toEqual(["sooner", "later"]);
    void courses;
  });
});
