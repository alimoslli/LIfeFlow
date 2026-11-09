import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { BriefCard } from "@/components/hq/brief";
import { countsLine, greeting } from "@/components/hq/labels";
import { LiveRefresh } from "@/components/hq/live-refresh";
import { OfficeScene } from "@/components/hq/office-scene";
import { RightNow } from "@/components/hq/right-now";
import { StateChip } from "@/components/hq/status-chip";
import { employee } from "@/server/hq/team";
import { getSessionUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { officeSnapshot } from "@/server/services/hq";
import { deskView } from "@/server/services/hq-desk";
import { fireConfig } from "@/server/services/hq-desk-start";
import { EMPLOYEES } from "@/server/hq/team";
import { getControls } from "@/server/services/hq-marketing";
import { safe } from "@/server/services/admin";
import { cn } from "@/lib/utils";
import { Failed, adminTz } from "../format";

/** The Office: the office (a drawn building with a room per person) or a plain workspace list, from one snapshot. The top of the Office page. */
export async function OfficeSection({ view, children }: { view: "office" | "workspace"; children?: ReactNode }) {
  const r = await safe("hq-office", () => officeSnapshot(getDb()));
  const controls = await safe("hq-controls", () => getControls(getDb()));
  const deskR = await safe("hq-desk", () => deskView(getDb()));
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
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: tz }).format(s.now);
  const dayPart = `${weekday} ${greeting(s.now, tz).replace("Good ", "")}`;
  const roleTitle = (r: string) => EMPLOYEES.find((x) => x.role === r)?.title ?? r;
  const desk = {
    files: deskR.ok
      ? deskR.data.files.map((f) => ({
          id: f.mission.id,
          title: f.mission.title,
          who: roleTitle(f.mission.role),
          status: f.status,
          kind: f.link.kind,
          href: f.link.href,
          appHref: f.link.appHref,
          prompt: f.link.prompt,
          pin: f.link.pin,
          byYou: f.mission.deskPromptBy === "owner",
        }))
      : [],
    roles: EMPLOYEES.map((x) => ({ role: x.role, title: x.title })),
    night: { on: deskR.ok && deskR.data.night.on, endsAt: deskR.ok ? deskR.data.night.endsAt : null },
    canStart: fireConfig() !== null,
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="hq-eyebrow">{dayPart}</p>
          <h1 className="mt-1 font-display text-[2rem] leading-tight font-medium tracking-tight lg:text-[2.5rem]">
            {greeting(s.now, tz)}, {first}.
          </h1>
          <p className="mt-1 text-sm text-text-2 lg:text-[0.9375rem]">
            {counts || "Everyone is quiet."}
            {b.weekPct !== null && ` · Claude use this week: ${Math.round(b.weekPct)}%`}
            {controls.ok && !controls.data.autonomous && " · Autonomous mode off"}
          </p>
        </div>
        <nav aria-label="View" className="inline-flex rounded-full bg-surface-2 p-1">
          {(
            [
              ["office", "Office", "/admin"],
              ["workspace", "Workspace", "/admin?view=workspace"],
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

      <LiveRefresh />
      {/* Phones: one column in this order. A MacBook and wider: what you act on (left) beside the COO and what changed (right). */}
      <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,7fr)_minmax(0,6fr)] xl:items-start">
        <RightNow items={s.live} waiting={s.waiting} approvals={s.approvals.slice(0, 3)} pending={n} now={s.now} nextRound={s.nextRound} />
        <div className="flex min-w-0 flex-col gap-5">
          <BriefCard brief={s.brief} chief={s.employees.find((e) => e.role === "assistant")} pending={n} />
          {children}
        </div>
      </div>

      <div>
        <div className="min-w-0">
          {view === "office" ? (
            <OfficeScene snapshot={s} desk={desk} />
          ) : (
            <div className="flex flex-col gap-3">
              {s.employees.map((e) => (
                <article key={e.role} className="rounded-3xl bg-surface p-4 shadow-soft">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-[1.0625rem] font-semibold">{e.title}</h2>
                    <StateChip state={e.state} />
                  </div>
                  <p className="mt-1 text-sm text-text-2">{e.line}</p>
                  {e.note && <p className="mt-1 text-sm font-medium text-brass-ink">{e.note}</p>}
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
                      <span className="text-sm text-muted">{employee(e.role).ownChat ? "No chat connected yet" : "Works in the COO's rounds"}</span>
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
      </div>
    </div>
  );
}
