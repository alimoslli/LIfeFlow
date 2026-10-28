"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  BarChart3,
  BookOpen,
  Briefcase,
  CalendarDays,
  CheckSquare,
  HeartPulse,
  Landmark,
  LayoutList,
  LineChart,
  NotebookPen,
  PieChart,
  PiggyBank,
  Receipt,
  Repeat,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean };

/** Second-level navigation: everything inside Plan or Money is one tap away. */
export const SECTIONS: Record<"plan" | "money", Item[]> = {
  plan: [
    { href: "/plan", label: "Agenda", icon: LayoutList, exact: true },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/tasks", label: "To-dos", icon: CheckSquare },
    { href: "/school", label: "Classes", icon: BookOpen },
    { href: "/work", label: "Work", icon: Briefcase },
    { href: "/notes", label: "Notes", icon: NotebookPen },
  ],
  money: [
    { href: "/money", label: "Overview", icon: Wallet, exact: true },
    { href: "/finances/transactions", label: "Transactions", icon: Receipt },
    { href: "/finances/budgets", label: "Budgets", icon: PieChart },
    { href: "/finances/bills", label: "Bills", icon: Repeat },
    { href: "/finances/goals", label: "Goals", icon: PiggyBank },
    { href: "/finances/accounts", label: "Accounts", icon: Landmark },
    { href: "/wealth", label: "Investments", icon: LineChart },
    { href: "/money/coach", label: "Coach", icon: HeartPulse },
    { href: "/money/report", label: "Reports", icon: BarChart3 },
  ],
};

const isOn = (pathname: string, i: Item) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`));

export function sectionFor(pathname: string) {
  return (Object.keys(SECTIONS) as (keyof typeof SECTIONS)[]).find((k) => SECTIONS[k].some((i) => isOn(pathname, i))) ?? null;
}

export function SectionNav() {
  const pathname = usePathname();
  const section = sectionFor(pathname);
  const activeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);
  if (!section) return null;
  return (
    <nav
      aria-label={section === "plan" ? "Plan sections" : "Money sections"}
      className="lf-sectionnav sticky z-20 -mx-5 mb-6 py-2.5 backdrop-blur-xl sm:-mx-8 md:top-0"
    >
      <div className="lf-hscroll mx-auto flex max-w-5xl gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] sm:px-8 [&::-webkit-scrollbar]:hidden">
        {SECTIONS[section].map((item) => {
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
      </div>
    </nav>
  );
}
