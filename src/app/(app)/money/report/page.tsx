import { moneyGate } from "@/app/(app)/money-gate";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { LineChart } from "@/components/charts/line-chart";
import { Progress } from "@/components/ui/surface";
import { addDaysStr, formatDateStr, isValidDateStr, monthEnd, monthStart, todayIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { monthlyReport } from "@/server/services/finance/checkins";

export const metadata: Metadata = { title: "Monthly report" };

const whole = (c: number) => formatCents(c).replace(/\.\d\d$/, "");
const signed = (c: number) => (c > 0 ? `+${whole(c)}` : c < 0 ? `−${whole(-c)}` : "$0");

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const locked = await moneyGate();
  if (locked) return locked;
  const sp = await searchParams;
  const d = await withCurrentUser(async (s, u) => {
    const today = todayIn(u.timezone);
    const month = sp.month && isValidDateStr(`${sp.month}-01`) ? `${sp.month}-01` : monthStart(today);
    return { r: await monthlyReport(s, today, month), today, month };
  });
  const { r } = d;
  const prev = monthStart(addDaysStr(d.month, -1)).slice(0, 7);
  const next = monthStart(addDaysStr(monthEnd(d.month), 1));
  const canNext = next <= d.today;

  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-6">
      <header>
        <Link href="/money" className="hidden items-center gap-1 text-sm text-muted hover:text-text md:inline-flex">
          <ArrowLeft className="h-3.5 w-3.5" /> Money
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-[34px] leading-tight font-medium tracking-tight">{formatDateStr(d.month, "MMMM yyyy")}</h1>
          <div className="flex items-center rounded-full bg-surface shadow-soft">
            <Link
              href={`/money/report?month=${prev}`}
              className="tap flex items-center justify-center rounded-full text-muted hover:text-text"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            {canNext ? (
              <Link
                href={`/money/report?month=${next.slice(0, 7)}`}
                className="tap flex items-center justify-center rounded-full text-muted hover:text-text"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="p-2.5 text-muted/40" aria-hidden>
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </div>
        </div>
        <p className="mt-1 text-sm text-text-2">{r.range}</p>
      </header>

      <section className="grid grid-cols-3 gap-3" aria-label="Summary">
        <Big label="Came in" cents={r.incomeCents} />
        <Big label="Spent" cents={r.spentCents} />
        <Big
          label="Kept"
          cents={r.savedCents}
          tone={r.savedCents < 0 ? "danger" : "success"}
          sub={r.savingsRatePercent != null ? `${r.savingsRatePercent}% of income` : undefined}
        />
      </section>
      <p className="-mt-3 px-1 text-xs text-muted">
        Previous month: {whole(r.previous.incomeCents)} in, {whole(r.previous.spentCents)} spent.
      </p>

      {r.netWorth && (
        <Card title="Net worth">
          <p className="text-[15px]">
            {whole(r.netWorth.endCents)}{" "}
            <span className={cn("text-sm", r.netWorth.changeCents >= 0 ? "text-success" : "text-danger")}>{signed(r.netWorth.changeCents)} this month</span>
          </p>
          {r.netWorth.points.length > 1 && (
            <div className="mt-3">
              <LineChart
                label="Net worth over time"
                series={[{ name: "Net worth", points: r.netWorth.points.map((p) => ({ date: p.day, cents: p.cents })), className: "stroke-accent" }]}
              />
            </div>
          )}
          <p className="mt-2 text-xs text-muted">Recorded each day you open Money or your accounts sync.</p>
        </Card>
      )}

      {r.categories.length > 0 && (
        <Card title="Where it went">
          <ul className="flex flex-col divide-y divide-border text-sm">
            {r.categories.map((c) => (
              <li key={c.name} className="flex items-center justify-between gap-3 py-2">
                <span>{c.name}</span>
                <span className="tabular flex items-baseline gap-3">
                  <span className={cn("text-xs", c.changeCents > 0 ? "text-warning" : "text-success")}>{signed(c.changeCents)}</span>
                  {whole(c.cents)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Change compared with the previous month.</p>
        </Card>
      )}

      {r.budgets.length > 0 && (
        <Card title={`Budgets: ${r.budgets.filter((b) => b.within).length} of ${r.budgets.length} on track`}>
          <ul className="flex flex-col gap-3">
            {r.budgets.map((b) => (
              <li key={b.category}>
                <div className="flex justify-between text-sm">
                  <span>{b.category}</span>
                  <span className="tabular text-text-2">
                    {whole(b.spentCents)} / {whole(b.limitCents)}
                  </span>
                </div>
                <Progress
                  value={b.limitCents ? (b.spentCents / b.limitCents) * 100 : 0}
                  tone={b.within ? "accent" : "danger"}
                  className="mt-1.5"
                  label={`${b.category} budget`}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {r.goals.length > 0 && (
        <Card title="Goals">
          <ul className="flex flex-col gap-3">
            {r.goals.map((g) => (
              <li key={g.name}>
                <div className="flex justify-between text-sm">
                  <span>{g.name}</span>
                  <span className="tabular text-text-2">{g.percent}%</span>
                </div>
                <Progress value={g.percent} className="mt-1.5" label={`${g.name} progress`} />
                {g.projectedDate && <p className="mt-1 text-xs text-muted">On pace to finish {formatDateStr(g.projectedDate, "MMM yyyy")}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {r.health.score != null && (
        <Card title={`Financial health: ${r.health.score} (${r.health.band})`}>
          <ul className="list-disc pl-5 text-sm text-text-2">
            {r.health.nextSteps.map((s) => (
              <li key={s} className="mt-1">
                {s}
              </li>
            ))}
          </ul>
          <Link href="/money/coach" className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-accent">
            Open your coach
          </Link>
        </Card>
      )}
    </div>
  );
}

function Big({ label, cents, tone, sub }: { label: string; cents: number; tone?: "success" | "danger"; sub?: string }) {
  return (
    <div className="rounded-3xl bg-surface p-4 shadow-soft">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("tabular mt-1 text-xl font-medium", tone === "success" && "text-success", tone === "danger" && "text-danger")}>{whole(cents)}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-surface p-5 shadow-soft" aria-label={title}>
      <h2 className="mb-3 text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}
