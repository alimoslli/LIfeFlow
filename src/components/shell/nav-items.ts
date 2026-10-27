import { BookOpen, Briefcase, CalendarDays, CheckSquare, Home, LineChart, NotebookPen, Settings, Sparkles, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { JarvisModule } from "@/server/db/schema";

export const NAV = [
  { href: "/", label: "Home", icon: Home, module: "home" },
  { href: "/jarvis", label: "Jarvis", icon: Sparkles, module: "home" },
  { href: "/finances", label: "Finances", icon: Wallet, module: "finances" },
  { href: "/wealth", label: "Wealth", icon: LineChart, module: "wealth" },
  { href: "/school", label: "School", icon: BookOpen, module: "school" },
  { href: "/work", label: "Work", icon: Briefcase, module: "work" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, module: "calendar" },
  { href: "/tasks", label: "Tasks", icon: CheckSquare, module: "tasks" },
  { href: "/notes", label: "Notes", icon: NotebookPen, module: "notes" },
  { href: "/settings", label: "Settings", icon: Settings, module: "settings" },
] as const satisfies readonly { href: string; label: string; icon: LucideIcon; module: JarvisModule }[];

export function moduleForPath(pathname: string): JarvisModule {
  const hit = NAV.filter((n) => n.href !== "/" && pathname.startsWith(n.href)).sort((a, b) => b.href.length - a.href.length)[0];
  return hit?.module ?? "home";
}

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
