import Link from "next/link";
import { cn } from "@/lib/utils";

/** iOS-style segmented control made of links: switch between closely related views. */
export function SegmentedNav({ label, items, active }: { label: string; items: { key: string; href: string; label: string }[]; active: string }) {
  return (
    <nav aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-full bg-surface-2 p-1 [scrollbar-width:none]">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={active === i.key ? "page" : undefined}
          className={cn(
            "flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors",
            active === i.key ? "bg-surface text-text shadow-soft" : "text-text-2",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export const BILLS_SUBS = [
  { key: "subs", href: "/finances/subscriptions", label: "Subscriptions" },
  { key: "bills", href: "/finances/bills", label: "Bills" },
];

export const UPDATES = [
  { key: "jarvis", href: "/jarvis/says", label: "From Jarvis" },
  { key: "filed", href: "/inbox", label: "Filed" },
];
