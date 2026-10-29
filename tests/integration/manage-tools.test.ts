import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { getTool } from "@/server/jarvis/registry";
import { listRecurring } from "@/server/services/finance/planning";
import { createProject } from "@/server/services/notes";
import { createCourse, listCourses } from "@/server/services/school";
import { createEmployer, listEmployers } from "@/server/services/work";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

const NOW = new Date("2026-10-28T15:00:00Z");

describe("Jarvis edit and delete tools", () => {
  it("edits and removes courses, projects, jobs, bills and habits through the tools", async () => {
    const { user, run } = await makeUser();
    const ctx = { userId: user.id, tz: TZ, today: "2026-10-28", now: NOW, conversationId: "", userText: "", memorySuggestions: false, run };
    const call = (name: string, args: Record<string, unknown>) => getTool(name)!.execute(args as never, ctx) as Promise<Record<string, unknown>>;
    const confirm = (name: string, args: Record<string, unknown>) => getTool(name)!.confirm!(args as never, ctx);

    const course = await run((s) => createCourse(s, { name: "Calculus II", code: "MATH 152" }));
    expect(await call("update_course", { id: course.id, meetingInfo: "Mon/Wed 10:00" })).toMatchObject({ updated: { meetingInfo: "Mon/Wed 10:00" } });
    expect(await confirm("delete_course", { id: course.id })).toContain("Calculus II");
    await call("delete_course", { id: course.id });
    expect(await run((s) => listCourses(s))).toHaveLength(0);

    const project = await run((s) => createProject(s, { name: "Portfolio site" }));
    expect(await call("update_project", { id: project.id, status: "completed" })).toMatchObject({ updated: { status: "completed" } });

    const job = await run((s) => createEmployer(s, { name: "Campus Library", hourlyRateCents: 1500 }));
    expect(await call("update_job", { id: job.id, hourlyRate: 16.25 })).toMatchObject({ updated: { hourlyRate: 16.25 } });
    await call("remove_job", { id: job.id });
    expect(await run((s) => listEmployers(s))).toHaveLength(0);

    const bill = (await call("add_bill", { name: "Verizon", amount: 65, frequency: "monthly", nextDueDate: "2026-11-05" })) as { created: { id: string } };
    expect(await call("update_bill", { id: bill.created.id, amount: 70 })).toMatchObject({ updated: { amount: -70 } });
    expect(await confirm("delete_bill", { id: bill.created.id })).toContain("Verizon ($70.00 monthly)");
    await call("delete_bill", { id: bill.created.id });
    expect(await run((s) => listRecurring(s))).toHaveLength(0);

    const h = (await call("create_habit", { title: "Save $10 each payday", kind: "save", cadence: "payday", target: 10 })) as { created: { id: string } };
    expect(await call("check_habit", { id: h.created.id })).toMatchObject({ habit: { streak: 1, doneThisPeriod: true } });
    expect(await call("list_habits", {})).toMatchObject({ habits: [{ title: "Save $10 each payday", streak: 1 }] });
  });
});
