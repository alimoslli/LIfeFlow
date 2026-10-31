import { addDaysStr, formatDateStr, localDateOf } from "@/lib/dates";
import type { Idea } from "@/lib/ideas";
import type { LifeAreas } from "@/lib/life";
import { series } from "../db/series";
import type { UserScope } from "../db/with-user";
import { listGoals, listRecurring } from "./finance/planning";
import { listAssignments, listCourses } from "./school";
import { listEmployers, listShifts } from "./work";

/** Up to three ideas from the user's own records (facts only), shown above the catalog. */
export async function personalIdeas(scope: UserScope, tz: string, today: string, areas: LifeAreas): Promise<Idea[]> {
  const [upcoming, courses, goals, recurring, jobs, shifts] = await series(
    () => (areas.school ? listAssignments(scope, tz, { view: "upcoming", limit: 50 }) : Promise.resolve([])),
    () => (areas.school ? listCourses(scope) : Promise.resolve([])),
    () => listGoals(scope),
    () => listRecurring(scope),
    () => (areas.work ? listEmployers(scope) : Promise.resolve([])),
    () => (areas.work ? listShifts(scope, tz, today, addDaysStr(today, 6)) : Promise.resolve([])),
  );
  const out: Idea[] = [];
  const exam = upcoming.find((a) => a.kind === "exam" && a.dueAt && localDateOf(a.dueAt, tz) <= addDaysStr(today, 14));
  if (exam?.dueAt) {
    const day = formatDateStr(localDateOf(exam.dueAt, tz), "EEE, MMM d");
    out.push({
      emoji: "📚",
      title: `${exam.title} is ${day}. Want a study plan?`,
      detail: `Study blocks for ${exam.course.name} in your free time before then.`,
      prompt: `Plan study time for ${exam.title} (${exam.course.name}) on ${day}, in my free time.`,
    });
  }
  const bare = courses.find((c) => !upcoming.some((a) => a.course.id === c.id));
  if (bare)
    out.push({
      emoji: "📄",
      title: `Nothing due in ${bare.name} yet. Send me the syllabus?`,
      detail: "I'll add every due date and exam.",
      prompt: `Here's the syllabus for ${bare.name}. Add every due date and exam.`,
    });
  const job = jobs.find((j) => !j.schedule && !shifts.some((s) => s.employerId === j.id));
  if (job)
    out.push({
      emoji: "📸",
      title: `No shifts at ${job.name} this week. Add them?`,
      detail: "Send a screenshot of your schedule, or set regular hours.",
      prompt: `Add my shifts at ${job.name} for this week.`,
    });
  if (!goals.some((g) => g.status === "active"))
    out.push({
      emoji: "💰",
      title: "No savings goal yet. Set one?",
      detail: "Pick what you're saving for and a weekly amount.",
      prompt: "Help me set a savings goal and a weekly amount I can actually keep.",
    });
  const subs = recurring.filter((r) => r.kind === "subscription");
  if (subs.length >= 3)
    out.push({
      emoji: "🧾",
      title: `You pay for ${subs.length} subscriptions. Still use them all?`,
      detail: "I'll list them with prices so you can decide.",
      prompt: "List my subscriptions with prices and help me decide which to keep.",
    });
  return out.slice(0, 3);
}
