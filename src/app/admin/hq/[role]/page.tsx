import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { ActivityList, ApprovalMini, Empty, MissionLine, Section } from "@/components/hq/cards";
import { CopyAndOpen } from "@/components/hq/copy-open";
import { StateChip } from "@/components/hq/status-chip";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { isHqRole } from "@/server/hq/team";
import { employeeDetail } from "@/server/services/hq";
import { safe } from "@/server/services/admin";
import { Failed, adminTz, ago, fmt } from "../../format";
import { Notice } from "../../ui";
import { Badge } from "@/components/ui/surface";

/** One employee's workspace: state, jobs, their chat(s), missions, approvals and activity. No animated character here. */
export default async function EmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ role: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  await requireAdmin();
  const { role } = await params;
  if (!isHqRole(role)) notFound();
  const sp = await searchParams;
  const r = await safe("hq-employee", () => employeeDetail(getDb(), role));
  const tz = await adminTz();
  if (!r.ok) return <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{Failed()}</p>;
  const d = r.data;
  const c = d.card;
  const mission = c.currentMission ?? d.current[0] ?? d.pending[0] ?? null;
  const handoff = mission ? `${mission.title}${mission.detail ? `\n\n${mission.detail}` : ""}` : "";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <Link href="/admin/hq" className="inline-flex min-h-11 items-center text-sm text-text-2">
          ← Back to the office
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[2rem] leading-tight font-medium tracking-tight">{c.title}</h1>
          <StateChip state={c.state} />
        </div>
        <p className="text-sm text-text-2">{c.line}</p>
        <p className="text-xs text-muted">As of {c.asOf ? fmt(c.asOf, tz) : "never: nothing recorded yet"}</p>
      </header>
      <Notice done={sp.done} error={sp.error} />

      <Section title="What they do" sub={c.tagline}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-text-2">
          {d.jobs.map((j) => (
            <li key={j}>{j}</li>
          ))}
        </ul>
      </Section>

      {role === "assistant" ? (
        <Section title="Chat">
          <p className="text-sm text-text-2">Plain app logic, no AI: it reads missions and approvals.</p>
        </Section>
      ) : (
        <Section title={d.chats.length > 1 ? "Chats" : "Chat"} sub="HQ links to the real chat. It can't read or drive it.">
          {d.chats.length ? (
            <div className="flex flex-col gap-4">
              {d.chats.map((chat) => (
                <div key={chat.id} className="rounded-2xl bg-surface-2 p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[0.9375rem] font-semibold">{chat.title}</h3>
                    {chat.isPrimary && <Badge tone="accent">Main</Badge>}
                    <Badge>
                      {chat.status === "working"
                        ? "Working"
                        : chat.status === "blocked"
                          ? "Blocked"
                          : chat.status === "archived"
                            ? "Archived"
                            : chat.status === "idle"
                              ? "Idle"
                              : "No status yet"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs break-words text-muted">
                    {chat.branch ? `Branch ${chat.branch}` : "No branch recorded"} ·{" "}
                    {chat.lastCheckinAt ? `last check-in ${ago(chat.lastCheckinAt)}` : "hasn't checked in yet"}
                  </p>
                  {chat.summary && <p className="mt-2 text-sm text-text-2">{chat.summary}</p>}
                  {chat.needsAction && <p className="mt-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">Needs action: {chat.needsAction}</p>}
                  <div className="mt-3">
                    <a href={chat.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent">
                      Open chat <ExternalLink className="h-4 w-4" aria-hidden />
                      <span className="sr-only">{chat.title} (opens in a new tab)</span>
                    </a>
                  </div>
                  <div className="mt-2 border-t border-border/60 pt-3">
                    <CopyAndOpen url={chat.url} defaultText={handoff} editable={!handoff} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No chat is connected to {c.title} yet. Add one in Settings.</Empty>
          )}
        </Section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Current">
          {d.current.length ? d.current.map((m) => <MissionLine key={m.id} m={m} showOwner={false} />) : <Empty>Nothing in progress.</Empty>}
        </Section>
        <Section title="To do">
          {d.pending.length ? d.pending.map((m) => <MissionLine key={m.id} m={m} showOwner={false} />) : <Empty>Nothing queued.</Empty>}
        </Section>
        <Section title="Done">
          {d.done.length ? d.done.map((m) => <MissionLine key={m.id} m={m} showOwner={false} />) : <Empty>Nothing finished yet.</Empty>}
        </Section>
        <Section
          title="Needs your yes"
          action={
            d.approvals.length ? (
              <Link href="/admin/hq/approvals" className="inline-flex min-h-11 items-center text-sm text-accent">
                Inbox
              </Link>
            ) : undefined
          }
        >
          {d.approvals.length ? (
            <ul className="flex flex-col gap-2">
              {d.approvals.map((a) => (
                <ApprovalMini key={a.id} a={a} />
              ))}
            </ul>
          ) : (
            <Empty>Nothing waiting for you.</Empty>
          )}
        </Section>
      </div>

      <Section title="Recent activity">
        <ActivityList items={d.activity} />
      </Section>
    </div>
  );
}
