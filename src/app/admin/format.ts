import { getSessionUser } from "@/server/auth/current-user";

/** The admin's own time zone, so times read the way they live them. */
export async function adminTz() {
  return (await getSessionUser())?.timezone || "UTC";
}

export function fmt(d: Date | null | undefined, tz: string) {
  if (!d) return "never";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(d);
}

/** "5 min ago", "3 h ago", "2 d ago". */
export function ago(d: Date | null | undefined) {
  if (!d) return "never";
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export const Failed = () => "Couldn't load this. Reload to try again.";
