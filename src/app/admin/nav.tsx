"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, AlertTriangle, ArrowLeft, HeartPulse, LayoutDashboard, Megaphone, MessageSquareText, TrendingUp, Users } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/feedback", label: "Feedback", icon: MessageSquareText, count: "feedback" },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { href: "/admin/growth", label: "Growth", icon: TrendingUp },
  { href: "/admin/errors", label: "Errors", icon: AlertTriangle, count: "errors" },
  { href: "/admin/health", label: "Health", icon: HeartPulse },
  { href: "/admin/activity", label: "Activity log", icon: Activity },
] as const;

const isOn = (path: string, href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));

/** Admin navigation: a sidebar on wide screens, a scrolling row of pills on phones. Counts show what's waiting. */
export function AdminNav({ email, counts }: { email: string; counts: { feedback: number; errors: number } }) {
  const path = usePathname();
  const badge = (key?: string) => {
    const n = key === "feedback" ? counts.feedback : key === "errors" ? counts.errors : 0;
    return n > 0 ? (
      <span className="tabular ml-auto rounded-full bg-accent px-2 py-0.5 text-[0.6875rem] leading-none font-semibold text-accent-text">
        {n > 99 ? "99+" : n}
      </span>
    ) : null;
  };
  return (
    <>
      {/* Phone */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between gap-3 py-3">
          <Link href="/admin" className="flex items-center gap-2">
            <BrandMark className="h-8 w-8" alt="" />
            <span className="font-display text-[1.25rem] font-medium">Admin</span>
          </Link>
          <Link href="/" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-surface px-3.5 text-sm text-text-2 shadow-soft">
            <ArrowLeft className="h-4 w-4" /> App
          </Link>
        </div>
        <nav
          aria-label="Admin"
          className="lf-hscroll -mx-4 flex gap-1.5 overflow-x-auto px-4 pt-1 pb-3 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
        >
          {ITEMS.map((i) => {
            const on = isOn(path, i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm whitespace-nowrap",
                  on ? "bg-text font-medium text-bg" : "bg-surface text-text-2 shadow-soft",
                )}
              >
                <i.icon className="h-4 w-4" aria-hidden />
                {i.label}
                {"count" in i && badge(i.count)}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Desktop */}
      <aside className="sticky top-0 hidden h-dvh flex-col py-6 lg:flex">
        <Link href="/admin" className="flex items-center gap-2.5 px-2">
          <BrandMark className="h-9 w-9" alt="" />
          <span>
            <span className="block font-display text-[1.375rem] leading-none font-medium">LifeFlow</span>
            <span className="text-xs text-muted">Admin</span>
          </span>
        </Link>
        <nav aria-label="Admin" className="mt-8 flex flex-col gap-0.5">
          {ITEMS.map((i) => {
            const on = isOn(path, i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[0.9375rem] transition-colors",
                  on ? "bg-surface font-medium text-text shadow-soft" : "text-text-2 hover:bg-surface/60 hover:text-text",
                )}
              >
                <i.icon className={cn("h-[1.125rem] w-[1.125rem]", on ? "text-accent" : "text-muted")} aria-hidden />
                {i.label}
                {"count" in i && badge(i.count)}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-3 px-2">
          <p className="truncate text-xs text-muted">Signed in as {email}</p>
          <Link href="/" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-text-2 hover:text-text">
            <ArrowLeft className="h-4 w-4" /> Back to the app
          </Link>
        </div>
      </aside>
    </>
  );
}
