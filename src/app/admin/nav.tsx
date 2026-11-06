"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Building2, Clapperboard, Kanban, Settings2, Users, Gauge } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: typeof Users; count?: "feedback" | "errors" | "approvals"; on: (path: string) => boolean };

const under = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** One area, five places (ADR 0027). Sub-routes light the place they belong to. */
const ITEMS: Item[] = [
  { href: "/admin", label: "Office", icon: Building2, on: (p) => p === "/admin" || /^\/admin\/hq\/(?!marketing|settings|missions)[^/]+/.test(p) },
  { href: "/admin/work", label: "Work", icon: Kanban, count: "approvals", on: (p) => under(p, "/admin/work") || under(p, "/admin/hq/missions") },
  { href: "/admin/hq/marketing", label: "Marketing", icon: Clapperboard, on: (p) => under(p, "/admin/hq/marketing") },
  { href: "/admin/people", label: "People", icon: Users, count: "feedback", on: (p) => under(p, "/admin/people") || under(p, "/admin/users") },
  { href: "/admin/app", label: "App", icon: Gauge, count: "errors", on: (p) => under(p, "/admin/app") },
];
const SETTINGS = { href: "/admin/hq/settings", label: "Settings" };
const settingsOn = (path: string) => under(path, SETTINGS.href);
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
  const gearOn = settingsOn(path);
  return (
    <>
      {/* Phone */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between gap-3 py-3">
          <Link href="/admin" className="flex items-center gap-2">
            <BrandMark className="h-8 w-8" alt="" />
            <span className="font-display text-[1.25rem] font-medium">Admin</span>
          </Link>
          <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface px-3.5 text-sm text-text-2 shadow-soft">
            <ArrowLeft className="h-4 w-4" /> App
          </Link>
        </div>
        <nav
          aria-label="Admin"
          className="lf-hscroll -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pt-1 pb-3 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
        >
          {ITEMS.map((i) => {
            const on = i.on(path);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm whitespace-nowrap",
                  on ? "bg-text font-medium text-bg" : "bg-surface text-text-2 shadow-soft",
                )}
              >
                <i.icon className="h-4 w-4" aria-hidden />
                {i.label}
                {badge(i.count)}
              </Link>
            );
          })}
          <Link
            href={SETTINGS.href}
            aria-label={SETTINGS.label}
            aria-current={gearOn ? "page" : undefined}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
              gearOn ? "bg-text text-bg" : "bg-surface text-text-2 shadow-soft",
            )}
          >
            <Settings2 className="h-[1.125rem] w-[1.125rem]" aria-hidden />
          </Link>
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
        <nav aria-label="Admin" className="mt-6 flex flex-col gap-0.5 overflow-y-auto">
          {ITEMS.map((i) => {
            const on = i.on(path);
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
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <Link
            href={SETTINGS.href}
            aria-current={gearOn ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[0.9375rem] transition-colors",
              gearOn ? "bg-surface font-medium text-text shadow-soft" : "text-text-2 hover:bg-surface/60 hover:text-text",
            )}
          >
            <Settings2 className={cn("h-[1.125rem] w-[1.125rem]", gearOn ? "text-accent" : "text-muted")} aria-hidden />
            {SETTINGS.label}
          </Link>
          <div className="flex flex-col gap-3 px-2">
            <p className="truncate text-xs text-muted">Signed in as {email}</p>
            <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-text-2 hover:text-text">
              <ArrowLeft className="h-4 w-4" /> Back to the app
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
