"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Building2,
  Crown,
  HeartPulse,
  Kanban,
  LayoutDashboard,
  Megaphone,
  MessageSquareText,
  Settings2,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: typeof Users; count?: "feedback" | "errors" | "approvals" };

/** Two labelled groups: the HQ office, and the Founder Office (the admin that was here first, unchanged). */
const HQ_ITEMS: Item[] = [
  { href: "/admin/hq", label: "Office", icon: Building2 },
  { href: "/admin/hq/missions", label: "Missions", icon: Kanban },
  { href: "/admin/hq/approvals", label: "Approvals", icon: ShieldCheck, count: "approvals" },
  { href: "/admin/hq/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/hq/settings", label: "Settings", icon: Settings2 },
  { href: "/admin/hq/founder", label: "Founder Office", icon: Crown },
];
const ADMIN_ITEMS: Item[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/feedback", label: "Feedback", icon: MessageSquareText, count: "feedback" },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { href: "/admin/growth", label: "Growth", icon: TrendingUp },
  { href: "/admin/errors", label: "Errors", icon: AlertTriangle, count: "errors" },
  { href: "/admin/health", label: "Health", icon: HeartPulse },
  { href: "/admin/activity", label: "Activity log", icon: Activity },
];
const GROUPS = [
  { label: "HQ", items: HQ_ITEMS },
  { label: "Founder Office", items: ADMIN_ITEMS },
];

const under = (path: string, href: string) => path === href || path.startsWith(`${href}/`);
const isOn = (path: string, href: string) => {
  if (href === "/admin") return path === "/admin";
  if (href === "/admin/hq") return path === "/admin/hq" || (path.startsWith("/admin/hq/") && !HQ_ITEMS.slice(1).some((i) => under(path, i.href)));
  return under(path, href);
};

/** Admin navigation: a sidebar on wide screens, a scrolling row of pills on phones. Counts show what's waiting. */
export function AdminNav({ email, counts }: { email: string; counts: { feedback: number; errors: number; approvals: number } }) {
  const path = usePathname();
  const badge = (key?: Item["count"]) => {
    const n = key === "feedback" ? counts.feedback : key === "errors" ? counts.errors : key === "approvals" ? counts.approvals : 0;
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
          className="lf-hscroll -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pt-1 pb-3 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
        >
          {GROUPS.map((g) => (
            <div key={g.label} role="group" aria-label={g.label} className="flex shrink-0 items-center gap-1.5">
              <span aria-hidden className="pr-0.5 pl-1 text-[0.6875rem] font-semibold tracking-wide whitespace-nowrap text-muted uppercase">
                {g.label}
              </span>
              {g.items.map((i) => {
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
                    {badge(i.count)}
                  </Link>
                );
              })}
            </div>
          ))}
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
        <nav aria-label="Admin" className="mt-6 flex flex-col gap-4 overflow-y-auto">
          {GROUPS.map((g) => (
            <div key={g.label} role="group" aria-label={g.label} className="flex flex-col gap-0.5">
              <p aria-hidden className="px-3 pb-1 text-[0.6875rem] font-semibold tracking-wide text-muted uppercase">
                {g.label}
              </p>
              {g.items.map((i) => {
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
                    {badge(i.count)}
                  </Link>
                );
              })}
            </div>
          ))}
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
