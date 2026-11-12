/**
 * A day for seeing what the sky says on its own (docs/backlog/2026-11-12-useful-sky.md): pictures for the owner and the
 * e2e spec `useful-sky-phone.spec.ts`. The server reads the real clock, so the account's time zone is picked to put "now"
 * at the hour the scene needs (a fixed-offset zone), and everything is made in that zone.
 *
 *   npx tsx --conditions=react-server scripts/dev/seed-useful-sky.ts <email> <gap|tonight|storm>
 *
 * gap: 9-something in the morning; a class at 10, work at 1, a lab report due tomorrow (a free gap with Block it).
 * tonight: 5-something in the evening; work 6 to 9, an essay due tomorrow morning (Tonight's free hours).
 * storm: 5-something in the evening; work until 11, the essay due at 11:30 tonight (no free time before it).
 * Every scene adds a bank with purchases yesterday, some with the bank's own time (marks on the line) and some without.
 * Only runs against a local database.
 */
import { eq } from "drizzle-orm";
import { addDaysStr, localToInstant, todayIn } from "@/lib/dates";
import { closeDb, getDb } from "@/server/db/client";
import { transactions, users } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { createEvent } from "@/server/services/calendar";
import { createManualAccount } from "@/server/services/finance/accounts";
import { createTransaction } from "@/server/services/finance/transactions";
import { createAssignment, createCourse } from "@/server/services/school";
import { createEmployer, createShift } from "@/server/services/work";

const SCENES = { gap: 9, tonight: 17, storm: 17 } as const;

/** A fixed-offset zone where the local hour is `hour` right now (Etc/GMT signs are reversed). */
export function zoneAt(hour: number, now = new Date()) {
  let h = (((hour - now.getUTCHours()) % 24) + 24) % 24;
  if (h > 14) h -= 24;
  return h === 0 ? "Etc/UTC" : h > 0 ? `Etc/GMT-${h}` : `Etc/GMT+${-h}`;
}

async function main() {
  const [email, scene] = process.argv.slice(2) as [string, keyof typeof SCENES];
  const url = process.env.DATABASE_URL ?? "";
  if (!email || !(scene in SCENES)) throw new Error("Usage: seed-useful-sky.ts <email> <gap|tonight|storm>");
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("Refusing: this only runs against a local database.");
  const tz = zoneAt(SCENES[scene]);
  const [u] = await getDb().update(users).set({ timezone: tz }).where(eq(users.email, email)).returning({ id: users.id });
  if (!u) throw new Error(`No account ${email}`);
  const today = todayIn(tz);
  const d = (n: number) => addDaysStr(today, n);
  await withUser(u.id, async (s) => {
    const job = await createEmployer(s, { name: "Campus Coffee", position: "Barista", hourlyRateCents: 1500 });
    const bio = await createCourse(s, { name: "Biology", code: "BIO 101" });
    const eng = await createCourse(s, { name: "English Composition", code: "ENG 102" });
    if (scene === "gap") {
      await createEvent(s, tz, { title: "BIO 101", date: d(0), startTime: "10:00", endTime: "11:00", kind: "class", courseId: bio.id });
      await createShift(s, tz, { employerId: job.id, date: d(0), startTime: "13:00", endTime: "17:00" });
      await createAssignment(s, tz, { courseId: bio.id, title: "Lab report", dueDate: d(1), dueTime: "23:59" });
    } else if (scene === "tonight") {
      await createShift(s, tz, { employerId: job.id, date: d(0), startTime: "18:00", endTime: "21:00" });
      await createAssignment(s, tz, { courseId: eng.id, title: "Essay draft", dueDate: d(1), dueTime: "09:00" });
    } else {
      await createShift(s, tz, { employerId: job.id, date: d(0), startTime: "17:00", endTime: "23:00" });
      await createAssignment(s, tz, { courseId: eng.id, title: "Essay draft", dueDate: d(0), dueTime: "23:30" });
    }
    const bank = await createManualAccount(s, {
      name: "Everyday Checking",
      type: "depository",
      subtype: "checking",
      institutionName: "Chase",
      currentBalanceCents: 84217,
    });
    for (const [description, amountCents, time] of [
      ["Blue Bottle Coffee", -650, "08:15"],
      ["Chipotle", -1285, "12:40"],
      ["Campus bookstore", -3499, null],
      ["Trader Joe's", -4210, "19:30"],
    ] as const) {
      const t = await createTransaction(s, {
        accountId: bank.id,
        date: d(-1),
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
          .set({ authorizedAt: localToInstant(d(-1), time, tz) })
          .where(eq(transactions.id, t.id));
    }
  });
  console.log(`Seeded the ${scene} scene in ${tz} for ${email}`);
}

if (process.argv[1]?.endsWith("seed-useful-sky.ts"))
  main()
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
