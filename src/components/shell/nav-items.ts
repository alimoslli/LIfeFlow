import { Clock3, GraduationCap, Sparkles, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { JarvisModule } from "@/server/db/schema";

/**
 * Four tabs (v3). Today is the day clock and its timeline, and the planning pages (calendar, to-dos, goals,
 * health, work) live under it as pills. Every other page lives under one tab (see section-nav.tsx). Settings is
 * the gear in the top bar.
 */
export const NAV = [
  { href: "/", label: "Today", icon: Clock3, module: "home", match: ["/", "/plan", "/calendar", "/tasks", "/goals", "/milestones", "/habits", "/work"] },
  // The tab shows the user's name for their assistant (app-shell); "Assistant" until they choose one.
  { href: "/jarvis", label: "Assistant", icon: Sparkles, module: "home", match: ["/jarvis", "/inbox"] },
  { href: "/money", label: "Money", icon: Wallet, module: "finances", match: ["/money", "/finances", "/wealth"] },
  { href: "/school", label: "School", icon: GraduationCap, module: "school", match: ["/school", "/notes"] },
] as const satisfies readonly { href: string; label: string; icon: LucideIcon; module: JarvisModule; match: readonly string[] }[];

const MODULE_BY_PREFIX: [string, JarvisModule][] = [
  ["/school", "school"],
  ["/work", "work"],
  ["/calendar", "calendar"],
  ["/plan", "calendar"],
  ["/goals", "finances"],
  ["/tasks", "tasks"],
  ["/notes", "notes"],
  ["/money", "finances"],
  ["/finances", "finances"],
  ["/wealth", "wealth"],
  ["/settings", "settings"],
];

export function moduleForPath(pathname: string): JarvisModule {
  return MODULE_BY_PREFIX.find(([p]) => pathname.startsWith(p))?.[1] ?? "home";
}

export function isActive(pathname: string, item: (typeof NAV)[number]) {
  return item.match.some((m) => (m === "/" ? pathname === "/" : pathname === m || pathname.startsWith(`${m}/`)));
}
