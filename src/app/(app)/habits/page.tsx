import Link from "next/link";
import type { Metadata } from "next";
import { healthSummary } from "@/server/services/health";
import { HealthWeek, LogHealth } from "./health-week";
import { todayIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { logHealthAction } from "./actions";

export const metadata: Metadata = { title: "Health" };

/** Health only: sleep, steps and workouts. Habits are under Goals. */
export default async function HealthPage() {
  const { health, today } = await withCurrentUser(async (s, u) => ({
    health: await healthSummary(s, u.timezone, 7),
    today: todayIn(u.timezone),
  }));
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[2.125rem] leading-tight font-medium tracking-tight">Health</h1>
          <p className="mt-1 text-sm text-text-2">Your sleep, steps and workouts this week.</p>
        </div>
        <Link href="/settings/integrations" className="lf-sb lf-sb-app lf-sb-sm shrink-0">
          Apple Health
        </Link>
      </header>

      <HealthWeek metrics={health.metrics} today={today} />
      <LogHealth action={logHealthAction} today={today} />
    </div>
  );
}
