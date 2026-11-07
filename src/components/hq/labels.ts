import type { ApprovalKind, MissionPriority, MissionStatus } from "@/server/hq/types";

export const KIND_LABEL: Record<ApprovalKind, string> = {
  deploy: "Go live",
  v3_merge: "Merge V3",
  feature: "New feature",
  design: "Design change",
  publish: "Publish",
  outbound: "Send a message",
  paid: "Paid",
  subscription: "Subscription",
  destructive: "Delete or undo",
  security: "Security",
  other: "Decision",
};

export const STATUS_LABEL: Record<MissionStatus, string> = {
  todo: "To do",
  doing: "Doing",
  waiting: "Waiting on you",
  blocked: "Blocked",
  done: "Done",
  dropped: "Dropped",
};

export const PRIORITY_LABEL: Record<MissionPriority, string> = { high: "High", normal: "Normal", low: "Low" };

/** "Good evening" by the hour in the owner's time zone. */
export function greeting(now: Date, tz: string): string {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(now));
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** The plain one-line counts: only non-zero ones. */
export function countsLine(c: { working: number; done: number; asleep: number; offline: number }): string {
  const parts: [number, string][] = [
    [c.working, "working"],
    [c.done, "done"],
    [c.asleep, "asleep"],
    [c.offline, "offline"],
  ];
  return parts
    .filter(([n]) => n > 0)
    .map(([n, l]) => `${n} ${l}`)
    .join(" · ");
}

export function dayLabel(d: string | null): string | null {
  if (!d) return null;
  const [y, m, day] = d.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, day)));
}
