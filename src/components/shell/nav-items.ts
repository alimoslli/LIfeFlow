import { CalendarRange, Sparkles, Sun, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { JarvisModule } from "@/server/db/schema";

/** The whole app is four places. Detail pages live under them. */
export const NAV = [
  { href: "/", label: "Today", icon: Sun, module: "home", match: ["/"] },
  { href: "/plan", label: "Plan", icon: CalendarRange, module: "calendar", match: ["/plan", "/school", "/work", "/calendar", "/tasks", "/notes"] },
  { href: "/jarvis", label: "Jarvis", icon: Sparkles, module: "home", match: ["/jarvis"] },
  { href: "/money", label: "Money", icon: Wallet, module: "finances", match: ["/money", "/finances", "/wealth"] },
] as const satisfies readonly { href: string; label: string; icon: LucideIcon; module: JarvisModule; match: readonly string[] }[];

const MODULE_BY_PREFIX: [string, JarvisModule][] = [
  ["/school", "school"],
  ["/work", "work"],
  ["/calendar", "calendar"],
  ["/plan", "calendar"],
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
