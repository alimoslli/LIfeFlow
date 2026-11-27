/**
 * Seeds one made-up person into the studio's own local database (never production) for filming the real app.
 * Run from the app checkout so the app's own services and "@/..." paths resolve:
 *   cd marketing/studio/.app && npx tsx ../demo/seed-profile.ts ../demo/profiles/<name>.json
 * Every account is account_kind "demo" and every record source "demo", the same rules as the app's seed-demo.ts.
 * It refuses to run unless DATABASE_URL points at a database named budgetflow_studio.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { and, eq, sql } from "drizzle-orm";

type Profile = {
  email: string;
  name: string;
  tz: string;
  skyling?: "dawn" | "ray" | "goldie" | "star" | "moon" | "sky";
  skylingName?: string;
  birthDate?: string;
  accounts?: { key: string; name: string; type: "depository" | "credit" | "investment"; subtype?: string; institution: string; mask?: string; balance: number; limit?: number }[];
  transactions?: { account: string; daysAgo: number; desc: string; merchant?: string; amount: number; category: string; kind?: "income" | "expense" | "transfer" | "refund" }[];
  bills?: { name: string; amount: number; inDays: number; frequency?: "monthly" | "weekly" | "biweekly"; kind?: "bill" | "subscription" | "income"; category: string }[];
  goals?: { name: string; target: number; saved?: number; inDays?: number }[];
  events?: { title: string; day: number; start?: string; end?: string; location?: string; kind?: "class" | "appointment" | "other" | "meeting" }[];
  tasks?: { title: string; day?: number; priority?: "low" | "medium" | "high" | "urgent"; done?: boolean }[];
  shifts?: { employer: string; position?: string; rate?: number; day: number; start: string; end: string }[];
};

const db_url = process.env.DATABASE_URL ?? "";
if (!/\/budgetflow_studio(\?|$)/.test(db_url)) throw new Error("Refusing: DATABASE_URL must be the studio's own database (budgetflow_studio).");
const file = process.argv[2];
if (!file) throw new Error("Usage: npx tsx ../demo/seed-profile.ts <profile.json>");
const P = JSON.parse(readFileSync(resolve(file), "utf8")) as Profile;
const SRC = join(process.cwd(), "src");
const imp = (p: string) => import(join(SRC, p));

async function main() {
  const { addDaysStr, todayIn } = await imp("lib/dates.ts");
  const { closeDb, getDb } = await imp("server/db/client.ts");
  const { users } = await imp("server/db/schema.ts");
  const { withUser } = await imp("server/db/with-user.ts");
  const { registerUser } = await imp("server/services/accounts.ts");
  const { createEvent } = await imp("server/services/calendar.ts");
  const { createManualAccount } = await imp("server/services/finance/accounts.ts");
  const { getCategoryByName } = await imp("server/services/finance/categories.ts");
  const { createGoal, createRecurring } = await imp("server/services/finance/planning.ts");
  const { createTransaction } = await imp("server/services/finance/transactions.ts");
  const { createTask, updateTask } = await imp("server/services/tasks.ts");
  const { createEmployer, createShift } = await imp("server/services/work.ts");

  const db = getDb();
  const email = P.email.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    if (existing.accountKind !== "demo") throw new Error(`${email} exists and is not a demo account; refusing.`);
    await db.delete(users).where(and(eq(users.id, existing.id), eq(users.accountKind, "demo")));
  }
  const user = await registerUser(db, { name: P.name, email, password: "studio-demo-only", timezone: P.tz }, { accountKind: "demo" });
  const prefs: Record<string, unknown> = { birthDate: P.birthDate ?? "2003-03-03", onboarding: "done", tour: "done" };
  if (P.skyling) prefs.companion = P.skyling;
  if (P.skylingName) prefs.assistantName = P.skylingName;
  await db.update(users).set({ preferences: sql`${users.preferences} || ${JSON.stringify(prefs)}::jsonb` }).where(eq(users.id, user.id));
  const today: string = todayIn(P.tz);
  const cents = (d: number) => Math.round(d * 100);

  await withUser(user.id, async (s: any) => {
    const acct: Record<string, string> = {};
    for (const a of P.accounts ?? []) {
      const row = await createManualAccount(
        s,
        { name: a.name, type: a.type, subtype: a.subtype, institutionName: a.institution, mask: a.mask, currentBalanceCents: cents(a.balance), creditLimitCents: a.limit ? cents(a.limit) : undefined },
        "demo",
      );
      acct[a.key] = row.id;
    }
    const cat = async (n: string) => {
      const c = await getCategoryByName(s, n);
      if (!c) throw new Error(`No category "${n}" in the app`);
      return c.id;
    };
    for (const t of P.transactions ?? [])
      await createTransaction(
        s,
        { accountId: acct[t.account], date: addDaysStr(today, -t.daysAgo), description: t.desc, amountCents: cents(t.amount), categoryId: await cat(t.category), merchantName: t.merchant, kind: t.kind },
        "demo",
      );
    for (const b of P.bills ?? [])
      await createRecurring(s, { name: b.name, amountCents: cents(b.amount), frequency: b.frequency ?? "monthly", nextDueDate: addDaysStr(today, b.inDays), kind: b.kind ?? "bill", categoryId: await cat(b.category) }, "demo");
    for (const g of P.goals ?? []) await createGoal(s, { name: g.name, targetCents: cents(g.target), savedCents: g.saved ? cents(g.saved) : undefined, targetDate: g.inDays ? addDaysStr(today, g.inDays) : undefined });
    for (const e of P.events ?? [])
      await createEvent(s, P.tz, { title: e.title, kind: e.kind ?? "other", date: addDaysStr(today, e.day), startTime: e.start, endTime: e.end, location: e.location }, "demo");
    const employers: Record<string, string> = {};
    for (const sh of P.shifts ?? []) {
      employers[sh.employer] ??= (await createEmployer(s, { name: sh.employer, position: sh.position, payType: "hourly", hourlyRateCents: cents(sh.rate ?? 18) }, "demo")).id;
      await createShift(s, P.tz, { employerId: employers[sh.employer], date: addDaysStr(today, sh.day), startTime: sh.start, endTime: sh.end, breakMinutes: 0 }, "demo");
    }
    for (const t of P.tasks ?? []) {
      const row = await createTask(s, P.tz, { title: t.title, priority: t.priority ?? "medium", dueDate: t.day === undefined ? undefined : addDaysStr(today, t.day) }, "demo");
      if (t.done) await updateTask(s, P.tz, row.id, { status: "done" });
    }
  });
  console.log(`Seeded ${email} (${P.name}) for ${today} in ${P.tz}`);
  await closeDb();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
