/**
 * Local look at the day clock: gives one existing account (by email) a made-up student week around the real
 * "now", through the app's own services. For screenshots on a local or e2e database only; it refuses to run
 * against anything that isn't localhost.
 *
 *   DATABASE_URL=postgresql://…@localhost:5432/budgetflow_e2e npx tsx scripts/dev/seed-clock-look.ts e2e-…@example.com
 */
import { eq } from "drizzle-orm";
import { addDaysStr, localToInstant, todayIn } from "@/lib/dates";
import { closeDb, getDb } from "@/server/db/client";
import { financialAccounts, transactions, users } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { createEvent } from "@/server/services/calendar";
import { createManualAccount } from "@/server/services/finance/accounts";
import { createGoal, createRecurring } from "@/server/services/finance/planning";
import { updateSubscription } from "@/server/services/finance/subscriptions";
import { createTransaction } from "@/server/services/finance/transactions";
import { createMilestone } from "@/server/services/milestones";
import { createPersonalGoal } from "@/server/services/personal-goals";
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
    await createTask(s, TZ, { title: "Return library book", dueDate: d(-5), priority: "medium" });
    // the long line: a life behind, plans and goals ahead, and something with no day yet
    await createMilestone(s, { title: "🎂 Born", when: "2006-03-14" });
    await createMilestone(s, { title: "🎓 Started college", when: "2024-08-26" });
    await createMilestone(s, { title: "💼 First job at Campus Coffee", when: "2025-09-02" });
    await createEvent(s, TZ, { title: "✈️ Flight home for winter break", date: d(21), startTime: "07:10", endTime: "10:05", kind: "personal" });
    await createPersonalGoal(s, { title: "🏃 Run a half marathon", targetDate: d(150) });
    await createTask(s, TZ, { title: "📞 Call the bank about the card", priority: "medium" });
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
  if (process.argv.includes("--busy"))
    // A full life on top: a pile of deadlines tonight, a reminder, a weekly lecture, money plans, a crowded day weeks out,
    // and a long to-do list with no days (to see that it all stays calm).
    await withUser(u.id, async (s) => {
      const eng = await createCourse(s, { name: "English Composition", code: "ENG 102" });
      for (const title of ["Essay draft", "Peer review", "Discussion post"])
        await createAssignment(s, TZ, { courseId: eng.id, title, dueDate: d(0), dueTime: "23:59" });
      for (const title of ["Final essay", "Portfolio", "Reflection"])
        await createAssignment(s, TZ, { courseId: eng.id, title, dueDate: d(25), dueTime: "23:59" });
      await createEvent(s, TZ, {
        title: "ENG lecture",
        date: d(-7),
        startTime: "10:00",
        endTime: "11:15",
        kind: "class",
        courseId: eng.id,
        recurrence: { freq: "weekly" },
      });
      await createTask(s, TZ, { title: "Lab write-up", dueDate: d(2), dueTime: "17:00", reminder: "1d", priority: "high" });
      const sub = await createRecurring(s, { name: "Streamly", amountCents: -1599, frequency: "monthly", nextDueDate: d(11), kind: "subscription" });
      await updateSubscription(s, sub.id, { trialEndsOn: d(10) });
      await createRecurring(s, { name: "Rent", amountCents: -90000, frequency: "monthly", nextDueDate: d(5), kind: "bill" });
      await createGoal(s, { name: "Spring break trip", targetCents: 80000, savedCents: 20000, targetDate: d(90) });
      // purchases on the line (owner, 2026-11-12): some with the bank's own time (a mark each), some without (in the day's total)
      const [bank] = await s.tx.select({ id: financialAccounts.id }).from(financialAccounts).where(eq(financialAccounts.userId, s.userId));
      for (const [description, amountCents, day, time] of [
        ["Blue Bottle Coffee", -650, -1, "08:15"],
        ["Chipotle", -1285, -1, "12:40"],
        ["Campus bookstore", -3499, -1, null],
        ["Trader Joe's", -4210, -2, "19:30"],
        ["Spotify", -1199, -2, null],
      ] as const) {
        const t = await createTransaction(s, {
          accountId: bank.id,
          date: d(day),
          description,
          merchantName: description,
          amountCents,
          kind: "expense",
          categoryId: null,
          pending: false,
        });
        if (time)
          await s.tx
            .update(transactions)
            .set({ authorizedAt: localToInstant(d(day), time, TZ) })
            .where(eq(transactions.id, t.id));
      }
      for (const title of [
        "Email advisor",
        "Buy a desk lamp",
        "Cancel old gym",
        "Return jacket",
        "Book a haircut",
        "Fix bike tire",
        "Print résumé",
        "Call grandma",
        "Sell old textbooks",
        "Update LinkedIn",
      ])
        await createTask(s, TZ, { title, priority: "medium" });
    });
  console.log(`Seeded a week around ${today} for ${email}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
