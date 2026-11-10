"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { whenIdle } from "@/lib/idle";
import { useEffect, useRef } from "react";
import { pixel, type IconLike } from "@/components/pixel/pixel-icon";
import { cn } from "@/lib/utils";
import { useLifeAreas } from "./life-areas";

type Item = { href: string; label: string; icon: IconLike; exact?: boolean; /** Other pages that belong to this pill. */ also?: string[]; except?: string[] };
export type Section = "plan" | "money" | "jarvis" | "personal";

const SECTION_NAMES: Record<Section, string> = { plan: "Today", jarvis: "Skyling", money: "Money", personal: "School" };

/** Second level: each tab's pages as pills. Every page belongs to exactly one pill. */
export const SECTIONS: Record<Section, Item[]> = {
  // Today's pages. The clock itself ("/") shows no pills: the day picker is its own navigation.
  plan: [
    { href: "/", label: "Day", icon: pixel("today"), exact: true },
    { href: "/plan", label: "Calendar", icon: pixel("calendar"), exact: true, also: ["/calendar"] },
    { href: "/tasks", label: "To-dos", icon: pixel("todo") },
    { href: "/milestones", label: "Milestones", icon: pixel("goal"), also: ["/goals"] },
    { href: "/habits", label: "Health", icon: pixel("health") },
    { href: "/work", label: "Work", icon: pixel("shift") },
  ],
  jarvis: [
    { href: "/jarvis", label: "Chat", icon: pixel("chat"), except: ["/jarvis/says", "/jarvis/memory", "/jarvis/profile", "/jarvis/ideas"] },
    { href: "/jarvis/says", label: "Updates", icon: pixel("bell"), also: ["/inbox"] },
    { href: "/jarvis/ideas", label: "Ideas", icon: pixel("idea") },
    { href: "/jarvis/profile", label: "Profile", icon: pixel("person"), also: ["/jarvis/memory"] },
  ],
  money: [
    {
      href: "/money",
      label: "Overview",
      icon: pixel("money"),
      exact: true,
      also: ["/finances/bills"],
    },
    { href: "/finances/transactions", label: "Activity", icon: pixel("bill"), also: ["/finances/rules"] },
    { href: "/finances/accounts", label: "Accounts", icon: pixel("card"), also: ["/wealth"] },
  ],
  personal: [
    { href: "/school", label: "Classes", icon: pixel("class"), exact: true, also: ["/school/courses"] },
    { href: "/school/due", label: "Due", icon: pixel("pencil") },
    { href: "/notes", label: "Notes", icon: pixel("note") },
  ],
};

const under = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);
const isOn = (pathname: string, i: Item) =>
  !(i.except ?? []).some((h) => under(pathname, h)) &&
  ((i.exact ? pathname === i.href : under(pathname, i.href)) || (i.also ?? []).some((h) => under(pathname, h)));

export function sectionFor(pathname: string) {
  return (Object.keys(SECTIONS) as (keyof typeof SECTIONS)[]).find((k) => SECTIONS[k].some((i) => isOn(pathname, i))) ?? null;
}

/** `inline`: inside a full-screen page (Jarvis chat) instead of the sticky bar. */
export function SectionNav({ inline = false, children }: { inline?: boolean; children?: React.ReactNode }) {
  const pathname = usePathname();
  const areas = useLifeAreas();
  const section = sectionFor(pathname);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const router = useRouter();
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);
  // Warm this tab's other pages once the screen is idle, so the next pill opens instantly.
  useEffect(() => {
    if (!section) return;
    return whenIdle(() => SECTIONS[section].forEach((i) => router.prefetch(i.href)));
  }, [section, pathname, router]);
  if (!section || pathname === "/") return null;
  return (
    <nav
      aria-label={`${SECTION_NAMES[section]} sections`}
      // On a phone, Today's other pages (calendar, to-dos, goals, health, work) are doors in "Everything else" (the dock),
      // so their row of pills shows on laptops only.
      className={cn(inline ? "py-2" : "lf-sectionnav sticky z-20 -mx-5 mb-6 py-2.5 backdrop-blur-xl sm:-mx-8 md:top-0", section === "plan" && "max-md:hidden")}
    >
      <div
        className={cn(
          "lf-hscroll mx-auto -my-1.5 flex gap-1.5 overflow-x-auto py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          inline ? "px-4" : "max-w-5xl px-5 sm:px-8",
        )}
      >
        {SECTIONS[section]
          .filter((item) => item.href !== "/work" || areas.work)
          .map((item) => {
            const on = isOn(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                ref={on ? activeRef : undefined}
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm whitespace-nowrap transition-colors",
                  on ? "bg-text font-medium text-bg" : "bg-surface text-text-2 shadow-soft hover:text-text",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.8} />
                {item.label}
              </Link>
            );
          })}
        {children}
      </div>
    </nav>
  );
}
