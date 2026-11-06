import Link from "next/link";
import { BudgetBody, DecisionLine, Empty, MissionLine, Section } from "@/components/hq/cards";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { weeklySummary } from "@/server/services/hq";
import { safe } from "@/server/services/admin";
import { Failed, adminTz, fmt } from "../../format";
import { AdminTitle } from "../../ui";

/** The weekly report, assembled from records by plain logic. No AI. */
export default async function Reports() {
  await requireAdmin();
  const r = await safe("hq-weekly", () => weeklySummary(getDb()));
  const tz = await adminTz();
  if (!r.ok)
    return (
      <div className="flex flex-col gap-5">
        <AdminTitle title="Reports" />
        <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{Failed()}</p>
      </div>
    );
  const w = r.data;
  const day = (d: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz }).format(d);
  return (
    <div className="flex flex-col gap-5">
      <AdminTitle title="Reports" sub={`This week: ${day(w.from)} to ${day(w.to)}`} />
      <Section title="The headline">
        {w.headline.length ? (
          <ul className="flex flex-col gap-1.5">
            {w.headline.map((h) => (
              <li key={h} className="text-[0.9375rem] text-text">
                {h}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nothing to report yet.</Empty>
        )}
      </Section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Done" sub={`${w.done.length} finished · ${w.started} started`}>
          {w.done.length ? w.done.map((m) => <MissionLine key={m.id} m={m} />) : <Empty>Nothing finished this week.</Empty>}
        </Section>
        <Section title="Blocked">{w.blocked.length ? w.blocked.map((m) => <MissionLine key={m.id} m={m} />) : <Empty>Nothing is blocked.</Empty>}</Section>
        <Section title="Due soon and overdue">
          {w.overdue.length || w.dueSoon.length ? (
            <>
              {w.overdue.length > 0 && <p className="px-2 pb-1 text-xs font-medium text-danger">Overdue</p>}
              {w.overdue.map((m) => (
                <MissionLine key={m.id} m={m} />
              ))}
              {w.dueSoon.length > 0 && <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted">Due in the next 7 days</p>}
              {w.dueSoon.map((m) => (
                <MissionLine key={m.id} m={m} />
              ))}
            </>
          ) : (
            <Empty>Nothing due soon.</Empty>
          )}
        </Section>
        <Section
          title="Decisions"
          sub={w.approvalsPending ? `${w.approvalsPending} still waiting` : undefined}
          action={
            w.approvalsPending ? (
              <Link href="/admin/hq/approvals" className="inline-flex min-h-11 items-center text-sm text-accent">
                Open the inbox
              </Link>
            ) : undefined
          }
        >
          {w.approvalsDecided.length ? (
            <ul className="flex flex-col divide-y divide-border/60">
              {w.approvalsDecided.map((a) => (
                <li key={a.id} className="py-2.5">
                  <p className="text-sm font-medium text-text">{a.title}</p>
                  <DecisionLine a={a} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No decisions this week.</Empty>
          )}
        </Section>
      </div>
      <Section title="Weekly Claude use" sub={w.budget.asOf ? `As of ${fmt(w.budget.asOf, tz)}` : undefined}>
        <BudgetBody b={w.budget} />
      </Section>
    </div>
  );
}
