"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Settings2 } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; count?: "feedback" | "errors" | "approvals"; on: (path: string) => boolean };

const under = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** One area, five places (ADR 0027). Sub-routes light the place they belong to. */
const ITEMS: Item[] = [
  { href: "/admin", label: "Office", on: (p) => p === "/admin" || /^\/admin\/hq\/(?!marketing|settings|missions)[^/]+/.test(p) },
  { href: "/admin/work", label: "Work", count: "approvals", on: (p) => under(p, "/admin/work") || under(p, "/admin/hq/missions") },
  { href: "/admin/hq/marketing", label: "Marketing", on: (p) => under(p, "/admin/hq/marketing") },
  { href: "/admin/people", label: "People", count: "feedback", on: (p) => under(p, "/admin/people") || under(p, "/admin/users") },
  { href: "/admin/app", label: "App", count: "errors", on: (p) => under(p, "/admin/app") },
];
const SETTINGS = { href: "/admin/hq/settings", label: "Settings" };
const settingsOn = (path: string) => under(path, SETTINGS.href);
/** Admin navigation: a frosted-glass rail on wide screens, a masthead with an underline row on phones. Dots show what's waiting. */
export function AdminNav({ email, counts }: { email: string; counts: { feedback: number; errors: number; approvals: number } }) {
  const path = usePathname();
  const badge = (key?: Item["count"]) => {
    const n = key === "feedback" ? counts.feedback : key === "errors" ? counts.errors : key === "approvals" ? counts.approvals : 0;
    if (n <= 0) return null;
    // The sun for what needs the owner's yes, the sky's blue for the rest.
    return (
      <span
        className={cn(
          "tabular ml-1.5 inline-grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full px-1.5 text-[0.6875rem] leading-none font-bold",
          key === "approvals" ? "hq-dot-gold" : "bg-accent text-accent-text",
        )}
      >
        {n > 99 ? "99+" : n}
      </span>
    );
  };
  const gearOn = settingsOn(path);
  return (
    <>
      {/* Phone */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between gap-3 pt-3">
          <Link href="/admin" className="flex min-h-11 items-center gap-2.5">
            <BrandMark className="h-9 w-9" alt="" />
            <span className="font-display text-[1.375rem] leading-none font-medium">
              LifeFlow <span className="hq-eyebrow align-middle">HQ</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              aria-label="Back to the app"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-text-2"
            >
              <ArrowLeft className="h-[1.125rem] w-[1.125rem]" aria-hidden />
            </Link>
            <Link
              href={SETTINGS.href}
              aria-label={SETTINGS.label}
              aria-current={gearOn ? "page" : undefined}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border",
                gearOn ? "border-brass bg-surface text-brass-ink" : "border-border bg-surface text-text-2",
              )}
            >
              <Settings2 className="h-[1.125rem] w-[1.125rem]" aria-hidden />
            </Link>
          </div>
        </div>
        <nav
          aria-label="Admin"
          className="lf-hscroll -mx-4 mt-1 flex items-center overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
        >
          {ITEMS.map((i) => {
            const on = i.on(path);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex min-h-11 shrink-0 items-center border-b-2 px-3 text-[0.9375rem] whitespace-nowrap",
                  on ? "border-brass font-semibold text-text" : "border-transparent text-muted",
                )}
              >
                {i.label}
                {badge(i.count)}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Desktop */}
      <aside className="hq-shell-rail sticky top-0 hidden h-dvh flex-col px-4 py-6 lg:flex">
        <Link href="/admin" className="flex items-center gap-3 px-1">
          <span className="hq-rail-medal grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-brass">
            <BrandMark className="h-8 w-8" alt="" />
          </span>
          <span>
            <span className="block font-display text-[1.375rem] leading-none font-medium">LifeFlow</span>
            <span className="text-[0.625rem] tracking-[0.2em] text-brass-ink uppercase">Headquarters</span>
          </span>
        </Link>
        <nav aria-label="Admin" className="mt-7 flex flex-col gap-1 overflow-y-auto">
          {ITEMS.map((i) => {
            const on = i.on(path);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={cn("flex min-h-11 items-center rounded-xl px-3.5 text-[0.9375rem] transition-colors", on ? "hq-rail-on font-medium" : "hq-rail-off")}
              >
                {i.label}
                {badge(i.count)}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          <Link
            href={SETTINGS.href}
            aria-current={gearOn ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-[0.9375rem] transition-colors",
              gearOn ? "hq-rail-on font-medium" : "hq-rail-off",
            )}
          >
            <Settings2 className="h-[1.125rem] w-[1.125rem]" aria-hidden />
            {SETTINGS.label}
          </Link>
          <div className="flex flex-col gap-1 px-3.5">
            <p className="hq-rail-mute truncate text-xs">Signed in as {email}</p>
            <Link href="/" className="hq-rail-off inline-flex min-h-11 items-center gap-1.5 text-sm">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back to the app
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
