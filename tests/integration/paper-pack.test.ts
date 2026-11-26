import { afterAll, describe, expect, it } from "vitest";
import { localToInstant } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { createEvent } from "@/server/services/calendar";
import { getPaperPack, packSessions, savePaperPack } from "@/server/services/paper-pack";
import { runProactive } from "@/server/services/proactive/engine";
import { createAssignment, createCourse } from "@/server/services/school";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

// Gamechanger 1 (owner, 2026-11-26): a paper pack, offered 3 to 5 days before a paper is due.
const NOW = localToInstant("2026-11-17", "14:00", TZ); // a Tuesday

async function paper(s: Parameters<Parameters<Awaited<ReturnType<typeof makeUser>>["run"]>[0]>[0], title = "Research paper on sleep", dueDate = "2026-11-21") {
  const c = await createCourse(s, { name: "Psychology", code: "PSY 101" });
  const { assignment } = await createAssignment(s, TZ, { courseId: c.id, title, kind: "assignment", dueDate, dueTime: "23:59" });
  return assignment;
}

describe("paper pack", () => {
  it("offers a pack once for a paper due in 3 to 5 days, as a question in the bar, never a paid search on its own", async () => {
    const { user, run } = await makeUser("Paper Pack");
    await run((s) => paper(s));
    const first = (await run((s) => runProactive({ scope: s, tz: TZ, prefs: user.preferences, trigger: "morning", now: NOW }))).filter(
      (m) => m.kind === "paper_pack",
    );
    expect(first).toHaveLength(1);
    expect(first[0].action).toEqual({ type: "ask", label: "Find sources", prompt: "Make me a paper pack for Research paper on sleep" });
    expect(first[0].body).toContain("Research paper on sleep is due Saturday.");
    const again = (await run((s) => runProactive({ scope: s, tz: TZ, prefs: user.preferences, trigger: "morning", now: NOW }))).filter(
      (m) => m.kind === "paper_pack",
    );
    expect(again).toHaveLength(0);
  });

  it("stays quiet for an exam, for work due too soon, and for a paper that already has a pack", async () => {
    const { user, run } = await makeUser("No Offer");
    await run(async (s) => {
      const c = await createCourse(s, { name: "Biology", code: "BIO 101" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Midterm paper exam", kind: "exam", dueDate: "2026-11-21", dueTime: "10:00" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Lab report", kind: "assignment", dueDate: "2026-11-18", dueTime: "23:59" });
      const { assignment } = await createAssignment(s, TZ, {
        courseId: c.id,
        title: "Essay on cells",
        kind: "assignment",
        dueDate: "2026-11-21",
        dueTime: "23:59",
      });
      await savePaperPack(s, assignment.id, { sources: [{ title: "Cells", url: "https://example.org/cells", why: "" }], questions: [] }, NOW);
    });
    const out = await run((s) => runProactive({ scope: s, tz: TZ, prefs: user.preferences, trigger: "morning", now: NOW }));
    expect(out.filter((m) => m.kind === "paper_pack")).toEqual([]);
  });

  it("is private to its owner, replaces itself, and goes with the work", async () => {
    const a = await makeUser("Owner");
    const b = await makeUser("Someone Else");
    const work = await a.run((s) => paper(s));
    await a.run((s) => savePaperPack(s, work.id, { sources: [{ title: "One", url: "https://example.org/1", why: "first" }], questions: ["Why?"] }, NOW));
    await a.run((s) => savePaperPack(s, work.id, { sources: [{ title: "Two", url: "https://example.org/2", why: "second" }], questions: [] }, NOW));
    const mine = await a.run((s) => getPaperPack(s, work.id));
    expect(mine?.sources.map((x) => x.title)).toEqual(["Two"]);
    expect(await b.run((s) => getPaperPack(s, work.id))).toBeNull();
    await expect(b.run((s) => savePaperPack(s, work.id, { sources: [], questions: [] }, NOW))).rejects.toThrow();
  });

  it("finds up to three sessions in real free time before it's due, never on top of a shift", async () => {
    const { run } = await makeUser("Sessions");
    const sessions = await run(async (s) => {
      const work = await paper(s);
      await createEvent(s, TZ, { title: "Shift", date: "2026-11-18", startTime: "08:00", endTime: "22:00", kind: "work" });
      return packSessions(s, TZ, work.dueAt, NOW);
    });
    expect(sessions).toHaveLength(3);
    expect(sessions.map((x) => x.date)).toEqual(["2026-11-17", "2026-11-19", "2026-11-20"]);
    expect(sessions[0]).toMatchObject({ start: "14:00", end: "15:00", when: "Today at 2 PM" });
  });
});
