import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ children, className, as: As = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <As className={cn("rounded-3xl bg-surface shadow-soft", className)}>{children}</As>;
}

export function CardHeader({ title, action, subtitle, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-4 pb-2", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-text">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-sm text-muted">{eyebrow}</p>}
        <h1 className="font-display text-[38px] leading-tight font-medium tracking-tight text-text">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 [&>*]:shrink-0">{actions}</div>}
    </header>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-muted [&_svg]:h-6 [&_svg]:w-6">{icon}</div>}
      <p className="text-sm font-medium text-text">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

type Tone = "neutral" | "accent" | "danger" | "warning" | "success" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-text-2",
  accent: "bg-accent-soft text-accent",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
};

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

/** Labels where data came from, so demo / manual / synced records are never confused. */
export function SourceBadge({ source }: { source: string }) {
  // Demo records only exist in demo accounts, which show a banner instead of tagging every row.
  if (source === "demo") return null;
  const map: Record<string, { label: string; tone: Tone }> = {
    demo: { label: "Sample data", tone: "warning" },
    manual: { label: "Manual", tone: "neutral" },
    jarvis: { label: "Added by Jarvis", tone: "accent" },
    import: { label: "Imported", tone: "info" },
    plaid: { label: "Synced · Plaid", tone: "success" },
    canvas: { label: "Synced · Canvas", tone: "success" },
    ukg: { label: "Synced · UKG", tone: "success" },
    detected: { label: "Detected", tone: "info" },
  };
  const m = map[source] ?? { label: source, tone: "neutral" as Tone };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function Progress({ value, tone = "accent", className, label }: { value: number; tone?: "accent" | "danger" | "warning"; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-accent";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs text-muted">{label}</p>
      <p className="tabular mt-0.5 truncate text-xl font-semibold tracking-tight text-text">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Tabs({ items, current }: { items: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <nav className="-mx-1 mb-6 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Sections">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={i.key === current ? "page" : undefined}
          className={cn(
            "rounded-full px-4 py-2 text-sm whitespace-nowrap transition-colors",
            i.key === current ? "bg-text font-medium text-bg" : "bg-surface text-text-2 shadow-soft hover:text-text",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function Money({ cents, signed, className, compact }: { cents: number; signed?: boolean; className?: string; compact?: boolean }) {
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", signDisplay: signed ? "exceptZero" : "auto", notation: compact ? "compact" : "standard", minimumFractionDigits: compact ? 0 : 2, maximumFractionDigits: compact ? 1 : 2 });
  return <span className={cn("tabular", signed && cents > 0 && "text-success", className)}>{fmt.format(cents / 100)}</span>;
}
