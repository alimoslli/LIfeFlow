import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { ActivityList, ApprovalMini, BudgetBody, Empty, MissionLine, Section } from "@/components/hq/cards";
import { countsLine, greeting } from "@/components/hq/labels";
import { OfficeScene } from "@/components/hq/office-scene";
import { StateChip } from "@/components/hq/status-chip";
import { requireAdmin } from "@/server/auth/require-admin";
import { getSessionUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { officeSnapshot } from "@/server/services/hq";
import { safe } from "@/server/services/admin";
import { cn } from "@/lib/utils";
import { Failed, adminTz, fmt } from "../format";
import { Tile } from "../ui";

export const metadata = { title: "HQ" };

/** LifeFlow HQ: the office (a drawn building with a room per person) or a plain workspace list, from one snapshot. */
export default async function HqHome({ searchParams }: { searchParams: Promise<{ view?: string; done?: string; error?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const view = sp.view === "workspace" ? "workspace" : "office";
  const r = await safe("hq-office", () => officeSnapshot(getDb()));
  const user = await getSessionUser();
  const tz = await adminTz();

  if (!r.ok)
    return (
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-[2rem] leading-tight font-medium tracking-tight">LifeFlow HQ</h1>
        <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{Failed()}</p>
      </div>
    );
  const s = r.data;
  const first = user?.name?.trim().split(/\s+/)[0] || "Founder";
  const counts = countsLine(s.counts);
  const b = s.budget;
  const n = s.founder.pendingApprovals;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[2rem] leading-tight font-medium tracking-tight">
            {greeting(s.now, tz)}, {first}.
          </h1>
          <p className="mt-1 text-sm text-text-2">{counts || "Everyone is quiet."}</p>
        </div>
        <nav aria-label="View" className="inline-flex rounded-full bg-surface-2 p-1">
          {(
            [
              ["office", "Office", "/admin/hq"],
              ["workspace", "Workspace", "/admin/hq?view=workspace"],
            ] as const
          ).map(([key, label, href]) => (
            <Link
              key={key}
              href={href}
              aria-current={view === key ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center rounded-full px-4 text-sm",
                view === key ? "bg-surface font-medium text-text shadow-soft" : "text-text-2",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile
          label="Needs your yes"
          value={n}
          sub={n === 0 ? "Nothing waiting for you." : "Open the inbox"}
          href="/admin/hq/approvals"
          tone={n > 0 ? "attention" : undefined}
        />
        <Tile label="Done in the last 7 days" value={s.doneThisWeek} sub="See the weekly report" href="/admin/hq/reports" />
        <div className="min-w-0 rounded-3xl bg-surface p-4 shadow-soft">
          <p className="text-xs text-muted">Weekly Claude use</p>
          <BudgetBody b={b} />
          {b.asOf && <p className="mt-1 text-[0.6875rem] text-muted">As of {fmt(b.asOf, tz)}</p>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="min-w-0 lg:order-1">
          {view === "office" ? (
            <OfficeScene snapshot={s} />
          ) : (
            <div className="flex flex-col gap-3">
              {s.employees.map((e) => (
                <article key={e.role} className="rounded-3xl bg-surface p-4 shadow-soft">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-[1.0625rem] font-semibold">{e.title}</h2>
                    <StateChip state={e.state} />
                  </div>
                  <p className="mt-1 text-sm text-text-2">{e.line}</p>
                  {e.currentMission && (
                    <p className="mt-1 text-xs text-muted">
                      Current mission:{" "}
                      <Link href={`/admin/hq/missions/${e.currentMission.id}`} className="text-text-2 underline underline-offset-2">
                        {e.currentMission.title}
                      </Link>
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
                    {e.primaryChat ? (
                      <a
                        href={e.primaryChat.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent"
                      >
                        Open chat <ExternalLink className="h-4 w-4" aria-hidden />
                        <span className="sr-only">for {e.title} (opens in a new tab)</span>
                      </a>
                    ) : (
                      <span className="text-sm text-muted">{e.role === "assistant" ? "Plain app logic, no chat" : "No chat connected yet"}</span>
                    )}
                    <Link href={`/admin/hq/${e.role}`} className="inline-flex min-h-11 items-center text-sm text-text-2 underline underline-offset-2">
                      {e.title} workspace
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-5 lg:order-2">
          <Section
            title="Needs your yes"
            action={
              n > 0 ? (
                <Link href="/admin/hq/approvals" className="inline-flex min-h-11 items-center text-sm text-accent">
                  View all
                </Link>
              ) : undefined
            }
          >
            {s.approvals.length ? (
              <ul className="flex flex-col gap-2">
                {s.approvals.slice(0, 3).map((a) => (
                  <ApprovalMini key={a.id} a={a} />
                ))}
              </ul>
            ) : (
              <Empty>Nothing waiting for you.</Empty>
            )}
          </Section>
          <Section title="Recent activity">
            <ActivityList items={s.activity.slice(0, 6)} />
          </Section>
        </aside>
      </div>

      <Section
        title="This week's missions"
        action={
          <Link href="/admin/hq/missions" className="inline-flex min-h-11 items-center text-sm text-accent">
            Open the board
          </Link>
        }
      >
        {s.weekMissions.length ? (
          <ul className="grid gap-x-4 sm:grid-cols-2 xl:grid-cols-4">
            {s.weekMissions.map((m) => (
              <li key={m.id}>
                <MissionLine m={m} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No missions yet. Add one on the Missions page.</Empty>
        )}
      </Section>
    </div>
  );
}
