import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Page title for admin pages. */
export function AdminTitle({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-[2rem] leading-tight font-medium tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-text-2">{sub}</p>}
      </div>
      {action}
    </header>
  );
}

/** A big number that links to where it's explained. */
export function Tile({ label, value, sub, href, tone }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; tone?: "attention" }) {
  const body = (
    <>
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("tabular mt-1 font-display text-[2rem] leading-none font-medium", tone === "attention" && "text-accent")}>{value}</p>
      {sub && <p className="mt-1.5 truncate text-xs text-text-2">{sub}</p>}
    </>
  );
  const cls = "block min-w-0 rounded-3xl bg-surface p-4 shadow-soft";
  return href ? (
    <Link href={href} className={cn(cls, "transition-shadow hover:shadow-lift")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Success / error notes after an action (from ?done= / ?error=). */
export function Notice({ done, error }: { done?: string; error?: string }) {
  return (
    <>
      {done && <p className="mb-4 rounded-2xl bg-success-soft px-4 py-3 text-sm text-success">{done.slice(0, 200)}</p>}
      {error && <p className="mb-4 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{error.slice(0, 300)}</p>}
    </>
  );
}

/** A named part of a page: an h2 with an anchor id, so a page can hold several parts without tabs. */
export function PageSection({ id, title, sub, action, children }: { id: string; title: string; sub?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-6 flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="font-display text-[1.5rem] leading-tight font-medium tracking-tight">
            {title}
          </h2>
          {sub && <p className="mt-1 text-sm text-text-2">{sub}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
