import { z } from "zod";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { DATE_RE } from "@/lib/dates";
import { financialGoals, lifeMilestones, MILESTONE_CATEGORIES, personalGoals, type MilestoneCategory } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { notFound, ServiceError } from "./errors";

/**
 * Life milestones: what the user has done ("Graduated high school", "First job", "Ran a 5K").
 * Every reached goal is a milestone too: the timeline adds done personal goals and achieved
 * money goals at read time, so un-doing a goal takes it off again.
 */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "2022", "May 2022", "2022-05", "2022-05-10" → a date and how precise it is. Anything else → null. */
export function parseWhen(text: string | null | undefined): { happenedOn: string; precision: "day" | "month" | "year" } | null {
  const t = (text ?? "").trim().toLowerCase();
  if (!t) return null;
  if (DATE_RE.test(t)) return { happenedOn: t, precision: "day" };
  let m = t.match(/^(\d{4})-(\d{2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return { happenedOn: `${m[1]}-${m[2]}-01`, precision: "month" };
  m = t.match(/^([a-z]{3,9})\.?,?\s+(\d{4})$/);
  if (m) {
    const i = MONTHS.indexOf(m[1].slice(0, 3));
    if (i >= 0) return { happenedOn: `${m[2]}-${String(i + 1).padStart(2, "0")}-01`, precision: "month" };
  }
  m = t.match(/^(?:in\s+)?(\d{4})$/);
  if (m) return { happenedOn: `${m[1]}-01-01`, precision: "year" };
  return null;
}

/** A year is plausible for a life event: not before 1900 and not more than a year ahead. */
const plausible = (d: string) => {
  const y = Number(d.slice(0, 4));
  return y >= 1900 && y <= new Date().getUTCFullYear() + 1;
};

/** True when "when" is a date we can read and a plausible year for a life event. */
export const isValidWhen = (when: string) => {
  const p = parseWhen(when);
  return !!p && plausible(p.happenedOn);
};

export const milestoneSchema = z.object({
  title: z.string().trim().min(2, "Say what happened.").max(200),
  category: z.enum(MILESTONE_CATEGORIES).default("personal"),
  /** Free text the user typed ("2022", "May 2022") or a YYYY-MM-DD date. */
  when: z.string().trim().max(40).nullish(),
  note: z.string().trim().max(500).nullish(),
});
export type MilestoneInput = z.input<typeof milestoneSchema>;

function whenFields(when: string | null | undefined) {
  if (!when) return { happenedOn: null, precision: "day" as const };
  const p = parseWhen(when);
  if (!p || !plausible(p.happenedOn)) throw new ServiceError('For "when", use a year like 2022, "May 2022" or a date.');
  return p;
}

export async function createMilestone(scope: UserScope, input: MilestoneInput, source: "user" | "jarvis" | "import" = "user") {
  const d = milestoneSchema.parse(input);
  const [row] = await scope.tx
    .insert(lifeMilestones)
    .values({ userId: scope.userId, title: d.title, category: d.category, note: d.note || null, source, ...whenFields(d.when) })
    .returning();
  return row;
}

export async function updateMilestone(scope: UserScope, id: string, change: Partial<MilestoneInput>) {
  const d = milestoneSchema.partial().parse(change);
  const [row] = await scope.tx
    .update(lifeMilestones)
    .set({
      ...(d.title !== undefined && { title: d.title }),
      ...(d.category !== undefined && { category: d.category }),
      ...(d.note !== undefined && { note: d.note || null }),
      ...(d.when !== undefined && whenFields(d.when)),
      updatedAt: new Date(),
    })
    .where(and(eq(lifeMilestones.id, id), eq(lifeMilestones.userId, scope.userId)))
    .returning();
  if (!row) throw notFound("Milestone");
  return row;
}

export async function deleteMilestone(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .delete(lifeMilestones)
    .where(and(eq(lifeMilestones.id, id), eq(lifeMilestones.userId, scope.userId)))
    .returning({ id: lifeMilestones.id, title: lifeMilestones.title });
  if (!row) throw notFound("Milestone");
  return row;
}

export type TimelineItem = {
  id: string;
  title: string;
  category: MilestoneCategory;
  /** YYYY-MM-DD, or null when the user didn't say when. */
  date: string | null;
  precision: "day" | "month" | "year";
  note: string | null;
  /** milestone = added by the user or Jarvis (editable); goal / money_goal = a reached goal. */
  kind: "milestone" | "goal" | "money_goal";
};

/** Everything on the Milestones page, newest first; undated milestones last. Money goals only when the Money lock is open. */
export async function lifeTimeline(scope: UserScope, opts: { includeMoney: boolean; tz?: string }): Promise<TimelineItem[]> {
  const tz = opts.tz ?? "UTC";
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const rows = await scope.tx.select().from(lifeMilestones).where(eq(lifeMilestones.userId, scope.userId)).orderBy(desc(lifeMilestones.happenedOn));
  const goals = await scope.tx
    .select({ id: personalGoals.id, title: personalGoals.title, doneAt: personalGoals.doneAt })
    .from(personalGoals)
    .where(and(eq(personalGoals.userId, scope.userId), isNotNull(personalGoals.doneAt)));
  const money = opts.includeMoney
    ? await scope.tx
        .select({ id: financialGoals.id, name: financialGoals.name, updatedAt: financialGoals.updatedAt })
        .from(financialGoals)
        .where(and(eq(financialGoals.userId, scope.userId), eq(financialGoals.status, "achieved")))
    : [];
  const items: TimelineItem[] = [
    ...rows.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      date: r.happenedOn,
      precision: r.precision,
      note: r.note,
      kind: "milestone" as const,
    })),
    ...goals.map((g) => ({
      id: g.id,
      title: g.title,
      category: "personal" as const,
      date: day(g.doneAt!),
      precision: "day" as const,
      note: null,
      kind: "goal" as const,
    })),
    ...money.map((g) => ({
      id: g.id,
      title: `Reached ${g.name}`,
      category: "money" as const,
      date: day(g.updatedAt),
      precision: "day" as const,
      note: null,
      kind: "money_goal" as const,
    })),
  ];
  return items.sort((a, b) => (a.date === b.date ? 0 : !a.date ? 1 : !b.date ? -1 : a.date < b.date ? 1 : -1));
}

/** "2022", "May 2022" or "May 10, 2022". */
export function whenLabel(i: { date: string | null; precision: "day" | "month" | "year" }) {
  if (!i.date) return null;
  const [y, m, d] = i.date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (i.precision === "year") return String(y);
  if (i.precision === "month") return dt.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
