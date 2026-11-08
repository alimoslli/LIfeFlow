/**
 * Local look at the day clock: gives one existing account (by email) a made-up student week around the real
 * "now", through the app's own services. For screenshots on a local or e2e database only; it refuses to run
 * against anything that isn't localhost.
 *
 *   DATABASE_URL=postgresql://…@localhost:5432/budgetflow_e2e npx tsx scripts/dev/seed-clock-look.ts e2e-…@example.com
 */
import { eq } from "drizzle-orm";
import { addDaysStr, todayIn } from "@/lib/dates";
import { closeDb, getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { createEvent } from "@/server/services/calendar";
import { createManualAccount } from "@/server/services/finance/accounts";
import { createTransaction } from "@/server/services/finance/transactions";
import { logHealth } from "@/server/services/health";
import { createAssignment, createCourse } from "@/server/services/school";
import { createTask } from "@/server/services/tasks";
import { createEmployer, createShift } from "@/server/services/work";

const TZ = "America/New_York";

async function main() {
  const email = process.argv[2];
  const url = process.env.DATABASE_URL ?? "";
  if (!email) throw new Error("Usage: seed-clock-look.ts <email>");
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("Refusing: this only runs against a local database.");
  const [u] = await getDb().update(users).set({ timezone: TZ }).where(eq(users.email, email)).returning({ id: users.id });
  if (!u) throw new Error(`No account ${email}`);
  const today = todayIn(TZ);
  const d = (n: number) => addDaysStr(today, n);
  if (process.argv.includes("--sparse")) {
    // A quiet evening: a class earlier today, a deadline tomorrow, an exam in two days; nothing measured, no bank.
    await withUser(u.id, async (s) => {
      const psy = await createCourse(s, { name: "Intro to Psychology", code: "PSY 101" });
      await createEvent(s, TZ, { title: "PSY 101", date: d(0), startTime: "13:00", endTime: "14:15", kind: "class", courseId: psy.id });
      await createAssignment(s, TZ, { courseId: psy.id, title: "Reading response", dueDate: d(1), dueTime: "23:59" });
      await createAssignment(s, TZ, { courseId: psy.id, title: "Midterm", kind: "exam", dueDate: d(2), dueTime: "10:00" });
    });
    console.log(`Seeded a quiet week around ${today} for ${email}`);
    return;
  }
  await withUser(u.id, async (s) => {
    const job = await createEmployer(s, { name: "Campus Coffee", position: "Barista", hourlyRateCents: 1500 });
    await createShift(s, TZ, { employerId: job.id, date: d(-2), startTime: "11:00", endTime: "17:30" });
    await createShift(s, TZ, { employerId: job.id, date: d(0), startTime: "09:00", endTime: "16:30" });
    await createShift(s, TZ, { employerId: job.id, date: d(2), startTime: "13:00", endTime: "18:00" });
    const chem = await createCourse(s, { name: "General Chemistry", code: "CHEM 101" });
    await createEvent(s, TZ, { title: "Class", date: d(0), startTime: "18:00", endTime: "20:00", kind: "class", courseId: chem.id }, "google");
    await createEvent(s, TZ, { title: "Study for exam", date: d(0), startTime: "20:30", endTime: "22:00", kind: "study" });
    await createEvent(s, TZ, { title: "Run with Sam", date: d(1), startTime: "08:00", endTime: "08:45", kind: "personal" }, "google");
    await createEvent(s, TZ, { title: "Brunch with Jordan", date: d(1), startTime: "11:30", endTime: "13:00", kind: "personal" }, "google");
    await createEvent(s, TZ, { title: "Dentist", date: d(-2), startTime: "09:30", endTime: "10:15", kind: "appointment" }, "google");
    await createEvent(s, TZ, { title: "Chem lab", date: d(-3), startTime: "10:00", endTime: "11:50", kind: "class", courseId: chem.id }, "google");
    await createAssignment(s, TZ, { courseId: chem.id, title: "Exam 2", kind: "exam", dueDate: d(2), dueTime: "10:00" });
    await createAssignment(s, TZ, { courseId: chem.id, title: "Lab report", dueDate: d(3), dueTime: "23:59" });
    await createTask(s, TZ, { title: "Pay phone bill", dueDate: d(3), dueTime: "09:00", priority: "high" });
    await logHealth(s, TZ, { metric: "steps", value: 6240, date: today });
    await logHealth(s, TZ, { metric: "sleep_hours", value: 7.3, date: today });
    const bank = await createManualAccount(s, {
      name: "Everyday Checking",
      type: "depository",
      subtype: "checking",
      institutionName: "Chase",
      currentBalanceCents: 84217,
    });
    for (const [description, amountCents] of [
      ["Lunch at work", -1420],
      ["Shell gas", -5500],
    ] as const)
      await createTransaction(s, {
        accountId: bank.id,
        date: today,
        description,
        merchantName: description,
        amountCents,
        kind: "expense",
        categoryId: null,
        pending: false,
      });
  });
  console.log(`Seeded a week around ${today} for ${email}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
