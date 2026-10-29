import { CalendarRange, GraduationCap, Sparkles, Sun, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { JarvisModule } from "@/server/db/schema";

/** Five tabs. Every other page lives under one of them (see section-nav.tsx). Settings is the gear in the top bar. */
export const NAV = [
  { href: "/", label: "Today", icon: Sun, module: "home", match: ["/"] },
  { href: "/plan", label: "Plan", icon: CalendarRange, module: "calendar", match: ["/plan", "/calendar", "/tasks", "/goals", "/habits", "/work", "/trips"] },
  { href: "/jarvis", label: "Jarvis", icon: Sparkles, module: "home", match: ["/jarvis", "/inbox"] },
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
