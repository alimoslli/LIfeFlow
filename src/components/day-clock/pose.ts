import type { Activity, Pose } from "./companion";

/** What the skyling is up to, by the rules below: the page's moments and the real day (owner, 2026-11-11). */
export type PoseInputs = {
  /** the wheel shows now (not an earlier or later time the person turned to) */
  follow: boolean;
  /** the person is turning the wheel right now */
  moved: boolean;
  /** late at night: it sleeps */
  sleep: boolean;
  /** a live item it's in: a class ("class") or a shift ("work") */
  live?: string;
  /** the first hours after sunrise */
  morning: boolean;
  /** what the page says it's doing (waving, thinking, surprised), or null */
  doing: Activity | null;
  /** reduced motion: it stands still, apart from its reactions */
  reduce: boolean;
  /** a slow count, a few seconds per step, for the morning stretch */
  tick: number;
};

/**
 * The skyling's pose, in order (owner, 2026-11-11: "show some love and attention to the skylings, their life in the app"):
 * the page's own moment first (waving when you come, thinking while your answer comes, surprised at a clash), then asleep
 * late at night, then the day (reading through a class, a mug on a shift, a stretch now and then in the morning), and
 * otherwise a walk. Turning the wheel makes it run. With reduced motion it stands still (its first frame), but the page's
 * moments still show (owner, 2026-11-12: "i want the reactions ... that's not enough motion").
 */
export function choosePose(i: PoseInputs): Pose {
  // it wakes up to say hello or to think about your answer, even at night
  if (i.follow && !i.moved && i.doing) return i.doing;
  if (i.sleep) return "sleep";
  if (!i.follow || i.moved) return i.reduce && !i.moved ? "idle" : "walk";
  if (i.live === "class") return "read";
  if (i.live === "work") return "sip";
  if (i.morning && i.tick % 4 === 0) return "stretch";
  return i.reduce ? "idle" : "walk";
}
