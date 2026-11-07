import type { SessionUser } from "@/server/auth/sessions";
import { createConversation } from "@/server/jarvis/conversations";
import { createEvent } from "@/server/services/calendar";
import { createManualAccount } from "@/server/services/finance/accounts";
import { listCategories } from "@/server/services/finance/categories";
import { createGoal } from "@/server/services/finance/planning";
import { createTransaction } from "@/server/services/finance/transactions";
import { createAssignment, createCourse } from "@/server/services/school";
import { createTask } from "@/server/services/tasks";
import { createEmployer, createShift } from "@/server/services/work";
import { makeUser, TZ } from "../helpers";
import { EVAL_P2P } from "./jarvis-eval";
import { txns } from "./student-bank";

/**
 * Seeds the eval student (Maya Chen, Monday Nov 2 2026; see jarvis-eval.ts) into the current database.
 * Shared by tests/integration/jarvis-eval.test.ts and scripts/compare-models.ts.
 */
export async function seedEvalStudent() {
  const u = await makeUser("Maya Chen");
  const session: SessionUser = { id: u.user.id, email: u.user.email, name: u.user.name, timezone: TZ, accountKind: "standard" };
  const conversationId = await u.run(async (s) => {
    const account = await createManualAccount(s, {
      name: "Everyday Checking",
      type: "depository",
      subtype: "checking",
      institutionName: "Chase",
      currentBalanceCents: 84217,
    });
    const cats = new Map((await listCategories(s)).map((c) => [c.name.toLowerCase(), c.id]));
    for (const t of txns) {
      const categoryId = t.categoryName ? cats.get(t.categoryName.toLowerCase()) : undefined;
      await createTransaction(s, {
        accountId: account.id,
        date: t.date,
        description: t.description,
        merchantName: t.merchantName,
        amountCents: t.amountCents,
        kind: t.kind,
        categoryId: categoryId ?? null,
        pending: t.pending ?? false,
      });
    }

    for (const t of EVAL_P2P) await createTransaction(s, { accountId: account.id, ...t, kind: "expense", categoryId: null });

    const bio = await createCourse(s, { name: "Intro to Biology", code: "BIO 110" });
    const eng = await createCourse(s, { name: "Composition II", code: "ENG 102" });
    const mwf = { freq: "weekly" as const, byDay: [1, 3, 5], until: "2026-12-11" };
    await createEvent(s, TZ, { title: "BIO 110", date: "2026-08-24", startTime: "10:00", endTime: "10:50", kind: "class", courseId: bio.id, recurrence: mwf });
    await createEvent(s, TZ, {
      title: "ENG 102",
      date: "2026-08-25",
      startTime: "13:00",
      endTime: "14:15",
      kind: "class",
      courseId: eng.id,
      recurrence: { freq: "weekly", byDay: [2, 4], until: "2026-12-11" },
    });
    await createAssignment(s, TZ, { courseId: bio.id, title: "Exam 2", kind: "exam", dueDate: "2026-11-05", dueTime: "10:00" });
    await createAssignment(s, TZ, { courseId: eng.id, title: "Argument essay draft", dueDate: "2026-11-04", dueTime: "23:59" });
    await createAssignment(s, TZ, { courseId: bio.id, title: "Lab report 7", kind: "lab", dueDate: "2026-11-13", dueTime: "23:59" });

    const job = await createEmployer(s, { name: "Campus Coffee", position: "Barista", hourlyRateCents: 1500 });
    await createShift(s, TZ, { employerId: job.id, date: "2026-11-02", startTime: "16:00", endTime: "21:00" });
    await createShift(s, TZ, { employerId: job.id, date: "2026-11-04", startTime: "17:00", endTime: "22:00" });
    await createShift(s, TZ, { employerId: job.id, date: "2026-11-07", startTime: "09:00", endTime: "15:00", breakMinutes: 30 });

    await createGoal(s, { name: "Emergency fund", targetCents: 100000, savedCents: 35000, targetDate: "2026-12-31", purpose: "emergency" });
    await createTask(s, TZ, { title: "Return library books", dueDate: "2026-11-02", priority: "medium" });
    return (await createConversation(s, null, "Eval")).id;
  });
  return { session, conversationId, run: u.run };
}
