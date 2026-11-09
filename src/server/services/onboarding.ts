import { eq } from "drizzle-orm";
import { z } from "zod";
import { COMPANION_KEYS } from "@/lib/companions";
import { addDaysStr, DATE_RE, TIME_RE, todayIn } from "@/lib/dates";
import { createEvent } from "./calendar";
import { createTask } from "./tasks";
import { users } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { assistantSchema } from "./accounts";
import { createManualAccount } from "./finance/accounts";
import { createMemory } from "./memory";
import { createCourse } from "./school";
import { createEmployer, fillRegularShifts, workScheduleSchema } from "./work";

/**
 * First-run setup. Everything the user entered is saved in one transaction
 * through the regular services, so a failed step leaves nothing half-done.
 */
export const onboardingSchema = z.object({
  lifeStage: z.enum(["student", "working", "both", "life"]).optional(),
  courses: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  job: z
    .object({
      name: z.string().trim().min(1).max(200),
      /** Dollars per hour; optional. */
      hourlyRate: z.number().min(0).max(10_000).optional(),
      /** Regular hours, e.g. full-time Mon–Fri 08:00–17:00. Left out when shifts change week to week. */
      schedule: workScheduleSchema.optional(),
    })
    .optional(),
  checking: z
    .object({
      name: z.string().trim().min(1).max(120).default("Checking"),
      /** Current balance in dollars, as the user sees it in their bank app. */
      balance: z.number().min(-10_000_000).max(10_000_000),
    })
    .optional(),
  studyTime: z.enum(["morning", "afternoon", "evening", "night"]).optional(),
  jarvisTone: z.enum(["concise", "balanced", "detailed"]).optional(),
  /** Something the user wants Jarvis to know; saved as a confirmed memory. */
  aboutMe: z.string().trim().max(500).optional(),
  /** Their assistant's name and personality, chosen in "Make it yours". */
  assistant: z
    .object({ name: assistantSchema.shape.name.optional(), style: z.enum(["coach", "friend", "direct"]), companion: z.enum(COMPANION_KEYS).optional() })
    .optional(),
});

export type OnboardingInput = z.input<typeof onboardingSchema>;

export async function completeOnboarding(scope: UserScope, input: OnboardingInput, tz = "UTC") {
  const d = onboardingSchema.parse(input);
  const seen = new Set<string>();
  let courses = 0;
  for (const name of d.courses) {
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    await createCourse(scope, { name });
    courses++;
  }
  if (d.job) {
    await createEmployer(scope, {
      name: d.job.name,
      payType: "hourly",
      hourlyRateCents: d.job.hourlyRate == null ? null : Math.round(d.job.hourlyRate * 100),
      schedule: d.job.schedule ?? null,
    });
    if (d.job.schedule) await fillRegularShifts(scope, tz, todayIn(tz));
  }
  if (d.checking) {
    await createManualAccount(scope, {
      name: d.checking.name,
      type: "depository",
      subtype: "checking",
      currentBalanceCents: Math.round(d.checking.balance * 100),
    });
  }
  if (d.aboutMe && d.aboutMe.length >= 3) {
    await createMemory(scope, { content: d.aboutMe, category: "fact" }, "user");
  }
  await finishOnboarding(scope, {
    lifeStage: d.lifeStage,
    studyTime: d.studyTime,
    jarvisTone: d.jarvisTone,
    assistantName: d.assistant?.name,
    assistantStyle: d.assistant?.style,
    companion: d.assistant?.companion,
  });
  return { courses, job: !!d.job, checking: !!d.checking, memory: !!d.aboutMe && d.aboutMe.length >= 3 };
}

/**
 * "Build your sky" (the welcome, owner 2026-11-09: people really set up, they don't just give a name): each thing they
 * add is saved at once through the regular services and lands on their wheel while they watch.
 */
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weeklySchema = z
  .object({
    name: z.string().trim().min(1, "Give it a name").max(120),
    days: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day").max(7),
    start: z.string().regex(TIME_RE, "Pick a start time"),
    end: z.string().regex(TIME_RE, "Pick an end time"),
  })
  .refine((d) => d.end > d.start, { message: "It has to end after it starts", path: ["end"] });
export type WeeklyInput = z.input<typeof weeklySchema>;

/** The first date from today that falls on one of the days (0 = Sunday). */
function firstOn(today: string, days: number[]) {
  for (let i = 0; i < 7; i++) {
    const d = addDaysStr(today, i);
    if (days.includes(new Date(`${d}T12:00:00Z`).getUTCDay())) return d;
  }
  return today;
}

/** A class that meets every week: the course, and its meetings on the calendar (so they're on the sky). */
export async function addWeeklyClass(scope: UserScope, tz: string, input: WeeklyInput) {
  const d = weeklySchema.parse(input);
  const days = [...new Set(d.days)].sort();
  const course = await createCourse(scope, { name: d.name, meetingInfo: `${days.map((n) => DAY_NAMES[n]).join("/")} ${d.start}-${d.end}` });
  await createEvent(scope, tz, {
    title: d.name,
    date: firstOn(todayIn(tz), days),
    startTime: d.start,
    endTime: d.end,
    kind: "class",
    courseId: course.id,
    recurrence: { freq: "weekly", byDay: days },
  });
  return course;
}

/** Where they work and their usual hours: the regular shifts fill in ahead, the way Work does it. */
export async function addRegularWork(scope: UserScope, tz: string, input: WeeklyInput) {
  const d = weeklySchema.parse(input);
  const job = await createEmployer(scope, { name: d.name, payType: "hourly", schedule: { days: [...new Set(d.days)].sort(), start: d.start, end: d.end } });
  await fillRegularShifts(scope, tz, todayIn(tz));
  return job;
}

const dueSchema = z.object({
  title: z.string().trim().min(1, "Say what it is").max(200),
  date: z.string().regex(DATE_RE, "Pick a day"),
  time: z.string().regex(TIME_RE).optional(),
});

/** Something due soon, as a to-do with its date (a paper, a bill, an appointment). */
export async function addDueSoon(scope: UserScope, tz: string, input: z.input<typeof dueSchema>) {
  const d = dueSchema.parse(input);
  return createTask(scope, tz, { title: d.title, dueDate: d.date, dueTime: d.time ?? null, priority: "medium" });
}

/** The name they want to be called, asked on the first screen after sign-up. */
export async function setDisplayName(scope: UserScope, name: string) {
  const clean = z.string().trim().min(1, "Enter a name").max(80).parse(name).replace(/\s+/g, " ");
  await scope.tx.update(users).set({ name: clean }).where(eq(users.id, scope.userId));
}

/** Marks setup finished (also used by "Skip setup") and queues the guided tour. */
export async function finishOnboarding(
  scope: UserScope,
  prefs: Partial<Pick<typeof users.$inferSelect.preferences, "lifeStage" | "studyTime" | "jarvisTone" | "assistantName" | "assistantStyle" | "companion">> = {},
) {
  const [u] = await scope.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, scope.userId));
  const defined = Object.fromEntries(Object.entries(prefs).filter(([, v]) => v !== undefined));
  await scope.tx
    .update(users)
    .set({ preferences: { ...u.preferences, ...defined, onboarding: "done", tour: "pending" } })
    .where(eq(users.id, scope.userId));
}

export async function setTourState(scope: UserScope, tour: "pending" | "done") {
  const [u] = await scope.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, scope.userId));
  await scope.tx
    .update(users)
    .set({ preferences: { ...u.preferences, tour } })
    .where(eq(users.id, scope.userId));
}
