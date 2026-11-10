import { isCompanionKey, skylingAt, SKY_CHOICE, type CompanionKey } from "./companions";
import { sunTimes } from "./day-clock";
import { todayIn } from "./dates";

/** Minutes past local midnight in a time zone. */
export function minuteIn(tz: string, now: Date = new Date()): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "numeric", minute: "numeric" }).formatToParts(now);
  const v = (k: string) => Number(p.find((x) => x.type === k)?.value ?? 0);
  return v("hour") * 60 + v("minute");
}

/**
 * The skyling to draw for a saved choice: the one picked, or, for "Changes with the sky", whoever's moment it is now in
 * their time zone. Null when nothing was picked (callers fall back to the default, Ray).
 */
export function resolveSkyling(choice: string | null | undefined, tz: string, now: Date = new Date()): CompanionKey | null {
  if (choice !== SKY_CHOICE) return isCompanionKey(choice) ? choice : null;
  const { rise, set } = sunTimes(todayIn(tz, now), tz);
  return skylingAt(minuteIn(tz, now), rise, set);
}
