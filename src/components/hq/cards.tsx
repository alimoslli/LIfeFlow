import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, Clock, Loader2, XCircle } from "lucide-react";
import type { HqLink } from "@/server/db/schema";
import { decideAction } from "@/app/admin/hq/actions";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/surface";
import { ago } from "@/app/admin/format";
import { employee } from "@/server/hq/team";
import type { Activity, Approval, Budget, Mission, MissionStatus } from "@/server/hq/types";
import { KIND_LABEL, STATUS_LABEL, dayLabel } from "./labels";

export function Section({
  title,
  sub,
  action,
  children,
  id,
  as: Heading = "h2",
}: {
  title: string;
  sub?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
  /** "h3" when the card sits inside a page section (which has the h2). */
  as?: "h2" | "h3";
}) {
  return (
    <section id={id} className="rounded-3xl bg-surface p-4 shadow-soft sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading className="font-display text-[1.25rem] leading-tight font-medium text-text">{title}</Heading>
          {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted">{children}</p>;

/** Links that came from data: normal anchors, https ones open in a new tab. */
export function Links({ links }: { links: HqLink[] }) {
  if (!links.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {links.map((l, i) => {
        const ext = l.url.startsWith("https://");
        if (!ext && !l.url.startsWith("/")) return null;
        return (
          <li key={`${l.url}-${i}`}>
            <a
              href={l.url}
              {...(ext ? { target: "_blank", rel: "noreferrer" } : {})}
              className="inline-flex min-h-8 items-center gap-1 text-sm text-accent underline underline-offset-2"
            >
              {l.label}
              {ext && <span className="sr-only"> (opens in a new tab)</span>}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

const STATUS_ICON: Record<MissionStatus, { icon: typeof Circle; cls: string }> = {
  todo: { icon: Circle, cls: "text-muted" },
  doing: { icon: Loader2, cls: "text-accent" },
  waiting: { icon: Clock, cls: "text-warning" },
  blocked: { icon: AlertTriangle, cls: "text-warning" },
  done: { icon: CheckCircle2, cls: "text-success" },
  dropped: { icon: XCircle, cls: "text-muted" },
};
export function StatusIcon({ status }: { status: MissionStatus }) {
  const s = STATUS_ICON[status];
  return <s.icon className={`h-[1.125rem] w-[1.125rem] shrink-0 ${s.cls}`} aria-label={STATUS_LABEL[status]} role="img" />;
}

/** One mission, one line, one tap. */
export function MissionLine({ m, showOwner = true }: { m: Mission; showOwner?: boolean }) {
  return (
    <Link href={`/admin/hq/missions/${m.id}`} className="flex min-h-11 items-center gap-3 rounded-2xl px-2 py-1.5 hover:bg-surface-2">
      <StatusIcon status={m.status} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-[0.9375rem] text-text">{m.title}</span>
        <span className="block truncate text-xs text-muted">
          {showOwner && `${employee(m.role).title}`}
          {showOwner && " · "}
          {STATUS_LABEL[m.status]}
          {m.dueOn && ` · due ${dayLabel(m.dueOn)}`}
        </span>
      </span>
      {m.priority === "high" && <Badge tone="warning">High</Badge>}
    </Link>
  );
}

export function ActivityList({ items, empty = "Nothing has happened yet." }: { items: Activity[]; empty?: string }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="flex flex-col divide-y divide-border/60">
      {items.map((a) => {
        const body = (
          <>
            <span className="min-w-0 flex-1 text-sm text-text">{a.text}</span>
            <span className="shrink-0 text-xs text-muted">{ago(a.createdAt)}</span>
          </>
        );
        const href = a.missionId ? `/admin/hq/missions/${a.missionId}` : a.approvalId ? `/admin/work#${a.approvalId}` : null;
        return (
          <li key={a.id}>
            {href ? (
              <Link href={href} className="flex min-h-11 items-center gap-3 py-2">
                {body}
              </Link>
            ) : (
              <div className="flex min-h-11 items-center gap-3 py-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A short approval card for the Office and Workspace views. */
export function ApprovalMini({ a }: { a: Approval }) {
  return (
    <li className="rounded-2xl bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <Badge tone="accent">{KIND_LABEL[a.kind]}</Badge>
        <span className="text-xs text-muted">{employee(a.role).title} asks</span>
      </div>
      <p className="mt-1.5 text-[0.9375rem] font-medium text-text">{a.title}</p>
      <Link href={`/admin/work#${a.id}`} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent">
        Review <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </li>
  );
}

/** The full approval card: who asks, what, why, links, and Yes / No / Changes. */
export function ApprovalCard({ a, decide = true }: { a: Approval; decide?: boolean }) {
  const who = employee(a.role).title;
  return (
    <article id={a.id} className="scroll-mt-24 rounded-3xl bg-surface p-4 shadow-soft target:ring-2 target:ring-accent sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{KIND_LABEL[a.kind]}</Badge>
        <span className="text-xs text-muted">
          {who} asks · {ago(a.createdAt)}
        </span>
      </div>
      <h3 className="mt-2 text-[1.0625rem] font-semibold text-text">{a.title}</h3>
      <p className="mt-1 text-sm break-words whitespace-pre-wrap text-text-2">{a.summary}</p>
      <Links links={a.links} />
      {decide ? (
        <form action={decideAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="id" value={a.id} />
          <label className="flex flex-col gap-1.5 text-[0.8125rem] font-medium text-text-2">
            Note (optional)
            <input
              name="note"
              maxLength={500}
              className="h-11 w-full rounded-xl border border-border/80 bg-surface px-3.5 text-sm font-normal text-text focus:border-accent focus:ring-2 focus:ring-[var(--ring)] focus:outline-none"
              placeholder="Anything they should know"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="decision" value="approved" size="md" pendingText="Saving…">
              Yes
            </SubmitButton>
            <SubmitButton name="decision" value="declined" variant="secondary" size="md" pendingText="Saving…">
              No
            </SubmitButton>
            <SubmitButton name="decision" value="changes" variant="secondary" size="md" pendingText="Saving…">
              Changes
            </SubmitButton>
          </div>
          <p className="text-xs text-muted">Your answer is saved here. {who} acts on it at their next round; HQ doesn&apos;t run anything itself.</p>
        </form>
      ) : (
        <DecisionLine a={a} />
      )}
    </article>
  );
}

const DECISION: Record<Approval["status"], string> = {
  pending: "Waiting",
  approved: "You said yes",
  declined: "You said no",
  changes: "You asked for changes",
};

export function DecisionLine({ a }: { a: Approval }) {
  return (
    <p className="mt-3 text-sm text-text-2">
      <span className="font-medium text-text">{DECISION[a.status]}</span>
      {a.decidedAt && ` · ${ago(a.decidedAt)}`}
      {a.decisionNote && ` · “${a.decisionNote}”`}
    </p>
  );
}

/** The weekly Claude use tile body: measured share of the week, a slim bar with the 50% ceiling marker. */
export function BudgetBody({ b }: { b: Budget }) {
  if (b.weekPct === null) {
    return (
      <>
        <p className="mt-1 font-display text-[1.5rem] leading-none font-medium">Not measured yet</p>
        <p className="mt-1.5 text-xs text-text-2">Automated rounds: not measured yet</p>
      </>
    );
  }
  const pct = Math.max(0, Math.min(100, b.weekPct));
  return (
    <>
      <p className="tabular mt-1 font-display text-[2rem] leading-none font-medium">
        {b.weekPct}% <span className="font-sans text-sm font-normal text-text-2">of the week</span>
      </p>
      <div className="hq-bar" role="img" aria-label={`${b.weekPct}% of the week used, ceiling ${b.ceiling}%`}>
        <div className="hq-bar-fill" style={{ width: `${pct}%` }} />
        <div className="hq-bar-mark" style={{ left: `${b.ceiling}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-text-2">
        {b.roundsPct === null ? "Automated rounds: not measured yet" : `Automated rounds: ${b.roundsPct}% · aim 35–40%, ceiling ${b.ceiling}%`}
      </p>
    </>
  );
}
