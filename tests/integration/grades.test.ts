import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { courseGradeReport, createAssignment, createCourse, updateAssignment, updateCourse } from "@/server/services/school";
import { createEmployer, updateEmployer } from "@/server/services/work";
import { makeUser } from "../helpers";

afterAll(closeDb);
const TZ = "America/New_York";

describe("class grade", () => {
  it("comes from recorded grades and the syllabus weights", async () => {
    const { run } = await makeUser();
    const c = await run((s) => createCourse(s, { name: "Biology II" }));
    expect((await run((s) => courseGradeReport(s, TZ, c.id))).grade).toBeNull();

    const mid = await run((s) => createAssignment(s, TZ, { courseId: c.id, title: "Midterm", kind: "exam", pointsPossible: 100 }));
    const hw = await run((s) => createAssignment(s, TZ, { courseId: c.id, title: "HW 1", kind: "assignment", pointsPossible: 20 }));
    await run((s) => updateAssignment(s, TZ, mid.assignment.id, { grade: "70" }));
    await run((s) => updateAssignment(s, TZ, hw.assignment.id, { grade: "19/20" }));
    expect((await run((s) => courseGradeReport(s, TZ, c.id))).grade).toMatchObject({ percent: 74.2, letter: "C", graded: 2 });

    await run((s) => updateCourse(s, c.id, { gradeWeights: { exam: 50, assignment: 50 } }));
    expect((await run((s) => courseGradeReport(s, TZ, c.id))).grade).toMatchObject({ percent: 82.5, letter: "B-", countedWeight: 100 });
  });

  it("an edit changes only what was sent (an exam stays an exam, a salaried job stays salaried)", async () => {
    const { run } = await makeUser();
    const c = await run((s) => createCourse(s, { name: "Chem" }));
    const exam = await run((s) => createAssignment(s, TZ, { courseId: c.id, title: "Final", kind: "exam", pointsPossible: 50 }));
    const edited = await run((s) => updateAssignment(s, TZ, exam.assignment.id, { grade: "45/50" }));
    expect(edited).toMatchObject({ kind: "exam", grade: "45/50" });
    const job = await run((s) => createEmployer(s, { name: "Lab", payType: "salary", annualSalaryCents: 3_000_000, overtimeThresholdHours: 45 }));
    const after = await run((s) => updateEmployer(s, job.id, { position: "Tech" }));
    expect(after).toMatchObject({ payType: "salary", overtimeThresholdHours: "45.00", position: "Tech" });
  });
});
