import "dotenv/config";
import { eq } from "drizzle-orm";
import { addDaysStr, todayIn } from "../../src/lib/dates";
import { closeDb, getDb } from "../../src/server/db/client";
import { users } from "../../src/server/db/schema";
import { withUser } from "../../src/server/db/with-user";
import { createManualAccount } from "../../src/server/services/finance/accounts";
import { createTransaction } from "../../src/server/services/finance/transactions";
import { createAssignment, createCourse } from "../../src/server/services/school";
import { createEmployer, createShift } from "../../src/server/services/work";

/**
 * Made-up data for student-asks-phone.spec.ts (a TEST account only): a checking account with $642, four regular monthly
 * charges that only the bank shows (nothing tracked), a night job with shifts the next days, and a class with work due.
 * Usage: npx tsx --conditions=react-server tests/e2e/seed-student-asks.ts <email>
 */
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email?.endsWith("@example.com")) throw new Error("Only an @example.com test account can be seeded.");
  const [u] = await getDb().select().from(users).where(eq(users.email, email));
  if (!u) throw new Error(`No account ${email}`);
  const tz = u.timezone;
  const today = todayIn(tz);
  await withUser(u.id, async (s) => {
    const checking = await createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 64_200 });
    const charges: [string, number][] = [
      ["Verizon Wireless", -4500],
      ["SafeRoute Insurance", -15400],
      ["Netflix", -799],
      ["Parkview Apartments Rent", -60000],
    ];
    for (const [i, [name, cents]] of charges.entries())
      for (const back of [15 + i, 45 + i, 75 + i])
        await createTransaction(s, {
          accountId: checking.id,
          date: addDaysStr(today, -back),
          description: name.toUpperCase(),
          merchantName: name,
          amountCents: cents,
        });
    const job = await createEmployer(s, { name: "Valley Fulfillment", hourlyRateCents: 1700 });
    for (const day of [1, 3, 5]) await createShift(s, tz, { employerId: job.id, date: addDaysStr(today, day), startTime: "22:00", endTime: "06:30" });
    // a shift past the week, which the front must not list
    await createShift(s, tz, { employerId: job.id, date: addDaysStr(today, 12), startTime: "22:00", endTime: "06:30" });
    const bio = await createCourse(s, { name: "Human Anatomy", code: "BIO 105" });
    const eng = await createCourse(s, { name: "College Composition", code: "ENG 101" });
    await createAssignment(s, tz, { courseId: bio.id, title: "Chapter quiz 13", dueDate: addDaysStr(today, 2), dueTime: "23:59" });
    await createAssignment(s, tz, { courseId: eng.id, title: "Discussion post 13", dueDate: addDaysStr(today, 3), dueTime: "23:59" });
  });
  console.log(`Seeded ${email}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
