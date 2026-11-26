import { afterAll, describe, expect, it } from "vitest";
import { localToInstant } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { missedPractice, recordPractice } from "@/server/services/practice";
import { runProactive } from "@/server/services/proactive/engine";
import { createAssignment, createCourse } from "@/server/services/school";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

// Gamechanger 2 (owner, 2026-11-26): practice before an exam; the night before, only what they missed.
const NOW = localToInstant("2026-11-17", "19:00", TZ);

describe("exam practice", () => {
  it("remembers what they missed until they get it right, privately", async () => {
    const a = await makeUser("Practice");
    const b = await makeUser("Other");
    const exam = await a.run(async (s) => {
      const c = await createCourse(s, { name: "Biology", code: "BIO 101" });
      return (await createAssignment(s, TZ, { courseId: c.id, title: "Midterm", kind: "exam", dueDate: "2026-11-18", dueTime: "10:00" })).assignment;
    });
    const first = await a.run((s) =>
      recordPractice(
        s,
        exam.id,
        [
          { question: "What does the mitochondria make?", gotIt: false },
          { question: "Name the four DNA bases.", gotIt: true },
          { question: "What is osmosis?", gotIt: false },
        ],
        new Date(NOW.getTime() - 2 * 86_400_000),
      ),
    );
    expect(first.missed).toEqual(["What does the mitochondria make?", "What is osmosis?"]);
    await a.run((s) => recordPractice(s, exam.id, [{ question: "what is  osmosis?", gotIt: true }], new Date(NOW.getTime() - 86_400_000)));
    expect((await a.run((s) => missedPractice(s, exam.id))).missed).toEqual(["What does the mitochondria make?"]);
    await expect(b.run((s) => recordPractice(s, exam.id, [{ question: "x y z", gotIt: false }]))).rejects.toThrow();

    const eve = (await a.run((s) => runProactive({ scope: s, tz: TZ, prefs: a.user.preferences, trigger: "evening", now: NOW }))).filter(
      (m) => m.kind === "exam_eve",
    );
    expect(eve).toHaveLength(1);
    expect(eve[0].action).toMatchObject({ type: "ask", label: "Quiz me" });
    expect(eve[0].body).toContain("1 practice question from your last round needs another go.");
  });

  it("says nothing the night before when nothing was missed", async () => {
    const { user, run } = await makeUser("All Right");
    await run(async (s) => {
      const c = await createCourse(s, { name: "Chem", code: "CHEM 1" });
      const { assignment } = await createAssignment(s, TZ, { courseId: c.id, title: "Quiz 3", kind: "quiz", dueDate: "2026-11-18", dueTime: "09:00" });
      await recordPractice(s, assignment.id, [{ question: "What is a mole?", gotIt: true }], new Date(NOW.getTime() - 86_400_000));
    });
    const out = await run((s) => runProactive({ scope: s, tz: TZ, prefs: user.preferences, trigger: "evening", now: NOW }));
    expect(out.filter((m) => m.kind === "exam_eve")).toEqual([]);
  });
});
