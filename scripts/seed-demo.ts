/**
 * Creates (or recreates) an isolated DEMO account filled with sample data.
 * Every record is marked source = "demo" and the account is flagged
 * account_kind = "demo", so sample data never mixes with a real user's data.
 *
 *   npm run db:seed-demo           # local/dev only
 *   DEMO_PASSWORD=... npm run db:seed-demo
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { addDaysStr, todayIn, weekStart } from "../src/lib/dates";
import { closeDb, getDb } from "../src/server/db/client";
import { users } from "../src/server/db/schema";
import { withUser, type UserScope } from "../src/server/db/with-user";
import { registerUser } from "../src/server/services/accounts";
import { createEvent } from "../src/server/services/calendar";
import { createManualAccount } from "../src/server/services/finance/accounts";
import { getCategoryByName } from "../src/server/services/finance/categories";
import { nextOccurrence } from "../src/server/services/finance/recurring-detect";
import { createGoal, createRecurring, setBudget } from "../src/server/services/finance/planning";
import { createTransaction } from "../src/server/services/finance/transactions";
import { addManualHolding } from "../src/server/services/finance/wealth";
import { createMemory } from "../src/server/services/memory";
import { createNote, createProject } from "../src/server/services/notes";
import { addMaterial, createAssignment, createCourse, updateAssignment } from "../src/server/services/school";
import { createTask, updateTask } from "../src/server/services/tasks";
import { addPaycheck, createEmployer, createShift, recordShiftHours } from "../src/server/services/work";
import { holdings } from "../src/server/db/schema";

const EMAIL = (process.env.DEMO_EMAIL ?? "demo@budgetflow.local").toLowerCase();
const PASSWORD = process.env.DEMO_PASSWORD ?? "budgetflow-demo";
const TZ = "America/New_York";

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const between = (a: number, b: number) => Math.round(a + rand() * (b - a));

/**
 * Modes:
 *   (default)     recreate the demo account (local development)
 *   --from-env    used by the Vercel build. Reads SEED_TEST_ACCOUNT:
 *                   unset    -> do nothing
 *                   "keep"   -> create the account only if it doesn't exist (keeps its data across deploys)
 *                   "refresh"-> delete and recreate it with fresh, current-dated data
 */
async function main() {
  const fromEnv = process.argv.includes("--from-env");
  const mode = fromEnv ? process.env.SEED_TEST_ACCOUNT : "refresh";
  if (fromEnv && !mode) return;
  if (mode !== "keep" && mode !== "refresh") throw new Error(`SEED_TEST_ACCOUNT must be "keep" or "refresh", got "${mode}"`);
  const prod = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  if (prod && !fromEnv && !process.argv.includes("--force")) {
    throw new Error("Refusing to seed demo data in production (use SEED_TEST_ACCOUNT on Vercel, or pass --force).");
  }
  if ((prod || fromEnv) && (!process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 10)) {
    throw new Error("Set DEMO_PASSWORD (10+ characters) to create the test account outside local development.");
  }
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, EMAIL));
  if (existing) {
    if (existing.accountKind !== "demo") throw new Error(`${EMAIL} exists and is not a demo account; refusing to touch it.`);
    if (mode === "keep") {
      console.log(`Test account ${EMAIL} already exists; keeping its data.`);
      return;
    }
    await db.delete(users).where(and(eq(users.id, existing.id), eq(users.accountKind, "demo")));
  }
  const user = await registerUser(db, { name: "Alex Demo", email: EMAIL, password: PASSWORD, timezone: TZ }, { accountKind: "demo" });
  const today = todayIn(TZ);
  await withUser(user.id, (s) => seedAll(s, today));
  console.log(`Test account ready: ${EMAIL}${fromEnv ? "" : ` / ${PASSWORD}`}`);
}

async function seedAll(s: UserScope, today: string) {
  const cat = async (n: string) => (await getCategoryByName(s, n))!.id;

  // ---- accounts
  const checking = await createManualAccount(s, { name: "Everyday Checking", type: "depository", subtype: "checking", institutionName: "Demo Bank", mask: "4821", currentBalanceCents: 184_233 }, "demo");
  const savings = await createManualAccount(s, { name: "High-Yield Savings", type: "depository", subtype: "savings", institutionName: "Demo Bank", mask: "9012", currentBalanceCents: 412_000 }, "demo");
  const card = await createManualAccount(s, { name: "Student Rewards Card", type: "credit", institutionName: "Demo Card Co", mask: "3377", currentBalanceCents: 38_416, creditLimitCents: 150_000 }, "demo");
  const roth = await createManualAccount(s, { name: "Roth IRA", type: "investment", subtype: "Roth IRA", institutionName: "Demo Brokerage", currentBalanceCents: 623_510 }, "demo");
  const brokerage = await createManualAccount(s, { name: "Individual Brokerage", type: "investment", subtype: "brokerage", institutionName: "Demo Brokerage", currentBalanceCents: 248_890 }, "demo");
  await createManualAccount(s, { name: "Crypto", type: "investment", subtype: "crypto", institutionName: "Demo Brokerage", currentBalanceCents: 91_275 }, "demo");
  await addManualHolding(s, { accountId: roth.id, name: "Vanguard Total Stock Market ETF", symbol: "VTI", securityType: "etf", quantity: 18.5, valueCents: 523_510, costBasisCents: 440_000 });
  await addManualHolding(s, { accountId: roth.id, name: "Vanguard Total Bond Market ETF", symbol: "BND", securityType: "etf", quantity: 13.7, valueCents: 100_000, costBasisCents: 102_300 });
  await addManualHolding(s, { accountId: brokerage.id, name: "Apple Inc.", symbol: "AAPL", securityType: "equity", quantity: 6, valueCents: 148_890, costBasisCents: 120_500 });
  await addManualHolding(s, { accountId: brokerage.id, name: "S&P 500 Index Fund", symbol: "FXAIX", securityType: "mutual_fund", quantity: 4.9, valueCents: 100_000, costBasisCents: 91_000 });
  await s.tx.update(holdings).set({ source: "demo" }).where(eq(holdings.userId, s.userId));

  // ---- transactions: ~4 months
  const ids = {
    groceries: await cat("Groceries"),
    restaurants: await cat("Restaurants"),
    coffee: await cat("Coffee"),
    delivery: await cat("Food Delivery"),
    rent: await cat("Rent"),
    utilities: await cat("Utilities"),
    phone: await cat("Phone"),
    streaming: await cat("Streaming"),
    gas: await cat("Gas"),
    rideshare: await cat("Rideshare"),
    books: await cat("Books & Supplies"),
    clothing: await cat("Clothing"),
    paycheck: await cat("Paycheck"),
    savingsXfer: await cat("Savings Transfer"),
    ccPayment: await cat("Credit Card Payment"),
    food: await cat("Food & Dining"),
    transport: await cat("Transportation"),
    entertainment: await cat("Entertainment"),
  };
  const start = addDaysStr(today, -120);
  const tx = (accountId: string, date: string, description: string, amountCents: number, categoryId: string, extra: { kind?: "refund" | "transfer" | "income" | "expense"; merchantName?: string } = {}) =>
    createTransaction(s, { accountId, date, description, amountCents, categoryId, ...extra }, "demo");

  for (let d = start; d <= today; d = addDaysStr(d, 1)) {
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    const dom = Number(d.slice(8, 10));
    const late = d >= addDaysStr(today, -21); // spending creeps up recently
    if (dow === 6 || dow === 3) await tx(card.id, d, "TRADER JOE'S #552", -between(3800, 7600), ids.groceries, { merchantName: "Trader Joe's" });
    if (rand() < (late ? 0.55 : 0.32)) await tx(card.id, d, "STARBUCKS STORE 1123", -between(450, 780), ids.coffee, { merchantName: "Starbucks" });
    if (rand() < (late ? 0.35 : 0.18)) await tx(card.id, d, rand() < 0.5 ? "CHIPOTLE 2210" : "SWEETGREEN", -between(1100, 1900), ids.restaurants, { merchantName: rand() < 0.5 ? "Chipotle" : "Sweetgreen" });
    if (rand() < (late ? 0.22 : 0.08)) await tx(card.id, d, "DOORDASH*ORDER", -between(2200, 4200), ids.delivery, { merchantName: "DoorDash" });
    if (rand() < 0.07) await tx(card.id, d, "UBER *TRIP", -between(900, 2400), ids.rideshare, { merchantName: "Uber" });
    if (dow === 1 && rand() < 0.5) await tx(card.id, d, "SHELL OIL 5741", -between(3000, 4800), ids.gas, { merchantName: "Shell" });
    if (dom === 1) await tx(checking.id, d, "PARKVIEW APARTMENTS RENT", -95_000, ids.rent, { merchantName: "Parkview Apartments" });
    if (dom === 5) await tx(checking.id, d, "CITY UTILITIES", -between(6500, 9800), ids.utilities, { merchantName: "City Utilities" });
    if (dom === 12) await tx(card.id, d, "NETFLIX.COM", -1549, ids.streaming, { merchantName: "Netflix" });
    if (dom === 18) await tx(card.id, d, "SPOTIFY USA", -1199, ids.streaming, { merchantName: "Spotify" });
    if (dom === 21) await tx(checking.id, d, "MINT MOBILE", -3000, ids.phone, { merchantName: "Mint Mobile" });
    if (dom === 15) {
      await tx(checking.id, d, "Transfer to Savings", -25_000, ids.savingsXfer, { kind: "transfer" });
      await tx(savings.id, d, "Transfer from Checking", 25_000, ids.savingsXfer, { kind: "transfer" });
    }
    if (dom === 25) {
      await tx(checking.id, d, "CARD PAYMENT - THANK YOU", -60_000, ids.ccPayment, { kind: "transfer" });
      await tx(card.id, d, "PAYMENT RECEIVED", 60_000, ids.ccPayment, { kind: "transfer" });
    }
  }
  // Biweekly paychecks on Fridays
  for (let d = weekStart(start); d <= today; d = addDaysStr(d, 14)) {
    const fri = addDaysStr(d, 4);
    if (fri >= start && fri <= today) await tx(checking.id, fri, "CAMPUS LIBRARY PAYROLL", between(58_000, 66_000), ids.paycheck, { merchantName: "Campus Library", kind: "income" });
  }
  await tx(card.id, addDaysStr(today, -40), "TARGET", -6_499, await cat("Household"), { merchantName: "Target" });
  await tx(card.id, addDaysStr(today, -37), "TARGET RETURN", 2_999, await cat("Household"), { merchantName: "Target", kind: "refund" });
  await tx(card.id, addDaysStr(today, -9), "CAMPUS BOOKSTORE", -8_450, ids.books, { merchantName: "Campus Bookstore" });
  await tx(checking.id, addDaysStr(today, -1), "TRADER JOE'S #552", -4_120, ids.groceries, { merchantName: "Trader Joe's" }).then(async (row) => {
    if (row) await s.tx.execute(sql`update transactions set pending = true where id = ${row.id}`);
  });

  // ---- budgets, recurring, goals
  const month = `${today.slice(0, 7)}-01`;
  await setBudget(s, { month, categoryId: ids.food, limitCents: 45_000 });
  await setBudget(s, { month, categoryId: ids.transport, limitCents: 15_000 });
  await setBudget(s, { month, categoryId: ids.entertainment, limitCents: 5_000 });
  const nextDom = (dom: number) => {
    const d = `${today.slice(0, 7)}-${String(dom).padStart(2, "0")}`;
    return d >= today ? d : nextOccurrence(d, "monthly");
  };
  await createRecurring(s, { name: "Rent — Parkview Apartments", amountCents: -95_000, frequency: "monthly", nextDueDate: nextDom(1), kind: "bill", categoryId: ids.rent }, "demo");
  await createRecurring(s, { name: "Netflix", amountCents: -1549, frequency: "monthly", nextDueDate: nextDom(12), kind: "subscription", categoryId: ids.streaming }, "demo");
  await createRecurring(s, { name: "Mint Mobile", amountCents: -3000, frequency: "monthly", nextDueDate: nextDom(21), kind: "bill", categoryId: ids.phone }, "demo");
  await createRecurring(s, { name: "Campus Library paycheck", amountCents: 62_000, frequency: "biweekly", nextDueDate: addDaysStr(weekStart(today), 4 + (addDaysStr(weekStart(today), 4) < today ? 7 : 0)), kind: "income", categoryId: ids.paycheck }, "demo");
  await createGoal(s, { name: "Emergency fund", targetCents: 600_000, targetDate: addDaysStr(today, 240), accountId: savings.id });
  await createGoal(s, { name: "Summer trip to Montréal", targetCents: 120_000, savedCents: 35_000, targetDate: addDaysStr(today, 200) });

  // ---- school
  const psy = await createCourse(s, { name: "Introduction to Psychology", code: "PSY 101", term: "Fall 2026", instructorName: "Dr. Lena Ortiz", instructorEmail: "lortiz@university.example", meetingInfo: "Mon/Wed 10:00–11:15", location: "Hall B 204" }, "demo");
  const calc = await createCourse(s, { name: "Calculus II", code: "MATH 152", term: "Fall 2026", instructorName: "Prof. Sam Chen", meetingInfo: "Tue/Thu 13:00–14:15", location: "Science 110" }, "demo");
  const bio = await createCourse(s, { name: "Cell Biology", code: "BIO 210", term: "Fall 2026", instructorName: "Dr. Priya Nair", meetingInfo: "Mon/Wed/Fri 14:00–14:50", location: "Life Sciences 3" }, "demo");
  const a = (courseId: string, title: string, days: number, time: string | null, kind: "assignment" | "exam" | "quiz" | "project" | "reading" = "assignment") =>
    createAssignment(s, TZ, { courseId, title, dueDate: addDaysStr(today, days), dueTime: time, kind, sourceRef: "demo data" }, "demo");
  await a(psy.id, "Chapter 6 reading response", 1, "23:59");
  await a(psy.id, "Research methods quiz", 3, "10:00", "quiz");
  await a(psy.id, "Midterm exam", 9, "10:00", "exam");
  await a(calc.id, "Problem Set 7: Integration by parts", 2, "13:00");
  await a(calc.id, "Problem Set 8: Series", 9, "13:00");
  await a(calc.id, "Exam 2", 12, "13:00", "exam");
  await a(bio.id, "Lab report: Osmosis", -1, "17:00");
  await a(bio.id, "Group project proposal", 6, null, "project");
  const classEvent = (title: string, courseId: string, days: number[], startTime: string, endTime: string, location: string) =>
    createEvent(s, TZ, { title, courseId, kind: "class", date: addDaysStr(weekStart(today), -14), startTime, endTime, location, recurrence: { freq: "weekly", byDay: days, until: addDaysStr(today, 60) } }, "demo");
  await classEvent("PSY 101", psy.id, [1, 3], "10:00", "11:15", "Hall B 204");
  await classEvent("MATH 152", calc.id, [2, 4], "13:00", "14:15", "Science 110");
  await classEvent("BIO 210", bio.id, [1, 3, 5], "14:00", "14:50", "Life Sciences 3");
  await createEvent(s, TZ, { title: "Advisor meeting", kind: "appointment", date: addDaysStr(today, 2), startTime: "15:30", endTime: "16:00", location: "Student Center 2F" }, "demo");

  // ---- work
  const lib = await createEmployer(s, { name: "Campus Library", position: "Circulation assistant", payType: "hourly", hourlyRateCents: 1650 }, "demo");
  const ws = weekStart(today);
  for (const [offset, st, en] of [[1, "16:00", "21:00"], [3, "16:00", "21:00"], [5, "09:00", "14:00"], [8, "16:00", "21:00"], [10, "16:00", "21:00"], [12, "09:00", "14:00"]] as const) {
    // Thursday 13:00 shift deliberately overlaps MATH 152 to demo conflict detection
    await createShift(s, TZ, { employerId: lib.id, date: addDaysStr(ws, offset), startTime: st, endTime: en, breakMinutes: 30 }, "demo");
  }
  await createShift(s, TZ, { employerId: lib.id, date: addDaysStr(ws, 3), startTime: "12:30", endTime: "15:00", breakMinutes: 0 }, "demo");

  // ---- tasks, notes, memory
  await createTask(s, TZ, { title: "Email Dr. Ortiz about midterm accommodations", priority: "high", dueDate: addDaysStr(today, 1) }, "demo");
  await createTask(s, TZ, { title: "Renew parking permit", priority: "medium", dueDate: addDaysStr(today, 4) }, "demo");
  await createTask(s, TZ, { title: "Cancel unused gym membership", priority: "low" }, "demo");
  const proj = await createProject(s, { name: "Campus coffee cart idea", description: "Side business: a mobile coffee cart for early classes." });
  await createNote(s, { title: "Coffee cart — brain dump", projectId: proj.id, tags: ["business", "ideas"], body: "- Morning rush 7:30–9:30 near Science quad\n- Need: cart, permit, supplier\n- Cost guess: $3–5k to start\n- Ask student union about vendor rules\n- Could I run it Mon/Wed before PSY?" }, "demo");
  await createNote(s, { title: "PSY 101 — memory & learning", courseId: psy.id, tags: ["psy101"], body: "## Encoding\nShallow vs deep processing. **Spacing effect**: distributed practice beats cramming.\n\n## Retrieval\nTesting effect — practice quizzes improve recall." }, "demo");
  await createMemory(s, { content: "Prefers studying in the morning.", category: "preference" }, "user");
  await createMemory(s, { content: "Works at the Campus Library, usually Tue/Thu evenings and Saturday mornings.", category: "routine" }, "user");
  await createMemory(s, { content: "Saving for a summer trip to Montréal.", category: "goal" }, "user");
  await createMemory(s, { content: "Wants to keep food spending under $450 a month.", category: "goal" }, "user");
  await createMemory(s, { content: "Has a car; drives to campus on Mondays and takes the bus other days.", category: "routine" }, "user");
  await createMemory(s, { content: "Prefers concise answers with a short list of next steps.", category: "preference" }, "user");
  await createMemory(s, { content: "Midterm season: extra stressed until mid-November.", category: "temporary", expiresAt: new Date(Date.now() + 21 * 86_400_000) }, "user");

  // ---- more depth: subtasks, completed work, materials, paychecks, worked shifts, notes
  const essay = await createTask(s, TZ, { title: "Write PSY 101 research summary", priority: "high", dueDate: addDaysStr(today, 6), courseId: psy.id }, "demo");
  for (const t of ["Pick 3 sources", "Outline", "First draft", "Proofread"]) await createTask(s, TZ, { title: t, parentId: essay.id, courseId: psy.id }, "demo");
  const cart = await createTask(s, TZ, { title: "Research coffee cart permits", priority: "medium", dueDate: addDaysStr(today, 10), projectId: proj.id }, "demo");
  await createTask(s, TZ, { title: "Email student union about vendor rules", parentId: cart.id, projectId: proj.id }, "demo");
  await createTask(s, TZ, { title: "Price used espresso carts", parentId: cart.id, projectId: proj.id }, "demo");
  await createTask(s, TZ, { title: "Book dentist appointment", priority: "low", dueDate: addDaysStr(today, 14) }, "demo");
  await createTask(s, TZ, { title: "Return library books", priority: "medium", dueDate: addDaysStr(today, -1) }, "demo");
  const done = await createTask(s, TZ, { title: "Submit FAFSA verification documents", priority: "urgent" }, "demo");
  await updateTask(s, TZ, done.id, { status: "done" });

  const past = await createAssignment(s, TZ, { courseId: calc.id, title: "Problem Set 6: Substitution", dueDate: addDaysStr(today, -5), dueTime: "13:00", sourceRef: "demo data" }, "demo");
  await updateAssignment(s, TZ, past.assignment.id, { status: "done", grade: "92/100" });
  const quiz = await createAssignment(s, TZ, { courseId: bio.id, title: "Quiz 3: Membranes", kind: "quiz", dueDate: addDaysStr(today, -8), dueTime: "14:00", sourceRef: "demo data" }, "demo");
  await updateAssignment(s, TZ, quiz.assignment.id, { status: "done", grade: "8.5/10" });
  await a(bio.id, "Reading: Chapter 7 — Cell signaling", 4, null, "reading");
  await a(calc.id, "Quiz: Series convergence", 5, "13:00", "quiz");

  for (const [courseId, title, module, url] of [
    [psy.id, "Syllabus", "Course info", "https://example.edu/psy101/syllabus"],
    [psy.id, "Week 7 slides — Memory", "Week 7", "https://example.edu/psy101/week7"],
    [calc.id, "Integration techniques cheat sheet", "Unit 2", "https://example.edu/math152/cheatsheet"],
    [calc.id, "Office hours: Tue 3–4pm, Science 214", "Course info", null],
    [bio.id, "Lab manual", "Labs", "https://example.edu/bio210/lab-manual"],
  ] as const) await addMaterial(s, { courseId, title, module, url: url ?? undefined }, "demo");

  // Past week: shifts with recorded punches, plus matching paychecks
  for (const [offset, st, en, inT, outT] of [[-6, "16:00", "21:00", "15:58", "21:12"], [-4, "16:00", "21:00", "16:05", "20:55"], [-2, "09:00", "14:00", "08:57", "14:03"]] as const) {
    const sh = await createShift(s, TZ, { employerId: lib.id, date: addDaysStr(ws, offset), startTime: st, endTime: en, breakMinutes: 30 }, "demo");
    await recordShiftHours(s, TZ, sh.id, { recordedStartTime: inT, recordedEndTime: outT });
  }
  for (let d = weekStart(addDaysStr(today, -120)); d <= today; d = addDaysStr(d, 14)) {
    const fri = addDaysStr(d, 4);
    if (fri >= addDaysStr(today, -60) && fri <= today) await addPaycheck(s, { employerId: lib.id, payDate: fri, grossCents: 70_950, netCents: 62_000, hours: 43 }, "demo");
  }

  await createNote(s, { title: "MATH 152 — integration by parts", courseId: calc.id, tags: ["math152", "exam2"], body: "∫u dv = uv − ∫v du\n\n**LIATE** for choosing u: Logs, Inverse trig, Algebraic, Trig, Exponential.\n\nPractice: ∫x·eˣ dx, ∫ln x dx, ∫x²·sin x dx" }, "demo");
  await createNote(s, { title: "Monthly money check-in", tags: ["money"], body: "- Food delivery crept up — try meal prep Sundays\n- Cancel gym (not using it)\n- Move $250/month to savings on the 15th\n- Montréal fund: ~$145/month needed" }, "demo");
  const travel = await createProject(s, { name: "Montréal summer trip", description: "Plan and save for a week in Montréal in June." });
  await createNote(s, { title: "Montréal ideas", projectId: travel.id, tags: ["travel"], body: "- Old Port, Mont Royal, Jean-Talon market\n- Bus vs. train from NYC\n- Hostel ~ $45/night" }, "demo");
  await createTask(s, TZ, { title: "Compare bus vs. train prices to Montréal", projectId: travel.id, priority: "low" }, "demo");
  await createRecurring(s, { name: "Spotify", amountCents: -1199, frequency: "monthly", nextDueDate: nextDom(18), kind: "subscription", categoryId: ids.streaming }, "demo");
  await createRecurring(s, { name: "City Utilities", amountCents: -8_200, frequency: "monthly", nextDueDate: nextDom(5), kind: "bill", categoryId: ids.utilities }, "demo");
  const lastMonth = `${addDaysStr(month, -1).slice(0, 7)}-01`;
  await setBudget(s, { month: lastMonth, categoryId: ids.food, limitCents: 45_000 });
  await setBudget(s, { month: lastMonth, categoryId: ids.transport, limitCents: 15_000 });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
