import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { employee } from "@/server/hq/team";
import type { Approval, LiveItem, WaitingItem } from "@/server/hq/types";

/** "just now", "4 min ago", "2 h ago". */
export function agoLine(at: Date, now: Date): string {
  const m = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

const button = "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium";

/**
 * The top of the Office (ADR 0030): the two things the owner opens HQ for, understood in five seconds.
 * - **Needs you**: the decision cards waiting for a yes (Decide), then every chat that says it needs the owner, in its own
 *   words (Open, straight into that chat).
 * - **Working now**: one line per chat working at this moment: who, the task, what it's doing and how long ago, with
 *   Watch. From the chats' own hooks, or the hourly sync of Claude's own chat list ("checked … ago").
 * Real records only: nothing waiting, nothing listed.
 */
export function RightNow({
  items,
  waiting = [],
  approvals = [],
  pending = approvals.length,
  now,
  nextRound,
}: {
  items: LiveItem[];
  waiting?: WaitingItem[];
  /** Decision cards waiting for the owner's yes (the first few). */
  approvals?: Approval[];
  /** How many decision cards wait in all. */
  pending?: number;
  now: Date;
  nextRound: string | null;
}) {
  const needs = approvals.length + waiting.length;
  return (
    <section aria-label="Right now" className="flex flex-col gap-4 rounded-3xl bg-surface p-4 shadow-soft sm:p-5" data-testid="hq-right-now">
      <div data-testid="hq-waiting">
        <h2 className="font-display text-[1.25rem] font-medium text-text">Needs you</h2>
        {needs === 0 ? (
          <p className="mt-1 text-[0.9375rem] text-text-2">Nothing needs you right now.</p>
        ) : (
          <ul className="mt-1 flex flex-col divide-y divide-border/60">
            {approvals.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold break-words text-text">{a.title}</p>
                  <p className="text-sm text-text-2">{employee(a.role).title} asks for your yes</p>
                </div>
                <Link href={`/admin/work#${a.id}`} className={`${button} bg-accent text-accent-text`} aria-label={`Decide: ${a.title}`}>
                  Decide <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </li>
            ))}
            {waiting.map((w) => (
              <li key={w.chatId} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold break-words text-text">{w.who}</p>
                  <p className="text-sm break-words text-brass-ink">{w.needs}</p>
                </div>
                <a
                  href={w.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${button} border border-border text-text`}
                  aria-label={`Open ${w.who} in Claude`}
                >
                  Open <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}
        {pending > approvals.length && (
          <Link href="/admin/work#approvals" className="mt-1 inline-flex min-h-11 items-center text-sm text-accent">
            {pending - approvals.length} more waiting for your yes
          </Link>
        )}
      </div>

      <div className="border-t border-border/60 pt-3">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex h-2.5 w-2.5" aria-hidden>
            {items.length > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:hidden" />}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${items.length > 0 ? "bg-accent" : "bg-border"}`} />
          </span>
          <h2 className="font-display text-[1.25rem] font-medium text-text">Working now</h2>
          {items.length > 0 && <span className="text-xs text-muted">{items.length === 1 ? "1 chat working" : `${items.length} chats working`}</span>}
        </div>
        {items.length === 0 ? (
          <p className="mt-1 text-[0.9375rem] text-text-2">Nobody&apos;s working right now.{nextRound ? ` Next: ${nextRound}.` : ""}</p>
        ) : (
          <ul className="mt-1 flex flex-col divide-y divide-border/60">
            {items.map((i) => (
              <li key={i.chatId} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm break-words text-text">
                    <span className="font-semibold">{i.who}</span>
                    {i.missionTitle && (
                      <>
                        {" · "}
                        {i.missionId ? (
                          <Link href={`/admin/hq/missions/${i.missionId}`} className="underline-offset-2 hover:underline">
                            {i.missionTitle}
                          </Link>
                        ) : (
                          i.missionTitle
                        )}
                      </>
                    )}
                  </p>
                  <p className="text-sm break-words text-text-2">
                    {i.line} <span className="text-muted">· {i.relayed ? `checked ${agoLine(i.at, now)}` : agoLine(i.at, now)}</span>
                  </p>
                </div>
                <a
                  href={i.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${button} border border-border text-text-2`}
                  aria-label={`Watch ${i.who} in Claude`}
                >
                  Watch <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
