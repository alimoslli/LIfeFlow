import { Empty, Links, Section } from "@/components/hq/cards";
import { ContentLine, NetworkBlock, ReadMore, WaitingCard, WeekCalendar } from "@/components/hq/marketing";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { marketingView } from "@/server/services/hq-marketing";
import { safe } from "@/server/services/admin";
import { Failed, adminTz, fmt } from "../../format";
import { AdminTitle, Notice } from "../../ui";

export const metadata = { title: "Marketing" };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Marketing: what waits for the owner's yes, the calendar, research, real numbers and what went out. HQ never posts. */
export default async function Marketing({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const r = await safe("hq-marketing", () => marketingView(getDb()));
  const tz = await adminTz();
  if (!r.ok)
    return (
      <div className="flex flex-col gap-5">
        <AdminTitle title="Marketing" />
        <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{Failed()}</p>
      </div>
    );
  const v = r.data;
  // Only requests in the decision-card format can be answered (old ones are being rewritten), the same set the Office counts.
  const answerable = v.waiting.filter((w) => w.approval?.card).length;
  const scheduled = v.week.filter((c) => c.status === "scheduled").length;
  const sub =
    answerable || scheduled
      ? `${plural(answerable, "draft", "drafts")} waiting for you · ${scheduled} scheduled this week`
      : "Nothing waiting for you and nothing scheduled yet.";

  return (
    <div className="flex flex-col gap-5">
      <AdminTitle title="Marketing" sub={sub} />
      <p className="-mt-3 text-xs text-muted">HQ never posts. Approved posts go to Metricool for your final tap.</p>
      <Notice done={sp.done} error={sp.error} />

      <Section title="Waiting for you">
        {v.waiting.length ? (
          <div className="flex flex-col gap-3">
            {v.waiting.map((w) => (
              <WaitingCard key={w.content.id} content={w.content} approval={w.approval} tz={tz} />
            ))}
          </div>
        ) : (
          <Empty>No drafts yet. The marketing round adds them on Wednesdays.</Empty>
        )}
      </Section>

      <Section title="This week">
        {v.week.length ? (
          <WeekCalendar items={v.week} now={v.now} tz={tz} />
        ) : (
          <Empty>Nothing is scheduled yet. Approved drafts get a time in the next marketing round.</Empty>
        )}
        <h3 className="mt-5 mb-1 text-sm font-semibold text-text">Not scheduled yet</h3>
        {v.unscheduled.length ? (
          <div className="flex flex-col">
            {v.unscheduled.map((c) => (
              <ContentLine key={c.id} c={c} tz={tz} />
            ))}
          </div>
        ) : (
          <Empty>No ideas or drafts waiting for a date.</Empty>
        )}
      </Section>

      <Section title="Approved, waiting to go out">
        {v.queued.length ? (
          <div className="flex flex-col">
            {v.queued.map((c) => (
              <ContentLine key={c.id} c={c} tz={tz} showDate />
            ))}
          </div>
        ) : (
          <Empty>Nothing approved is waiting to go out.</Empty>
        )}
      </Section>

      <Section title="Research" sub="Findings from the researcher, with where they came from.">
        {v.research.length ? (
          <ul className="flex flex-col divide-y divide-border/60">
            {v.research.map((c) => (
              <li key={c.id} className="py-3">
                <p className="text-[0.9375rem] font-medium break-words text-text">{c.title}</p>
                <p className="text-xs text-muted">{fmt(c.createdAt, tz)}</p>
                {c.hook && <p className="mt-1 text-sm break-words text-text-2">{c.hook}</p>}
                <ReadMore label="Read more" body={c.body} />
                <Links links={c.links} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No research yet. The research round adds findings with their sources.</Empty>
        )}
      </Section>

      <Section title="Performance" sub="Real numbers from Metricool. Nothing is guessed.">
        <div className="grid gap-3 sm:grid-cols-2">
          {v.performance.map((p) => (
            <NetworkBlock key={p.network} p={p} />
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">Comments and messages: not connected yet (none of the connected tools can read them).</p>
      </Section>

      <Section title="Published" sub="The last 30 days.">
        {v.published.length ? (
          <ul className="flex flex-col divide-y divide-border/60">
            {v.published.map((c) => (
              <li key={c.id} className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="line-clamp-2 text-[0.9375rem] break-words text-text">{c.title}</p>
                  <p className="truncate text-xs text-muted">{fmt(c.scheduledFor ?? c.updatedAt, tz)}</p>
                </div>
                {c.publishedUrl?.startsWith("https://") && (
                  <a
                    href={c.publishedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center text-sm text-accent underline underline-offset-2"
                  >
                    See the post<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nothing published in the last 30 days.</Empty>
        )}
      </Section>
    </div>
  );
}
