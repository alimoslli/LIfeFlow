import Link from "next/link";
import type { Metadata } from "next";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { MySkyling } from "@/components/skylings/sprite";
import { CLOUD, PixelArt, SkyWindow } from "@/components/skylings/sky-window";
import { formatDateStr, todayIn } from "@/lib/dates";
import { healthView } from "@/lib/health-view";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { healthSummary } from "@/server/services/health";
import { HealthHeader } from "./health-week";
import { logHealthAction } from "./actions";

export const metadata: Metadata = { title: "Health" };

const num = (n: number) => n.toLocaleString("en-US");

/** Health only: last night, steps, workouts, the week's sleep and resting heart. Habits are under Goals. */
export default async function HealthPage() {
  const { health, today, tz } = await withCurrentUser(async (s, u) => ({
    health: await healthSummary(s, u.timezone, 7),
    today: todayIn(u.timezone),
    tz: u.timezone,
  }));
  const v = healthView(health.metrics, today);
  const maxSleep = Math.max(...v.week.map((d) => d.hours ?? 0), 1);
  const empty = health.metrics.length === 0;

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6">
      <HealthHeader date={formatDateStr(today, "EEEE, MMMM d")} apple={health.fromAppleHealth} action={logHealthAction} today={today} />

      {empty ? (
        <section aria-label="Health" className="rounded-3xl bg-surface p-5 shadow-soft">
          <p className="text-[0.9375rem] font-medium">No health data yet</p>
          <p className="mt-1 text-sm text-text-2">Connect Apple Health and your sleep and steps fill in by themselves. Or tap + to log something.</p>
          <Link href="/settings/integrations" className="mt-3 flex min-h-11 items-center text-sm font-medium text-accent">
            Connect Apple Health
          </Link>
        </section>
      ) : (
        <>
          <section aria-label="Last night" className="animate-rise">
            <SkyWindow tz={tz} className="rounded-[1.75rem]">
              <div className="relative min-h-[12.5rem] px-6 pt-6 pb-5">
                <p className="flex items-center gap-1.5 text-sm text-white/80">
                  <PixelIcon name="sleep" className="h-4 w-4" /> {v.sleep && !v.sleep.isToday ? `Sleep, ${formatDateStr(v.sleep.day, "EEE")}` : "Last night"}
                </p>
                <p className="lf-sw-num tabular mt-1 font-display text-[3.375rem] leading-none font-medium tracking-tight" data-testid="last-night">
                  {v.sleep ? v.sleep.text : "No data yet"}
                </p>
                {!v.sleep && <p className="mt-2 max-w-[62%] text-sm text-white/80">Sleep shows here once Apple Health sends it, or you log it.</p>}
                <div className="absolute right-5 bottom-0 flex flex-col items-center">
                  <MySkyling className="relative z-10 -mb-1.5 h-16 w-16" />
                  <PixelArt art={CLOUD} className="w-12" />
                </div>
              </div>
              <div className="lf-sw-glass grid grid-cols-2 divide-x divide-white/12 border-t border-white/10">
                <Cell
                  icon="arrow"
                  label="Steps yesterday"
                  value={v.stepsYesterday == null ? "No data yet" : num(v.stepsYesterday)}
                  sub={v.stepsBefore ? `${v.stepsBefore.label} ${num(v.stepsBefore.value)}` : undefined}
                />
                <Cell
                  icon="workout"
                  label="Active days"
                  value={v.hasExercise ? String(v.activeDays) : "No data yet"}
                  sub={v.hasExercise ? "this week" : undefined}
                />
              </div>
            </SkyWindow>
          </section>

          <section aria-label="Sleep this week" className="animate-rise" style={{ animationDelay: "60ms" }}>
            <h2 className="mb-3 font-display text-[1.5rem] font-medium tracking-tight">Sleep this week</h2>
            <div className="rounded-3xl bg-surface p-5 shadow-soft">
              <div className="flex h-36 items-end gap-2" data-testid="sleep-bars">
                {v.week.map((d) => (
                  <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                    <span
                      data-bar={d.hours ?? 0}
                      aria-label={d.hours == null ? `${d.day}: no data` : `${d.day}: ${d.hours} hours`}
                      className={cn("w-full rounded-lg", d.hours == null ? "bg-accent/10" : "bg-accent")}
                      style={{ height: d.hours == null ? "6%" : `${Math.max(10, (d.hours / maxSleep) * 100)}%` }}
                    />
                    <span className={cn("text-sm", d.isToday ? "font-medium text-text" : "text-text-2")} aria-hidden>
                      {d.letter}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {v.resting != null && (
            <section aria-label="Resting heart" className="flex items-center gap-4 rounded-3xl bg-surface p-5 shadow-soft">
              <PixelIcon name="health" className="h-8 w-8 shrink-0" />
              <div>
                <p className="text-[1.0625rem] font-medium">Resting heart</p>
                <p className="text-[0.9375rem] text-text-2">{v.resting} beats a minute</p>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Cell({ icon, label, value, sub }: { icon: "arrow" | "workout"; label: string; value: string; sub?: string }) {
  return (
    <div className="px-6 py-4">
      <p className="flex items-center gap-1.5 text-xs opacity-80">
        <PixelIcon name={icon} className="h-4 w-4" /> {label}
      </p>
      <p className="tabular mt-1 text-lg font-medium">{value}</p>
      {sub && <p className="tabular mt-0.5 text-xs opacity-70">{sub}</p>}
    </div>
  );
}
