import { afterAll, describe, expect, it } from "vitest";
import { addDaysStr, todayIn } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { personalIdeas } from "@/server/services/ideas";
import { createMemory, importMemories, listActiveMemories, listProposedMemories } from "@/server/services/memory";
import { createAssignment, createCourse } from "@/server/services/school";
import { makeUser } from "../helpers";

afterAll(closeDb);
const TZ = "America/New_York";

describe("memory import", () => {
  it("turns pasted text into suggestions only, skipping sensitive lines and what's already known", async () => {
    const { run } = await makeUser();
    await run((s) => createMemory(s, { content: "I study at Georgia State University.", category: "fact" }, "user"));
    const text = [
      "- I study at Georgia State University.",
      "- I work at Target on weekends.",
      "1. My password is hunter2",
      "• I prefer studying at night. I hate early mornings.",
      "ok",
    ].join("\n");
    const r = await run((s) => importMemories(s, text));
    expect(r).toEqual({ suggested: 3, skipped: 2 });
    const proposed = (await run((s) => listProposedMemories(s))).map((m) => m.content).sort();
    expect(proposed).toEqual(["I hate early mornings.", "I prefer studying at night.", "I work at Target on weekends."]);
    expect(await run((s) => listActiveMemories(s))).toHaveLength(1); // nothing new is used until approved
  });
});

describe("personal ideas", () => {
  it("come only from the user's records", async () => {
    const { run } = await makeUser();
    const today = todayIn(TZ);
    expect((await run((s) => personalIdeas(s, TZ, today, { school: true, work: true }))).map((i) => i.emoji)).toEqual(["💰"]); // no goal yet

    const bio = await run((s) => createCourse(s, { name: "Biology II" }));
    await run((s) => createCourse(s, { name: "Statistics" }));
    await run((s) => createAssignment(s, TZ, { courseId: bio.id, title: "Midterm", kind: "exam", dueDate: addDaysStr(today, 5), dueTime: "10:00" }));
    const ideas = await run((s) => personalIdeas(s, TZ, today, { school: true, work: false }));
    expect(ideas.map((i) => i.title)).toEqual([
      expect.stringMatching(/^Midterm is .+\. Want a study plan\?$/),
      "Nothing due in Statistics yet. Send me the syllabus?",
      "No savings goal yet. Set one?",
    ]);
    expect(await run((s) => personalIdeas(s, TZ, today, { school: false, work: false }))).toHaveLength(1);
  });
});
