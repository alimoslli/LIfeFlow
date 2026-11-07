import Link from "next/link";
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { decideAction } from "@/app/admin/hq/actions";
import { SubmitButton } from "@/components/ui/button";
import { employee } from "@/server/hq/team";
import type { Approval, DecisionThread, Lifecycle, LifecycleStage } from "@/server/hq/types";
import { Head } from "./people";
import { KIND_LABEL } from "./labels";
import { Links } from "./cards";

/**
 * The decision card (ADR 0028): everything the owner needs to say yes or no in one place, in the order of the approved
 * picture. Server components; the answer is a plain form to decideAction. Every word here comes from the request's own
 * fields; nothing is written or guessed.
 */

const EFFORT: Record<string, string> = { small: "Small", medium: "Medium", large: "Large" };

const dayKey = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
/** "Nov 6", or "today, 9:12 am" for today. */
export function when(d: Date | null | undefined, tz: string, now: Date = new Date()): string | null {
  if (!d) return null;
  if (dayKey(d, tz) === dayKey(now, tz))
    return `today, ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(d).toLowerCase()}`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz }).format(d);
}
const dayOnly = (d: Date | null | undefined, tz: string) =>
  d ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz }).format(d) : null;

/** The department's face, small. */
export function Portrait({ role, size = 44 }: { role: Approval["role"]; size?: number }) {
  return (
    <span className="inline-flex shrink-0 overflow-hidden rounded-full bg-surface-2" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="-27 -28 54 54" width={size} height={size}>
        <Head who={role} />
      </svg>
    </span>
  );
}

const Label = ({ children }: { children: ReactNode }) => (
  <h5 className="mt-5 mb-2 flex items-center gap-3 text-[0.6875rem] font-semibold tracking-[0.12em] text-muted uppercase">
    {children}
    <span className="h-px flex-1 bg-border/70" aria-hidden />
  </h5>
);

/** v1 · Nov 5 — Your note · Nov 6 — v2 · today. The last chip is the one on the table. */
export function ThreadChips({ versions, tz, waitingFor }: { versions: Approval[]; tz: string; waitingFor?: number }) {
  const chips: { text: string; tone: "plain" | "note" | "now" | "later" }[] = [];
  versions.forEach((v, i) => {
    const last = i === versions.length - 1 && waitingFor === undefined;
    chips.push({ text: `v${v.version} · ${when(v.createdAt, tz)}`, tone: last ? "now" : "plain" });
    if (v.status === "changes" && v.decidedAt) chips.push({ text: `Your note · ${dayOnly(v.decidedAt, tz)}`, tone: "note" });
  });
  if (waitingFor !== undefined) chips.push({ text: `v${waitingFor} coming`, tone: "later" });
  const cls = {
    plain: "border-border bg-surface text-text-2",
    note: "border-warning/50 bg-warning-soft text-warning",
    now: "border-accent bg-accent text-accent-text",
    later: "border-dashed border-border-strong bg-surface text-muted",
  };
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Versions of this request">
      {chips.map((c, i) => (
        <li key={i} className="flex items-center gap-1">
          {i > 0 && <span className="h-px w-3 bg-border-strong" aria-hidden />}
          <span className={`inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-medium ${cls[c.tone]}`}>{c.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** The pictures, inline and large, each labelled. Served only to the owner. */
export function Previews({ a }: { a: Approval }) {
  const list = a.card?.previews ?? [];
  if (!list.length) return null;
  return (
    <ul className={`grid gap-4 ${list.length > 1 ? "sm:grid-cols-2" : ""}`}>
      {list.map((p, i) => (
        <li key={p.fileId} className="flex flex-col items-center gap-2">
          <a href={`/admin/hq/files/${p.fileId}`} target="_blank" rel="noreferrer" className="block w-full">
            {/* eslint-disable-next-line @next/next/no-img-element -- owner-only picture from our own route */}
            <img
              src={`/admin/hq/files/${p.fileId}`}
              alt={p.label ? `${p.label}: picture ${i + 1} of ${list.length}` : `Picture ${i + 1} of ${list.length}`}
              loading="lazy"
              className="mx-auto max-h-[34rem] w-full rounded-2xl border border-border/70 bg-surface-2 object-contain"
            />
            <span className="sr-only"> (opens the picture full size in a new tab)</span>
          </a>
          {p.label && <span className="text-sm font-medium text-text-2">{p.label}</span>}
        </li>
      ))}
    </ul>
  );
}

function Header({ a, tz, aside }: { a: Approval; tz: string; aside?: ReactNode }) {
  const who = employee(a.role).title;
  return (
    <div className="flex items-center gap-3">
      <Portrait role={a.role} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9375rem] font-semibold text-text">{who}</p>
        <p className="text-xs text-muted">
          asks · {when(a.createdAt, tz)} · {KIND_LABEL[a.kind]}
        </p>
      </div>
      {aside}
    </div>
  );
}

/** A request waiting for the owner's answer. */
export function DecisionCard({ thread, tz }: { thread: DecisionThread; tz: string }) {
  const a = thread.latest;
  const c = a.card;
  if (!c) return null;
  const who = employee(a.role).title;
  const prev = thread.versions.length > 1 ? thread.versions[thread.versions.length - 2] : null;
  return (
    <article
      id={a.id}
      aria-labelledby={`t-${a.id}`}
      className="scroll-mt-24 rounded-3xl border border-warning/30 bg-surface p-4 shadow-soft target:ring-2 target:ring-accent sm:p-6"
    >
      <Header
        a={a}
        tz={tz}
        aside={
          a.version > 1 ? (
            <span className="rounded-full bg-accent-soft px-3 py-1 text-[0.6875rem] font-semibold tracking-wide text-accent uppercase">
              Version {a.version}
            </span>
          ) : (
            <span className="rounded-full bg-warning-soft px-3 py-1 text-[0.6875rem] font-semibold tracking-wide text-warning uppercase">New</span>
          )
        }
      />
      <h4 id={`t-${a.id}`} className="mt-3 font-display text-[1.5rem] leading-tight font-medium text-text">
        {a.title}
      </h4>

      {a.version > 1 && (
        <div className="mt-4 rounded-2xl border border-border bg-accent-soft/60 p-4">
          <h5 className="font-display text-[1.0625rem] font-medium text-text">What changed since your note</h5>
          {prev?.decisionNote && (
            <p className="mt-1 text-sm text-text-2 italic">
              “{prev.decisionNote}” <span className="not-italic">— you{prev.decidedAt ? `, ${dayOnly(prev.decidedAt, tz)}` : ""}</span>
            </p>
          )}
          <p className="mt-2 text-[0.9375rem] break-words whitespace-pre-wrap text-text">{a.changedSinceNote}</p>
        </div>
      )}
      {thread.versions.length > 1 && (
        <div className="mt-3">
          <ThreadChips versions={thread.versions} tz={tz} />
        </div>
      )}

      <Label>Why</Label>
      <p className="text-[0.9375rem] break-words whitespace-pre-wrap text-text">{c.why}</p>

      <Label>What it will look like</Label>
      <Previews a={a} />

      <Label>Exactly what changes</Label>
      <ul className="flex flex-col gap-2">
        {c.changes.map((line, i) => (
          <li key={i} className="flex gap-3 text-[0.9375rem] text-text">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            <span className="min-w-0 break-words">{line}</span>
          </li>
        ))}
      </ul>

      <Label>What happens next</Label>
      <div className="flex flex-col gap-3">
        <div className="rounded-2xl border border-border bg-accent-soft/50 p-4">
          <p className="text-[0.9375rem] font-semibold text-text">If you say yes</p>
          <p className="mt-1 text-[0.9375rem] break-words whitespace-pre-wrap text-text">{c.onYes}</p>
        </div>
        <div className="rounded-2xl border border-border p-4">
          <p className="text-[0.9375rem] font-semibold text-text">If you say no</p>
          <p className="mt-1 text-[0.9375rem] break-words whitespace-pre-wrap text-text-2">{c.onNo}</p>
        </div>
      </div>

      <Label>Effort and risk</Label>
      <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-2 text-[0.9375rem]">
        <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Effort</dt>
        <dd className="text-text">{EFFORT[c.effort]}</dd>
        <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Risk</dt>
        <dd className="text-text">{c.risk}</dd>
      </dl>
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-soft/60 p-4">
        <Portrait role={a.role} size={36} />
        <p className="min-w-0 text-[0.9375rem] break-words text-text">
          <span className="font-semibold">{who} recommends:</span> {c.recommendation}
        </p>
      </div>
      <Links links={a.links} />

      <form action={decideAction} className="mt-6 flex flex-col gap-3 border-t border-border/70 pt-5">
        <input type="hidden" name="id" value={a.id} />
        <label className="flex flex-col gap-1.5 text-[0.8125rem] font-medium text-text-2">
          <span id={`n-${a.id}`}>
            Want something different? Tell {who} what to change. It comes back as version {a.version + 1}.
          </span>
          <textarea
            name="note"
            maxLength={500}
            rows={3}
            aria-labelledby={`n-${a.id}`}
            className="w-full rounded-2xl border border-border/80 bg-surface px-3.5 py-2.5 text-[0.9375rem] font-normal text-text placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-[var(--ring)] focus:outline-none"
            placeholder="Your note (needed only for Send changes)"
          />
        </label>
        <SubmitButton name="decision" value="approved" size="md" pendingText="Saving…" className="min-h-12 w-full">
          Yes, go
        </SubmitButton>
        <div className="grid grid-cols-2 gap-3">
          <SubmitButton name="decision" value="changes" variant="secondary" size="md" pendingText="Saving…" className="min-h-12">
            Send changes
          </SubmitButton>
          <SubmitButton name="decision" value="declined" variant="secondary" size="md" pendingText="Saving…" className="min-h-12">
            No
          </SubmitButton>
        </div>
        <p className="text-xs text-muted">Your answer is saved here. {who} acts on it at their next round; HQ doesn&apos;t run anything itself.</p>
      </form>
    </article>
  );
}

const STEPS: { stage: LifecycleStage; label: string }[] = [
  { stage: "approved", label: "Approved" },
  { stage: "built", label: "Being built" },
  { stage: "look", label: "Ready for your look" },
  { stage: "live", label: "Live" },
];

/** Approved, Being built, Ready for your look, Live, each with the date it happened. */
export function LifecycleSteps({ lc, tz }: { lc: Lifecycle; tz: string }) {
  const cur = STEPS.findIndex((s) => s.stage === lc.stage);
  return (
    <ol className="grid grid-cols-4 text-center" aria-label="Where this is">
      {STEPS.map((s, i) => {
        const d = dayOnly(lc.dates[s.stage], tz);
        const reached = i <= cur;
        return (
          <li key={s.stage} className="relative flex flex-col items-center gap-1 px-1" aria-current={i === cur ? "step" : undefined}>
            {i > 0 && <span className={`absolute top-[0.6875rem] right-1/2 left-0 h-0.5 ${i <= cur ? "bg-accent" : "bg-border"}`} aria-hidden />}
            {i < STEPS.length - 1 && <span className={`absolute top-[0.6875rem] right-0 left-1/2 h-0.5 ${i < cur ? "bg-accent" : "bg-border"}`} aria-hidden />}
            <span
              className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 ${reached ? "border-accent bg-accent text-accent-text" : "border-border-strong bg-surface"} ${i === cur ? "ring-4 ring-accent/20" : ""}`}
              aria-hidden
            >
              {reached && i < cur && <Check className="h-3.5 w-3.5" />}
            </span>
            <span className={`text-xs leading-tight font-medium ${reached ? "text-text" : "text-muted"}`}>{s.label}</span>
            <span className="min-h-4 text-[0.6875rem] text-muted">{reached ? (d ?? "date not recorded") : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** After a yes the same card keeps reporting: where the work is, with dates and a link. */
export function ProgressCard({ thread, tz }: { thread: DecisionThread; tz: string }) {
  const a = thread.latest;
  const lc = thread.lifecycle;
  if (!lc) return null;
  const live = lc.stage === "live";
  const links = lc.mission?.links ?? [];
  const note = lc.stopped
    ? `Stopped: ${lc.stopped}. Your COO will start new work for it.`
    : lc.mission?.status === "blocked"
      ? `Stuck: ${lc.mission.blockedReason ?? "waiting on something"}`
      : live
        ? (lc.mission?.result ?? "Done and live.")
        : lc.stage === "look"
          ? "Ready for you to look at before anyone else sees it."
          : lc.stage === "built"
            ? "Being built on its own branch. You get pictures to okay before it goes live."
            : lc.mission
              ? "Approved. Work hasn't started yet."
              : "Approved. Your COO will start the work at the next round.";
  return (
    <article id={a.id} aria-labelledby={`t-${a.id}`} className="scroll-mt-24 rounded-3xl bg-surface p-4 shadow-soft target:ring-2 target:ring-accent sm:p-5">
      <Header
        a={a}
        tz={tz}
        aside={
          <span
            className={`rounded-full px-3 py-1 text-[0.6875rem] font-semibold tracking-wide uppercase ${live ? "bg-success-soft text-success" : "bg-accent-soft text-accent"}`}
          >
            {live ? "Live" : STEPS.find((s) => s.stage === lc.stage)?.label}
          </span>
        }
      />
      <h4 id={`t-${a.id}`} className="mt-3 font-display text-[1.25rem] leading-tight font-medium text-text">
        {a.title}
      </h4>
      <div className="mt-4">
        <LifecycleSteps lc={lc} tz={tz} />
      </div>
      <p className="mt-4 text-sm break-words text-text-2">{note}</p>
      <Links links={links} />
      <div className="mt-3 flex flex-wrap gap-x-4">
        {lc.mission && (
          <Link
            href={`/admin/hq/missions/${lc.mission.id}`}
            className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline underline-offset-2"
          >
            {live ? "See what changed" : "See the work"}
          </Link>
        )}
      </div>
    </article>
  );
}

/** An ask sent back with the owner's note: it stays on the desk until the next version arrives. */
export function RevisingCard({ thread, tz }: { thread: DecisionThread; tz: string }) {
  const a = thread.latest;
  const who = employee(a.role).title;
  return (
    <article id={a.id} className="scroll-mt-24 rounded-3xl bg-surface p-4 shadow-soft target:ring-2 target:ring-accent sm:p-5">
      <Header
        a={a}
        tz={tz}
        aside={<span className="rounded-full bg-warning-soft px-3 py-1 text-[0.6875rem] font-semibold tracking-wide text-warning uppercase">With {who}</span>}
      />
      <h4 className="mt-3 font-display text-[1.25rem] leading-tight font-medium text-text">{a.title}</h4>
      <div className="mt-3">
        <ThreadChips versions={thread.versions} tz={tz} waitingFor={a.version + 1} />
      </div>
      <p className="mt-3 text-sm break-words text-text-2">
        You sent it back{a.decidedAt ? ` on ${dayOnly(a.decidedAt, tz)}` : ""}: “{a.decisionNote}”. {who} sends version {a.version + 1} at their next round.
      </p>
    </article>
  );
}

/** An old request with no decision card: no buttons, not counted. Your COO rewrites it in the new format. */
export function RewritingLine({ a, tz }: { a: Approval; tz: string }) {
  return (
    <li id={a.id} className="flex items-center gap-3 py-3">
      <Portrait role={a.role} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium break-words text-text">{a.title}</span>
        <span className="block text-xs text-muted">Being rewritten by your COO · asked {dayOnly(a.createdAt, tz)}</span>
      </span>
    </li>
  );
}
