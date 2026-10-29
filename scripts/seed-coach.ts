import "dotenv/config";
import { eq } from "drizzle-orm";
import { addDaysStr, todayIn, weekStart } from "../src/lib/dates";
import { closeDb, getDb } from "../src/server/db/client";
import { users } from "../src/server/db/schema";
import { withUser } from "../src/server/db/with-user";
import { createManualAccount } from "../src/server/services/finance/accounts";
import { getCategoryByName } from "../src/server/services/finance/categories";
import { contributeToGoal } from "../src/server/services/finance/goals";
import { createGoal, createRecurring, setBudget } from "../src/server/services/finance/planning";
import { updateSubscription } from "../src/server/services/finance/subscriptions";
import { createTransaction } from "../src/server/services/finance/transactions";
import { createHabit } from "../src/server/services/habits";
import { runProactive } from "../src/server/services/proactive/engine";
import { createAssignment, createCourse } from "../src/server/services/school";
import { createTask } from "../src/server/services/tasks";
import { createEmployer, createShift } from "../src/server/services/work";

/**
 * Realistic coaching data for one TEST account, then runs every proactive
 * trigger so Jarvis has something to say. Usage: npx tsx scripts/seed-coach.ts <email>
 * Refuses anything that isn't an @example.com or demo account, so it can never
 * mix sample records into a real user's data.
 */
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Usage: seed-coach.ts <email>");
  const [u] = await getDb().select().from(users).where(eq(users.email, email));
  if (!u) throw new Error(`No account ${email}`);
  if (!email.endsWith("@example.com") && u.accountKind !== "demo") throw new Error("Only test (@example.com) or demo accounts can be seeded.");
  const tz = u.timezone;
  const today = todayIn(tz);
  const wk = weekStart(today);

  await withUser(u.id, async (s) => {
    const cat = async (n: string) => (await getCategoryByName(s, n))!.id;
    const checking = await createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 61_000 });
    await createManualAccount(s, { name: "Savings", type: "depository", subtype: "savings", currentBalanceCents: 90_000 });
    const tx = (date: string, description: string, merchantName: string, amountCents: number, categoryId?: string) =>
      createTransaction(s, { accountId: checking.id, date, description, merchantName, amountCents, categoryId });

    // Subscriptions: Netflix went up from $15.49 to $17.99; Hulu doubles up on video; Spotify steady.
    const groceries = await cat("Groceries");
    const fun = await cat("Entertainment");
    for (let m = 4; m >= 1; m--) {
      const d = addDaysStr(today, -30 * m + 3);
      await tx(d, "NETFLIX.COM", "Netflix", m === 1 ? -1799 : -1549, fun);
      await tx(addDaysStr(d, 2), "Spotify USA", "Spotify", -1199, fun);
      await tx(addDaysStr(d, 4), "HULU 877-8244858", "Hulu", -799, fun);
      await tx(addDaysStr(d, 6), "VERIZON WIRELESS", "Verizon", -8500);
    }
    for (const [name, amountCents, next] of [
      ["Netflix", -1799, addDaysStr(today, 3)],
      ["Spotify", -1199, addDaysStr(today, 5)],
      ["Hulu", -799, addDaysStr(today, 7)],
    ] as const)
      await createRecurring(s, { name, amountCents, frequency: "monthly", nextDueDate: next, kind: "subscription", categoryId: fun });
    const trial = await createRecurring(s, {
      name: "Paramount+",
      amountCents: -1299,
      frequency: "monthly",
      nextDueDate: addDaysStr(today, 4),
      kind: "subscription",
    });
    await updateSubscription(s, trial.id, { trialEndsOn: addDaysStr(today, 3) });
    await createRecurring(s, { name: "Verizon", amountCents: -8500, frequency: "monthly", nextDueDate: addDaysStr(today, 9), kind: "bill" });
    // Rent due in 2 days and checking can't fully cover it.
    await createRecurring(s, { name: "Rent", amountCents: -72_500, frequency: "monthly", nextDueDate: addDaysStr(today, 2), kind: "bill" });

    // Groceries: about $40 a week, $110 this week.
    for (let w = 1; w <= 8; w++) await tx(addDaysStr(wk, -7 * w), "KROGER #412", "Kroger", -4000, groceries);
    await tx(wk, "KROGER #412", "Kroger", -11_000, groceries);
    await setBudget(s, { month: today, categoryId: groceries, limitCents: 30_000 });
    await setBudget(s, { month: today, categoryId: fun, limitCents: 25_000 });

    // A goal just past halfway.
    const goal = await createGoal(s, { name: "Paris trip", targetCents: 200_000, targetDate: addDaysStr(today, 180), purpose: "travel" });
    await contributeToGoal(s, { goalId: goal.id, amountCents: 105_000, date: today });

    // To-dos: two late, one today.
    await createTask(s, tz, { title: "Email advisor about spring classes", dueDate: addDaysStr(today, -2) });
    await createTask(s, tz, { title: "Return library books", dueDate: addDaysStr(today, -1) });
    await createTask(s, tz, { title: "Pick up prescription", dueDate: today });

    // An essay due the day after a late shift.
    const course = await createCourse(s, { name: "English Composition", code: "ENGL 101" });
    await createAssignment(s, tz, { courseId: course.id, title: "Argument essay", dueDate: addDaysStr(today, 3), dueTime: "23:59" });
    const job = await createEmployer(s, { name: "Campus Library", hourlyRateCents: 1600 });
    await createShift(s, tz, { employerId: job.id, date: addDaysStr(today, 2), startTime: "17:00", endTime: "22:00" });

    await createHabit(s, { title: "No-spend weekend", kind: "no_spend", cadence: "weekends" });
  });

  // Let Jarvis look at all of it, as the slots and events would through the day.
  const prefs = { ...u.preferences, jarvis: { ...u.preferences?.jarvis, frequency: "high" as const } };
  let saved = 0;
  for (const trigger of ["transaction", "midday", "morning", "evening", "shift"] as const)
    saved += (await withUser(u.id, (s) => runProactive({ scope: s, tz, prefs, trigger }))).length;
  console.log(`Seeded coaching data for ${email}; Jarvis has ${saved} messages.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
