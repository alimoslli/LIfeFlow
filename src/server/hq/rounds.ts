import type { HqRole } from "../db/schema";
import { addDaysStr, dayOfWeek, formatIn, localDateOf, localToInstant } from "@/lib/dates";

/**
 * The COO's scheduled rounds (owner, 2026-11-07: rounds run on their schedule only; "goodnight" starts nothing). These match the
 * scheduled tasks in docs/hq/round-prompts.md (a unit test compares them). HQ never starts a round: it only reads the COO's
 * check-ins to know one is running, and shows each sleeping room when it next wakes.
 */
export const ROUND_TZ = "America/Los_Angeles";

export type RoundKind = "night" | "research" | "marketing";
export type Round = {
  kind: RoundKind;
  name: string;
  /** Days of the week in ROUND_TZ, 0 = Sunday. */
  days: number[];
  hour: number;
  minute: number;
  /** The scheduled task's cron line, exactly as in docs/hq/round-prompts.md. */
  cron: string;
  /** The departments that work in this round (the COO runs every round). */
  roles: HqRole[];
};

export const ROUND_SCHEDULE: readonly Round[] = [
  {
    kind: "night",
    name: "Night round",
    days: [0, 2, 4],
    hour: 3,
    minute: 7,
    cron: "CRON_TZ=America/Los_Angeles 7 3 * * 0,2,4",
    roles: ["assistant", "developer", "qa", "support", "researcher"],
  },
  {
    kind: "research",
    name: "Research round",
    days: [1],
    hour: 3,
    minute: 23,
    cron: "CRON_TZ=America/Los_Angeles 23 3 * * 1",
    roles: ["assistant", "researcher"],
  },
  {
    kind: "marketing",
    name: "Marketing round",
    days: [3],
    hour: 3,
    minute: 41,
    cron: "CRON_TZ=America/Los_Angeles 41 3 * * 3",
    roles: ["assistant", "marketing"],
  },
];

/**
 * A round counts as running for at most this long after the COO's last check-in with status "working". A round that crashed
 * without its round_end check-in stops showing as running after this.
 */
export const ROUND_MAX_MS = 3 * 3_600_000;

const pad = (n: number) => String(n).padStart(2, "0");

/** The next time a round starts, strictly after `now`. */
export function nextRoundAt(r: Round, now: Date): Date {
  const today = localDateOf(now, ROUND_TZ);
  for (let i = 0; i <= 8; i++) {
    const day = addDaysStr(today, i);
    if (!r.days.includes(dayOfWeek(day))) continue;
    const at = localToInstant(day, `${pad(r.hour)}:${pad(r.minute)}`, ROUND_TZ);
    if (at.getTime() > now.getTime()) return at;
  }
  /* c8 ignore next */
  throw new Error(`No next time for ${r.kind}`);
}

/** The next round a department works in, or null for one with no round (Product & Design works with the owner in its chat). */
export function nextWake(role: HqRole, now: Date): { round: Round; at: Date } | null {
  let best: { round: Round; at: Date } | null = null;
  for (const r of ROUND_SCHEDULE) {
    if (!r.roles.includes(role)) continue;
    const at = nextRoundAt(r, now);
    if (!best || at < best.at) best = { round: r, at };
  }
  return best;
}

/** "Wakes Sun 3:07 AM" in the owner's time zone. */
export const wakeLine = (at: Date, tz: string) => `Wakes ${formatIn(at, tz, "EEE h:mm a")}`;

/**
 * Which round the COO's "working" check-in belongs to: its summary names it ("Night round started"), or else the scheduled
 * round on that day in ROUND_TZ. Null when neither says.
 */
export function roundOf(summary: string | null, at: Date): Round | null {
  const s = summary?.toLowerCase() ?? "";
  const named = s.includes("night") ? "night" : s.includes("research") || s.includes("weekly plan") ? "research" : s.includes("marketing") ? "marketing" : null;
  if (named) return ROUND_SCHEDULE.find((r) => r.kind === named) ?? null;
  const dow = dayOfWeek(localDateOf(at, ROUND_TZ));
  return ROUND_SCHEDULE.find((r) => r.days.includes(dow)) ?? null;
}
