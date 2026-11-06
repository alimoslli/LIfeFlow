import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { decideContentAction, saveControlsAction, saveDelegationsAction } from "@/app/admin/hq/actions";
import { fmt } from "@/app/admin/format";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/surface";
import { employee } from "@/server/hq/team";
import type { Approval, ContentItem, HqControls, NetworkPerformance } from "@/server/hq/types";
import { cn } from "@/lib/utils";
import { Links } from "./cards";
import { dayLabel } from "./labels";
import {
  CONTENT_STATUS_CHIP,
  CONTENT_STATUS_LABEL,
  KIND_WORD,
  NETWORK_LABEL,
  addDays,
  dayHeading,
  dayKey,
  metricLabel,
  platformsLine,
  timeOnly,
} from "./marketing-labels";

export function ContentChip({ status }: { status: ContentItem["status"] }) {
  return (
    <span className="hq-chip" data-state={CONTENT_STATUS_CHIP[status]}>
      <span className="hq-chip-dot" aria-hidden />
      {CONTENT_STATUS_LABEL[status]}
    </span>
  );
}

/** The script or text, folded away until the owner wants it. */
export function ReadMore({ label, body }: { label: string; body: string | null }) {
  if (!body) return null;
  return (
    <details className="mt-2 rounded-2xl bg-surface-2 px-3.5">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-text">{label}</summary>
      <p className="pb-3 text-sm break-words whitespace-pre-wrap text-text-2">{body}</p>
    </details>
  );
}

/** One thing that needs the owner's yes: what it is, when, the script, and Yes / No / Changes. */
export function WaitingCard({ content: c, approval, tz }: { content: ContentItem; approval: Approval | null; tz: string }) {
  const who = employee(approval?.role ?? "marketing").title;
  return (
    <article id={c.id} className="min-w-0 rounded-2xl bg-surface-2 p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{KIND_WORD[c.kind]}</Badge>
        <span className="min-w-0 text-xs text-muted">{platformsLine(c.platforms)}</span>
      </div>
      <h3 className="mt-2 text-[1.0625rem] font-semibold break-words text-text">
        <Link href={`/admin/hq/marketing/${c.id}`} className="underline-offset-2 hover:underline">
          {c.title}
        </Link>
      </h3>
      {c.hook && <p className="mt-1 text-sm break-words text-text-2">{c.hook}</p>}
      <p className="mt-1 text-xs text-muted">{c.scheduledFor ? `Planned for ${fmt(c.scheduledFor, tz)}` : "No date yet"}</p>
      <ReadMore label="Read the script" body={c.body} />
      <Links links={c.links} />
      {approval ? (
        <form action={decideContentAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="approvalId" value={approval.id} />
          <Field label="Note (optional)" htmlFor={`note-${c.id}`}>
            <Input id={`note-${c.id}`} name="note" maxLength={500} className="h-11" placeholder="Anything they should know" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="decision" value="approved" pendingText="Saving…">
              Yes
            </SubmitButton>
            <SubmitButton name="decision" value="declined" variant="secondary" pendingText="Saving…">
              No
            </SubmitButton>
            <SubmitButton name="decision" value="changes" variant="secondary" pendingText="Saving…">
              Changes
            </SubmitButton>
          </div>
          <p className="text-xs text-muted">Your answer is saved here. {who} acts on it at their next round; HQ doesn&apos;t run anything itself.</p>
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted">Nothing to answer on this one yet.</p>
      )}
    </article>
  );
}

function CalendarItem({ c, tz }: { c: ContentItem; tz: string }) {
  return (
    <Link
      href={`/admin/hq/marketing/${c.id}`}
      className="flex min-h-11 min-w-0 items-start gap-3 rounded-2xl px-2 py-2 hover:bg-surface-2 lg:flex-col lg:gap-1 lg:bg-surface-2"
    >
      {c.scheduledFor && <span className="tabular w-16 shrink-0 pt-0.5 text-xs text-muted lg:w-auto">{timeOnly(c.scheduledFor, tz)}</span>}
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="line-clamp-2 block text-[0.9375rem] break-words text-text">{c.title}</span>
        <span className="block max-w-full truncate text-xs text-muted">{platformsLine(c.platforms)}</span>
        <ContentChip status={c.status} />
      </span>
    </Link>
  );
}

/** The calendar: grouped by day on phones, one column per day (today and six more) on wide screens. One list in the page either way. */
export function WeekCalendar({ items, now, tz }: { items: ContentItem[]; now: Date; tz: string }) {
  const today = dayKey(now, tz);
  const by = new Map<string, ContentItem[]>();
  for (const c of items) {
    if (!c.scheduledFor) continue;
    const k = dayKey(c.scheduledFor, tz);
    by.set(k, [...(by.get(k) ?? []), c]);
  }
  const first7 = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const extra = [...by.keys()].filter((k) => !first7.includes(k)).sort();
  const days = [...first7, ...extra];
  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-3 lg:grid-cols-7">
      {days.map((k) => {
        const list = by.get(k) ?? [];
        return (
          <section key={k} aria-label={dayHeading(k, today)} className={cn("min-w-0", !list.length && "max-lg:hidden")}>
            <h3 className="px-2 pb-1 text-xs font-semibold text-muted">{dayHeading(k, today)}</h3>
            <div className="flex flex-col gap-1.5">
              {list.map((c) => (
                <CalendarItem key={c.id} c={c} tz={tz} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** A plain list line for things without a date, findings and published posts. */
export function ContentLine({ c, tz, showDate = false }: { c: ContentItem; tz: string; showDate?: boolean }) {
  return (
    <Link href={`/admin/hq/marketing/${c.id}`} className="flex min-h-11 min-w-0 items-center gap-3 rounded-2xl px-2 py-1.5 hover:bg-surface-2">
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-[0.9375rem] break-words text-text">{c.title}</span>
        <span className="block truncate text-xs text-muted">
          {KIND_WORD[c.kind]} · {platformsLine(c.platforms)}
          {showDate && c.scheduledFor && ` · ${fmt(c.scheduledFor, tz)}`}
        </span>
      </span>
      <ContentChip status={c.status} />
    </Link>
  );
}

const num = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

function Change({ value, previous }: { value: number; previous: number | null }) {
  if (previous === null) return null;
  const d = value - previous;
  if (d === 0) return <span className="text-xs text-muted">no change</span>;
  const up = d > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs", up ? "text-success" : "text-warning")}>
      {up ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden />}
      <span className="sr-only">{up ? "Up" : "Down"} </span>
      {num(Math.abs(d))}
    </span>
  );
}

/** One network's latest real readings, or an honest "No numbers yet". */
export function NetworkBlock({ p }: { p: NetworkPerformance }) {
  return (
    <div className="min-w-0 rounded-2xl bg-surface-2 p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">{NETWORK_LABEL[p.network]}</h3>
        {p.asOf && <span className="text-xs text-muted">as of {dayLabel(p.asOf)}</span>}
      </div>
      {p.latest.length ? (
        <ul className="mt-2 flex flex-col divide-y divide-border/60">
          {p.latest.map((m) => (
            <li key={m.metric} className="flex min-h-9 items-center justify-between gap-3 py-1">
              <span className="min-w-0 truncate text-sm text-text-2">{metricLabel(m.metric)}</span>
              <span className="flex shrink-0 items-center gap-2">
                <Change value={m.value} previous={m.previous} />
                <span className="tabular text-sm font-medium text-text">{num(m.value)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="mt-2 text-sm font-medium text-text">No numbers yet</p>
          <p className="text-xs text-muted">Connect it in Metricool</p>
        </>
      )}
    </div>
  );
}

export function Switch({ name, label, hint, on }: { name: string; label: string; hint?: string; on: boolean }) {
  return (
    <label className="relative flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-2xl px-1 py-1.5">
      <input
        type="checkbox"
        role="switch"
        name={name}
        defaultChecked={on}
        className="peer absolute inset-0 m-0 h-full min-h-11 w-full cursor-pointer appearance-none opacity-0"
      />
      <span className="min-w-0">
        <span className="block text-[0.9375rem] text-text">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-surface-3 transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ring)] after:absolute after:top-1 after:left-1 after:h-5 after:w-5 after:rounded-full after:bg-surface after:shadow-soft after:transition-transform after:content-[''] peer-checked:after:translate-x-5"
      />
    </label>
  );
}

/** "How the team runs": the owner's switches, read by every round. */
export function ControlsForm({ c, tz }: { c: HqControls; tz: string }) {
  return (
    <form action={saveControlsAction} className="flex flex-col gap-1">
      <Switch name="autonomous" label="Autonomous mode" hint="On: the scheduled rounds run. Off: every round skips." on={c.autonomous} />
      <div className="my-1 border-t border-border/60" />
      <Switch name="night" label="Night round" on={c.rounds.night} />
      <Switch name="research" label="Research round" on={c.rounds.research} />
      <Switch name="marketing" label="Marketing round" on={c.rounds.marketing} />
      <Field
        label="Higgsfield credits the marketing round may spend per week without asking"
        htmlFor="credit-budget"
        hint="0 means always ask."
        className="mt-3 sm:max-w-xs"
      >
        <Input
          id="credit-budget"
          name="creditBudget"
          type="number"
          inputMode="numeric"
          min={0}
          max={10000}
          step={1}
          defaultValue={c.creditBudget}
          className="h-11"
        />
      </Field>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Saving…">Save</SubmitButton>
        <span className="min-w-0 text-xs text-muted">
          {c.updatedAt ? `Last changed ${fmt(c.updatedAt, tz)}${c.updatedByEmail ? ` by ${c.updatedByEmail}` : ""}` : "Not changed yet."}
        </span>
      </div>
    </form>
  );
}

const NEVER_DECIDED = [
  "Deploys that aren't fixes",
  "V3 merges",
  "New features",
  "Design changes",
  "Pricing",
  "Money and credits",
  "Publishing",
  "Messages to anyone",
  "Subscriptions",
  "Deleting anything",
  "Security changes",
];

/** "What your Chief of Staff can decide": three switches, then the fixed list it never decides without the owner. */
export function DelegationsForm({ c }: { c: HqControls }) {
  const d = c.delegations;
  return (
    <>
      <form action={saveDelegationsAction} className="flex flex-col gap-1">
        <Switch name="fixOrder" label="The order of fixes" hint="Which approved fix goes first." on={d.fixOrder} />
        <Switch name="researchTopics" label="Research topics" hint="What the Monday research covers, within your priorities." on={d.researchTopics} />
        <Switch name="postingTimes" label="Posting times" hint="When an approved post goes to Metricool for your final tap." on={d.postingTimes} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <SubmitButton pendingText="Saving…">Save choices</SubmitButton>
          <span className="min-w-0 text-xs text-muted">Every round reads these before it starts.</span>
        </div>
      </form>
      <div className="mt-4 border-t border-border/60 pt-4">
        <h3 className="text-sm font-semibold text-text">Never decided without you</h3>
        <ul className="mt-2 grid list-disc gap-x-6 gap-y-1 pl-5 text-sm text-text-2 sm:grid-cols-2">
          {NEVER_DECIDED.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
