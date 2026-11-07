import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { LiveItem } from "@/server/hq/types";

/** "just now", "4 min ago", "2 h ago". */
export function agoLine(at: Date, now: Date): string {
  const m = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

/**
 * "Right now" (Live HQ, ADR 0030): one line per chat working at this moment, from its own hooks: the department, the task,
 * what it's doing and how long ago it said so, with Watch to open the chat. Real records only: nobody busy, nobody listed.
 */
export function RightNow({ items, now, nextRound }: { items: LiveItem[]; now: Date; nextRound: string | null }) {
  return (
    <section aria-labelledby="hq-right-now" className="rounded-3xl bg-surface p-4 shadow-soft" data-testid="hq-right-now">
      <div className="flex items-center gap-2">
        <span className="relative inline-flex h-2.5 w-2.5" aria-hidden>
          {items.length > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:hidden" />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${items.length > 0 ? "bg-accent" : "bg-border"}`} />
        </span>
        <h2 id="hq-right-now" className="text-sm font-semibold text-text">
          Right now
        </h2>
        {items.length > 0 && <span className="text-xs text-muted">{items.length === 1 ? "1 chat working" : `${items.length} chats working`}</span>}
      </div>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-text-2">Nobody&apos;s working right now.{nextRound ? ` Next: ${nextRound}.` : ""}</p>
      ) : (
        <ul className="mt-1 flex flex-col divide-y divide-border/60">
          {items.map((i) => (
            <li key={i.chatId} className="flex items-center gap-3 py-2">
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
                  {i.line} <span className="text-muted">· {agoLine(i.at, now)}</span>
                </p>
              </div>
              <a
                href={i.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm text-text-2"
                aria-label={`Watch ${i.who} in Claude`}
              >
                Watch <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
