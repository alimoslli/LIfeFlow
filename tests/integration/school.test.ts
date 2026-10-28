import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { createCourse, importAssignments, listAssignments, resolveCourse, updateAssignment } from "@/server/services/school";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

describe("assignment ingestion", () => {
  it("imports into matched courses, skips duplicates, and flags unknown courses", async () => {
    const u = await makeUser();
    const bio = await u.run((s) => createCourse(s, { name: "Introduction to Biology", code: "BIO 101" }));
    await u.run((s) => createCourse(s, { name: "Calculus II", code: "MATH 152" }));

    const items = [
      { title: "Lab Report 3", courseName: "bio101", dueDate: "2026-11-03", dueTime: "23:59" },
      { title: "Problem Set 7", courseName: "Calculus", dueDate: "2026-11-05" },
      { title: "Midterm", courseName: "BIO 101", kind: "exam" as const, dueDate: "2026-11-10", dueTime: "09:00" },
      { title: "Essay 2", courseName: "English Composition", dueDate: "2026-11-07" },
    ];
    const now = new Date("2026-10-26T12:00:00Z");
    const first = await u.run((s) => importAssignments(s, TZ, items, { source: "jarvis", now }));
    expect(first.created.map((c) => c.title)).toEqual(["Lab Report 3", "Problem Set 7", "Midterm"]);
    expect(first.needsCourse).toEqual([{ title: "Essay 2", courseName: "English Composition", candidates: [] }]);

    // Re-importing the same list (title casing/spacing differs) creates nothing new.
    const again = await u.run((s) =>
      importAssignments(
        s,
        TZ,
        items.map((i) => ({ ...i, title: `  ${i.title.toUpperCase()} ` })),
        { now },
      ),
    );
    expect(again.created).toHaveLength(0);
    expect(again.duplicates).toHaveLength(3);

    const bioList = await u.run((s) => listAssignments(s, TZ, { courseId: bio.id, now }));
    expect(bioList.map((a) => a.title)).toEqual(["Lab Report 3", "Midterm"]);
    expect(bioList[0].dueAt!.toISOString()).toBe("2026-11-04T04:59:00.000Z"); // 23:59 EST
    expect(bioList[1].kind).toBe("exam");
    expect(bioList.every((a) => a.source === "jarvis")).toBe(true);
  });

  it("can create missing courses when asked, but never for ambiguous matches", async () => {
    const u = await makeUser();
    await u.run((s) => createCourse(s, { name: "Biology I", code: "BIO 101" }));
    await u.run((s) => createCourse(s, { name: "Biology II", code: "BIO 102" }));
    const res = await u.run((s) =>
      importAssignments(
        s,
        TZ,
        [
          { title: "Reading 1", courseName: "Biology", dueDate: "2026-11-01" },
          { title: "Sketch", courseName: "Drawing Fundamentals", dueDate: "2026-11-02" },
        ],
        { createMissingCourses: true },
      ),
    );
    expect(res.needsCourse[0].title).toBe("Reading 1");
    expect(res.needsCourse[0].candidates.map((c) => c.code).sort()).toEqual(["BIO 101", "BIO 102"]);
    expect(res.created.map((c) => c.course)).toEqual(["Drawing Fundamentals"]);
  });

  it("warns about dates far in the past (likely wrong year)", async () => {
    const u = await makeUser();
    await u.run((s) => createCourse(s, { name: "History", code: "HIS 200" }));
    const res = await u.run((s) =>
      importAssignments(s, TZ, [{ title: "Paper", courseName: "History", dueDate: "2025-11-01" }], { now: new Date("2026-10-26T12:00:00Z") }),
    );
    expect(res.warnings[0]).toMatch(/check the year/i);
  });

  it("sorts assignments into today / week / overdue / completed views", async () => {
    const u = await makeUser();
    const c = await u.run((s) => createCourse(s, { name: "Chem", code: "CHEM 1" }));
    const now = new Date("2026-10-27T15:00:00Z"); // Tue 11:00 New York
    await u.run((s) =>
      importAssignments(
        s,
        TZ,
        [
          { title: "Due today", courseId: c.id, dueDate: "2026-10-27" },
          { title: "Due Friday", courseId: c.id, dueDate: "2026-10-30" },
          { title: "Next month", courseId: c.id, dueDate: "2026-11-20" },
          { title: "Late", courseId: c.id, dueDate: "2026-10-20" },
        ],
        { now },
      ),
    );
    const view = (v: "today" | "week" | "overdue" | "upcoming" | "completed") =>
      u.run((s) => listAssignments(s, TZ, { view: v, now })).then((r) => r.map((a) => a.title));
    expect(await view("today")).toEqual(["Due today"]);
    expect(await view("week")).toEqual(["Due today", "Due Friday"]);
    expect(await view("overdue")).toEqual(["Late"]);
    expect(await view("upcoming")).toEqual(["Due today", "Due Friday", "Next month"]);
    const late = (await u.run((s) => listAssignments(s, TZ, { view: "overdue", now })))[0];
    await u.run((s) => updateAssignment(s, TZ, late.id, { status: "done" }));
    expect(await view("completed")).toEqual(["Late"]);
    expect(await view("overdue")).toEqual([]);
  });

  it("resolves a course by id only if owned", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const c = await a.run((s) => createCourse(s, { name: "Physics" }));
    expect((await b.run((s) => resolveCourse(s, { courseId: c.id }))).course).toBeNull();
  });
});
