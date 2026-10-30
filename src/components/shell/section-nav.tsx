"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  BookOpen,
  Briefcase,
  CalendarDays,
  CheckSquare,
  HeartPulse,
  Landmark,
  MessageCircle,
  NotebookPen,
  Receipt,
  Sparkles,
  Target,
  UserRound,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLifeAreas } from "./life-areas";

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean; /** Other pages that belong to this pill. */ also?: string[]; except?: string[] };
export type Section = "plan" | "money" | "jarvis" | "personal";

const SECTION_NAMES: Record<Section, string> = { plan: "Plan", jarvis: "Jarvis", money: "Money", personal: "School" };

/** Second level: each tab's pages as pills. Every page belongs to exactly one pill. */
export const SECTIONS: Record<Section, Item[]> = {
  plan: [
    { href: "/plan", label: "Calendar", icon: CalendarDays, exact: true, also: ["/calendar"] },
    { href: "/tasks", label: "To-dos", icon: CheckSquare },
    { href: "/goals", label: "Goals", icon: Target },
    { href: "/habits", label: "Health", icon: HeartPulse },
    { href: "/work", label: "Work", icon: Briefcase },
  ],
  jarvis: [
    { href: "/jarvis", label: "Chat", icon: MessageCircle, except: ["/jarvis/says", "/jarvis/memory", "/jarvis/profile"] },
    { href: "/jarvis/says", label: "Updates", icon: Sparkles, also: ["/inbox"] },
    { href: "/jarvis/profile", label: "Profile", icon: UserRound, also: ["/jarvis/memory"] },
  ],
  money: [
    {
      href: "/money",
      label: "Overview",
      icon: Wallet,
      exact: true,
      also: ["/finances/budgets", "/finances/subscriptions", "/finances/bills"],
    },
    { href: "/finances/transactions", label: "Activity", icon: Receipt, also: ["/finances/rules"] },
    { href: "/finances/accounts", label: "Accounts", icon: Landmark, also: ["/wealth"] },
  ],
  personal: [
    { href: "/school", label: "Classes", icon: BookOpen },
    { href: "/notes", label: "Notes", icon: NotebookPen },
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
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);
  if (!section) return null;
  return (
    <nav
      aria-label={`${SECTION_NAMES[section]} sections`}
      className={inline ? "py-2" : "lf-sectionnav sticky z-20 -mx-5 mb-6 py-2.5 backdrop-blur-xl sm:-mx-8 md:top-0"}
    >
      <div
        className={cn(
          "lf-hscroll mx-auto flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
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
