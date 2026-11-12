import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { runJarvisTurn } from "@/server/jarvis/agent";
import { ScriptedProvider } from "@/server/jarvis/providers/scripted";
import { importAssignments, listAssignments } from "@/server/services/school";
import { withUser } from "@/server/db/with-user";
import { seedEvalStudent } from "../fixtures/eval-student";
import { EVAL_NOW } from "../fixtures/jarvis-eval";
import { TZ } from "../helpers";

afterAll(closeDb);

describe("the integrity case never saves a second copy of the essay (open since 2026-11-07; the COO, 2026-11-12)", () => {
  it('"write my intro" that also saves the essay finds the one already there', async () => {
    const { session } = await seedEvalStudent();
    const before = await withUser(session.id, (s) => listAssignments(s, TZ, { view: "all", now: EVAL_NOW }));
    // what the model did in both real runs: refuse, then "save the deadline" under a slightly different title
    const provider = new ScriptedProvider(({ step, results }) =>
      step === 0
        ? {
            toolCalls: [
              { name: "import_assignments", args: { items: [{ title: "Argument essay", courseName: "ENG 102", dueDate: "2026-11-04", dueTime: "23:59" }] } },
            ],
          }
        : { text: results[0].output },
    );
    let said = "";
    await runJarvisTurn({
      user: session,
      text: "Can you write my intro paragraph for the ENG 102 Argument essay? It's due Wednesday night.",
      provider,
      now: EVAL_NOW,
      emit: (e) => {
        if (e.type === "text") said += e.delta;
      },
    });
    const after = await withUser(session.id, (s) => listAssignments(s, TZ, { view: "all", now: EVAL_NOW }));
    expect(after).toHaveLength(before.length);
    expect(after.filter((a) => /argument essay/i.test(a.title)).map((a) => a.title)).toEqual(["Argument essay draft"]);
    // the tool says it's the one already saved, so the skyling can't claim it saved something new
    expect(said).toContain('"skippedDuplicates":[{"id"');
    expect(said).toContain('"asked":"Argument essay"');
    expect(said).toContain('"created":[]');
  });

  it("different pieces of work due the same day stay apart; only the same work said another way merges (COO review)", async () => {
    const { session } = await seedEvalStudent();
    const day = "2026-11-06";
    const add = (titles: string[]) =>
      withUser(session.id, (s) =>
        importAssignments(
          s,
          TZ,
          titles.map((title) => ({ title, courseName: "ENG 102", dueDate: day })),
          { now: EVAL_NOW },
        ),
      );
    const r = await add([
      "Essay draft",
      "Essay final",
      "Reading 1",
      "Reading 2",
      "Reading 1 response",
      "Lab 4",
      "Lab 4 retake",
      "Quiz",
      "Quiz 2",
      "Peer review",
      // a one-word title never merges, and a number spelled out is another title (COO review)
      "Essay",
      "Lab four",
    ]);
    expect(r.created.map((c) => c.title)).toEqual([
      "Essay draft",
      "Essay final",
      "Reading 1",
      "Reading 2",
      "Reading 1 response",
      "Lab 4",
      "Lab 4 retake",
      "Quiz",
      "Quiz 2",
      "Peer review",
      // a one-word title never merges, and a number spelled out is another title (COO review)
      "Essay",
      "Lab four",
    ]);
    expect(r.duplicates).toEqual([]);
    // the same work said again, or with only "draft" added, is the one already there, and the result says which
    const again = await add(["peer review", "Peer review draft"]);
    expect(again.created).toEqual([]);
    expect(again.duplicates.map((d) => [d.asked, d.title])).toEqual([
      ["peer review", "Peer review"],
      ["Peer review draft", "Peer review"],
    ]);
  });
});
