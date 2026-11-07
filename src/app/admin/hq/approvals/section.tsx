import { DecisionCard, ProgressCard, RevisingCard, RewritingLine } from "@/components/hq/decision-card";
import { Empty, Section } from "@/components/hq/cards";
import { getDb } from "@/server/db/client";
import { employee } from "@/server/hq/team";
import type { DecisionThread } from "@/server/hq/types";
import { listDecisionThreads } from "@/server/services/hq";
import { safe } from "@/server/services/admin";
import { Failed, adminTz } from "../../format";
import { PageSection } from "../../ui";

const byNewest = (a: DecisionThread, b: DecisionThread) => b.latest.createdAt.getTime() - a.latest.createdAt.getTime();
const byOldest = (a: DecisionThread, b: DecisionThread) => a.latest.createdAt.getTime() - b.latest.createdAt.getTime();
const byDecided = (a: DecisionThread, b: DecisionThread) => (b.latest.decidedAt?.getTime() ?? 0) - (a.latest.decidedAt?.getTime() ?? 0);

/** Your desk (ADR 0028): decisions waiting first, then what is being built, then what is live. A part of the Work page. */
export async function ApprovalsSection() {
  const [r, tz] = await Promise.all([safe("hq-threads", () => listDecisionThreads(getDb())), adminTz()]);
  if (!r.ok)
    return (
      <PageSection id="approvals" title="Needs your yes" sub="Things your team won't do without your yes.">
        <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{Failed()}</p>
      </PageSection>
    );
  const { threads, rewriting } = r.data;
  const waiting = threads.filter((t) => t.state === "waiting").sort(byOldest);
  const revising = threads.filter((t) => t.state === "revising").sort(byNewest);
  const building = threads.filter((t) => t.state === "approved" && t.lifecycle?.stage !== "live").sort(byDecided);
  const live = threads
    .filter((t) => t.lifecycle?.stage === "live")
    .sort(byDecided)
    .slice(0, 10);
  const closed = threads
    .filter((t) => t.state === "declined")
    .sort(byDecided)
    .slice(0, 10);
  const sub = waiting.length
    ? `${waiting.length} ${waiting.length === 1 ? "decision" : "decisions"} waiting. Everything else is moving on its own.`
    : "Nothing waiting for you. Everything else is moving on its own.";
  return (
    <PageSection id="approvals" title="Needs your yes" sub={sub}>
      <div className="flex flex-col gap-3">
        <h3 className="font-display text-[1.25rem] font-medium">Waiting for you</h3>
        {waiting.length ? (
          <div className="flex flex-col gap-4">
            {waiting.map((t) => (
              <DecisionCard key={t.threadId} thread={t} tz={tz} />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl bg-surface p-4 shadow-soft sm:p-5">
            <p className="text-[0.9375rem] font-semibold text-text">Nothing waiting for you.</p>
            <Empty>When your team needs a yes, it arrives here with the picture and the exact steps.</Empty>
          </div>
        )}
      </div>

      {rewriting.length > 0 && (
        <Section
          title="Being rewritten"
          sub="Old requests. Your COO rewrites each one with a picture and clear steps. They don't need your answer yet."
          as="h3"
        >
          <ul className="divide-y divide-border/60">
            {rewriting.map((a) => (
              <RewritingLine key={a.id} a={a} tz={tz} />
            ))}
          </ul>
        </Section>
      )}

      {(revising.length > 0 || building.length > 0) && (
        <div className="flex flex-col gap-3">
          <h3 className="font-display text-[1.25rem] font-medium">In progress</h3>
          {revising.map((t) => (
            <RevisingCard key={t.threadId} thread={t} tz={tz} />
          ))}
          {building.map((t) => (
            <ProgressCard key={t.threadId} thread={t} tz={tz} />
          ))}
        </div>
      )}

      {live.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="font-display text-[1.25rem] font-medium">Live</h3>
          {live.map((t) => (
            <ProgressCard key={t.threadId} thread={t} tz={tz} />
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <Section title="Said no" sub="These are closed." as="h3">
          <ul className="flex flex-col divide-y divide-border/60">
            {closed.map((t) => (
              <li key={t.threadId} className="py-3 text-sm">
                <span className="font-medium text-text">{t.latest.title}</span>
                <span className="text-muted"> · {employee(t.role).title}</span>
                {t.latest.decisionNote && <span className="block text-text-2">“{t.latest.decisionNote}”</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </PageSection>
  );
}
