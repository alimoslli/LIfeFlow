import { cookies } from "next/headers";
import { Card } from "@/components/ui/surface";
import { adminTz } from "@/app/admin/format";
import { getDb } from "@/server/db/client";
import { employee } from "@/server/hq/team";
import type { SinceLine } from "@/server/hq/types";
import { runningLine } from "@/server/hq/running-line";
import { errorsLast24h, health, overview, safe } from "@/server/services/admin";
import { LOOKED_COOKIE, sinceFrom, sinceLooked } from "@/server/services/hq-summary";
import { MarkLooked } from "./mark-looked";
import Link from "next/link";

const Group = ({ title, items }: { title: string; items: SinceLine[] }) =>
  items.length ? (
    <div>
      <h3 className="text-[0.6875rem] font-semibold tracking-[0.12em] text-muted uppercase">{title}</h3>
      <ul className="mt-1.5 flex flex-col">
        {items.map((l, i) => (
          <li key={`${l.text}-${i}`} className="flex min-h-11 items-center gap-3 border-b border-border/50 py-2 last:border-b-0">
            <span className="min-w-0 flex-1">
              {l.href ? (
                <Link href={l.href} className="text-[0.9375rem] break-words text-text hover:underline">
                  {l.text}
                </Link>
              ) : (
                <span className="text-[0.9375rem] break-words text-text">{l.text}</span>
              )}
              {l.role && <span className="block text-xs text-muted">{employee(l.role).title}</span>}
            </span>
            {l.commitUrl && (
              <a
                href={l.commitUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 shrink-0 items-center text-sm text-accent underline underline-offset-2"
              >
                Commit<span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  ) : null;

/**
 * "Since you last looked" (ADR 0028), from real HQ records only: what was fixed without needing a yes, what the checkers
 * found, what reached the app, and one calm line on how it is running. The window starts at the owner's last visit (a
 * cookie the page sets after it renders), or the last 7 days on a first visit. Each part loads on its own.
 */
export async function SinceLookedCard() {
  const now = new Date();
  const seen = (await cookies()).get(LOOKED_COOKIE)?.value;
  const since = sinceFrom(seen, now);
  const db = getDb();
  const [r, errs, ov, h, tz] = await Promise.all([
    safe("hq-since", () => sinceLooked(db, since)),
    safe("hq-since-errors", () => errorsLast24h(db)),
    safe("hq-since-overview", () => overview(db)),
    safe("hq-since-health", () => health(db)),
    adminTz(),
  ]);
  const running = runningLine({
    errors: errs.ok ? errs.data : null,
    signups: ov.ok ? ov.data : null,
    notSetUp: h.ok ? h.data.integrations.filter((i) => !i.on).map((i) => i.name) : null,
  });
  const lists = r.ok ? r.data : null;
  const quiet = lists && !lists.fixed.length && !lists.found.length && !lists.changed.length;
  const from = seen
    ? `Since ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz }).format(since)}`
    : "The last 7 days";
  return (
    <section aria-labelledby="since-title">
      <Card as="div" className="p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 id="since-title" className="font-display text-[1.25rem] font-medium text-text">
            Since you last looked
          </h2>
          <p className="text-xs text-muted">{from}</p>
        </div>
        <div className="mt-3 flex flex-col gap-4">
          {!r.ok && <p className="text-sm text-muted">Couldn&apos;t load what changed. Reload to try again.</p>}
          {quiet && <p className="text-[0.9375rem] text-text-2">Quiet since you last looked.</p>}
          {lists && <Group title="Fixed for you" items={lists.fixed} />}
          {lists && <Group title="Found" items={lists.found} />}
          {lists && <Group title="What changed in the app" items={lists.changed} />}
          {running && (
            <div>
              <h3 className="text-[0.6875rem] font-semibold tracking-[0.12em] text-muted uppercase">How the app is running</h3>
              <p className="mt-1.5 text-[0.9375rem] text-text-2">{running}</p>
            </div>
          )}
        </div>
      </Card>
      {r.ok && <MarkLooked name={LOOKED_COOKIE} />}
    </section>
  );
}
