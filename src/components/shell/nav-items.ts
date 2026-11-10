import { pixel, type IconLike } from "@/components/pixel/pixel-icon";
import type { JarvisModule } from "@/server/db/schema";

/**
 * Four tabs (v3). Today is the day clock and its timeline, and the planning pages (calendar, to-dos, goals,
 * health, work) live under it as pills. Every other page lives under one tab (see section-nav.tsx). Settings is
 * the gear in the top bar.
 */
export const NAV = [
  {
    href: "/",
    label: "Today",
    icon: pixel("today"),
    module: "home",
    match: ["/", "/plan", "/calendar", "/tasks", "/goals", "/milestones", "/habits", "/work"],
  },
  // The tab shows the user's name for their skyling (app-shell); "Skyling" until they choose one.
  { href: "/jarvis", label: "Skyling", icon: pixel("cloud"), module: "home", match: ["/jarvis", "/inbox"] },
  { href: "/money", label: "Money", icon: pixel("money"), module: "finances", match: ["/money", "/finances", "/wealth"] },
  { href: "/school", label: "School", icon: pixel("school"), module: "school", match: ["/school", "/notes"] },
] as const satisfies readonly { href: string; label: string; icon: IconLike; module: JarvisModule; match: readonly string[] }[];

export type NavItem = { href: string; label: string; icon: IconLike; module: JarvisModule; match: readonly string[] };

/** Someone with no classes but a job gets Work where School would be (owner's reset, 2026-11-10). */
const WORK_TAB: NavItem = { href: "/work", label: "Work", icon: pixel("shift"), module: "work", match: ["/work"] };

/** The tabs this person sees: School for students, Work in its place for people with a job and no classes. */
export function tabsFor(areas: { school: boolean; work: boolean }): NavItem[] {
  const workTab = !areas.school && areas.work;
  return NAV.flatMap((t): NavItem[] => {
    if (t.module === "school") return areas.school ? [t] : workTab ? [WORK_TAB] : [];
    // with its own tab, Work isn't part of Today any more
    if (t.href === "/" && workTab) return [{ ...t, match: t.match.filter((m) => m !== "/work") }];
    return [t];
  });
}

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

export function isActive(pathname: string, item: NavItem) {
  return item.match.some((m) => (m === "/" ? pathname === "/" : pathname === m || pathname.startsWith(`${m}/`)));
}
