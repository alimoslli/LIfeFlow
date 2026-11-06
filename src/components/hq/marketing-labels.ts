import type { HqContentKind, HqContentStatus, HqNetwork } from "@/server/db/schema";
import type { EmployeeState } from "@/server/hq/state";

export const NETWORK_LABEL: Record<HqNetwork, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
  linkedin: "LinkedIn",
};

export const KIND_WORD: Record<HqContentKind, string> = { concept: "Concept", script: "Script", post: "Post", research: "Research" };

export const CONTENT_STATUS_LABEL: Record<HqContentStatus, string> = {
  idea: "Idea",
  draft: "Draft",
  waiting: "Waiting for you",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  dropped: "Dropped",
};

/** The chip colours reuse the office chip states. */
export const CONTENT_STATUS_CHIP: Record<HqContentStatus, EmployeeState> = {
  idea: "offline",
  draft: "offline",
  waiting: "needs_you",
  approved: "working",
  scheduled: "sleeping",
  published: "done",
  dropped: "offline",
};

export const platformsLine = (p: HqNetwork[]) => (p.length ? p.map((n) => NETWORK_LABEL[n]).join(", ") : "No network chosen");

/** "weekly_reach" -> "Weekly reach". */
export function metricLabel(m: string): string {
  const s = m.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const parts = (d: Date, tz: string) => {
  const o: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d))
    o[p.type] = p.value;
  return o;
};

/** yyyy-mm-dd of a moment in a time zone. */
export function dayKey(d: Date, tz: string): string {
  const p = parts(d, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** The value a datetime-local input shows for a moment in the owner's time zone. */
export function toLocalInput(d: Date | null, tz: string): string {
  if (!d) return "";
  const p = parts(d, tz);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** A datetime-local value read in the owner's time zone, as an ISO string. Null when empty or not a date. */
export function fromLocalInput(v: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const want = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let guess = want;
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(guess), tz);
    const seen = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    guess += want - seen;
  }
  return new Date(guess).toISOString();
}

export const timeOnly = (d: Date, tz: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(d);

/** "Today", "Tomorrow" or "Fri, Nov 6" for a yyyy-mm-dd key. */
export function dayHeading(key: string, today: string): string {
  const add = (k: string, n: number) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  };
  if (key === today) return "Today";
  if (key === add(today, 1)) return "Tomorrow";
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export const addDays = (k: string, n: number) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
