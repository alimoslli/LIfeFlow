import { moneyGate } from "@/app/(app)/money-gate";
import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CreditCard, HeartPulse, PiggyBank, Repeat, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Progress } from "@/components/ui/surface";
import { addDaysStr, formatDateStr, isValidDateStr, todayIn } from "@/lib/dates";
import { formatCents, parseMoneyToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { debtReport, emergencyFundPlan, financialHealth, planPaycheck, roundUps, subscriptionReport } from "@/server/services/finance/coach";
import { GENERAL_INFO, LESSONS } from "@/server/services/finance/investing";
import { AskJarvisButton } from "../money-client";

export const metadata: Metadata = { title: "Money coach" };

const whole = (c: number) => formatCents(c).replace(/\.\d\d$/, "");

export default async function CoachPage({ searchParams }: { searchParams: Promise<{ pay?: string; next?: string }> }) {
  const locked = await moneyGate();
  if (locked) return locked;
  const sp = await searchParams;
  const d = await withCurrentUser(async (s, u) => {
    const today = todayIn(u.timezone);
    const payCents = sp.pay ? parseMoneyToCents(sp.pay) : null;
    const nextPay = sp.next && isValidDateStr(sp.next) && sp.next > today ? sp.next : undefined;
    const [health, ef, debts, subs, round, paycheck] = await series(
      () => financialHealth(s, today),
      () => emergencyFundPlan(s, today),
      () => debtReport(s, today),
      () => subscriptionReport(s, today),
      () => roundUps(s, today),
      () => (payCents && payCents > 0 ? planPaycheck(s, today, payCents, { nextPayDate: nextPay }) : Promise.resolve(null)),
    );
    return { health, ef, debts, subs, round, paycheck, today, level: u.preferences?.moneyLevel ?? "new" };
  });
  const lessons = LESSONS.filter((l) => d.level !== "new" || l.level === "new").slice(0, 4);

  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-8">
      <header>
        <h1 className="font-display text-[34px] leading-tight font-medium tracking-tight">Insights</h1>
        <p className="mt-1 text-sm text-text-2">
          Health, debt and savings, from your own numbers.{" "}
          <Link href="/money/report" className="font-medium text-accent">
            Monthly report
          </Link>
        </p>
      </header>

      <Section icon={<HeartPulse />} title="Financial health">
        {d.health.score == null ? (
          <p className="text-sm text-text-2">Add accounts and a month of transactions to get a score.</p>
        ) : (
          <>
            <div className="flex items-baseline gap-3">
              <span className="tabular font-display text-[44px] leading-none font-medium">{d.health.score}</span>
              <span className="text-text-2">/ 100 · {d.health.band}</span>
            </div>
            <ul className="mt-4 flex flex-col gap-3">
              {d.health.factors.map((f) => (
                <li key={f.key}>
                  <div className="flex justify-between text-sm">
                    <span>{f.label}</span>
                    <span className="tabular text-muted">
                      {f.score}/{f.max}
                    </span>
                  </div>
                  <Progress value={(f.score / f.max) * 100} className="mt-1.5" tone={f.score / f.max < 0.4 ? "warning" : "accent"} label={f.label} />
                  <p className="mt-1 text-xs text-muted">{f.detail}</p>
                </li>
              ))}
            </ul>
            {d.health.nextSteps.length > 0 && (
              <div className="mt-4 rounded-2xl bg-surface-2/70 p-4">
                <p className="text-sm font-medium">Your next steps</p>
                <ol className="mt-2 list-decimal pl-5 text-sm text-text-2">
                  {d.health.nextSteps.map((s) => (
                    <li key={s} className="mt-1">
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <p className="mt-3 text-xs text-muted">{d.health.note}</p>
          </>
        )}
      </Section>

      <Section icon={<Wallet />} title="Plan a paycheck">
        <form className="flex flex-wrap items-end gap-2" action="/money/coach">
          <label className="flex min-w-[130px] flex-1 flex-col gap-1 text-xs text-text-2">
            Paycheck amount ($)
            <Input name="pay" inputMode="decimal" required defaultValue={sp.pay} placeholder="1250" />
          </label>
          <label className="flex min-w-[150px] flex-1 flex-col gap-1 text-xs text-text-2">
            Next paycheck after this
            <Input name="next" type="date" defaultValue={sp.next ?? addDaysStr(d.today, 14)} />
          </label>
          <Button type="submit">Plan it</Button>
        </form>
        {d.paycheck && (
          <div className="mt-4">
            <p className={cn("text-[15px]", d.paycheck.short && "text-danger")}>{d.paycheck.advice}</p>
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
              <Row label={`Bills before ${formatDateStr(d.paycheck.coversUntil, "MMM d")}`} cents={d.paycheck.billsCents} />
              {d.paycheck.bills.map((b) => (
                <Row key={b.name + b.date} label={`  ${b.name} (${formatDateStr(b.date, "MMM d")})`} cents={b.cents} sub />
              ))}
              <Row label="Budgets for this stretch" cents={d.paycheck.budgetsCents} />
              <Row label="Goals" cents={d.paycheck.goalsCents} />
              {d.paycheck.goals.map((g) => (
                <Row key={g.name} label={`  ${g.name}`} cents={g.cents} sub />
              ))}
              <Row label={`Savings (${d.paycheck.savingsPercent}%)`} cents={d.paycheck.savingsCents} />
              <dt className="border-t border-border pt-1.5 font-medium">Free to spend</dt>
              <dd className={cn("tabular border-t border-border pt-1.5 text-right font-medium", d.paycheck.short && "text-danger")}>
                {whole(d.paycheck.freeToSpendCents)}
              </dd>
            </dl>
          </div>
        )}
      </Section>

      <Section icon={<PiggyBank />} title="Emergency fund">
        {!d.ef.hasData ? (
          <p className="text-sm text-text-2">Once a month of spending is in LifeFlow, this shows how many months of essentials your savings cover.</p>
        ) : (
          <>
            <p className="text-[15px]">
              Your savings cover <strong>{d.ef.monthsCovered ?? 0} months</strong> of essentials. A 3-month cushion is {whole(d.ef.targetCents)}.
            </p>
            <Progress value={d.ef.targetCents ? (d.ef.savedCents / d.ef.targetCents) * 100 : 0} className="mt-3" label="Emergency fund progress" />
            <p className="mt-2 text-sm text-text-2">
              {d.ef.gapCents > 0 ? `${whole(d.ef.monthlyToReachIn12Cents)} a month gets you there in a year.` : "You have a full 3-month cushion. Nice work."}
            </p>
            <p className="mt-1 text-xs text-muted">{d.ef.based}</p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-3">
              {d.ef.challenges.map((c) => (
                <li key={c.name} className="rounded-2xl bg-surface-2/70 p-3 text-sm">
                  <p className="font-medium">{c.name}</p>
                  <p className="mt-1 text-xs text-text-2">{c.detail}</p>
                </li>
              ))}
            </ul>
            {d.round.purchases > 0 && (
              <p className="mt-3 text-sm text-text-2">
                Round-ups: rounding up last month&apos;s {d.round.purchases} purchases would have set aside {whole(d.round.roundUpCents)} (about{" "}
                {whole(d.round.yearlyCents)} a year).
              </p>
            )}
          </>
        )}
      </Section>

      <Section icon={<CreditCard />} title="Debt and credit">
        {d.debts.debts.length === 0 ? (
          <p className="text-sm text-text-2">No card or loan balances. Keep paying cards in full each month.</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-border">
              {d.debts.debts.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="line-clamp-2 break-words font-medium">{x.name}</span>
                    <span className="text-xs text-muted">
                      {[
                        x.aprPercent != null ? `${x.aprPercent}% APR` : "APR not set",
                        x.utilizationPercent != null ? `${x.utilizationPercent}% of limit` : null,
                        x.nextDueDate ? `due ${formatDateStr(x.nextDueDate, "MMM d")}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="tabular">{whole(x.balanceCents)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">{d.debts.utilizationNote}</p>
            {d.debts.avalancheOrder.length > 1 && (
              <p className="mt-1 text-sm text-text-2">Pay extra toward {d.debts.avalancheOrder[0]} first: it has the highest rate.</p>
            )}
            {d.debts.payoff?.months && (
              <p className="mt-1 text-sm text-text-2">
                At minimum payments, debts with known rates are paid off in about {d.debts.payoff.months} months, with {whole(d.debts.payoff.interestCents)} in
                interest.
              </p>
            )}
            {d.debts.missingRates.length > 0 && (
              <p className="mt-1 text-xs text-muted">
                Add interest rates for {d.debts.missingRates.join(", ")} on the{" "}
                <Link href="/finances/accounts" className="text-accent">
                  Accounts
                </Link>{" "}
                page for a payoff plan.
              </p>
            )}
          </>
        )}
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium text-accent">Credit basics</summary>
          <ul className="mt-2 list-disc pl-5 text-text-2">
            {d.debts.creditBasics.map((b) => (
              <li key={b} className="mt-1">
                {b}
              </li>
            ))}
          </ul>
        </details>
      </Section>

      <Section icon={<Repeat />} title="Subscriptions and fees">
        {d.subs.items.length === 0 ? (
          <p className="text-sm text-text-2">No recurring charges found yet.</p>
        ) : (
          <>
            <p className="text-[15px]">
              Tracked subscriptions cost about <strong>{whole(d.subs.subscriptionsYearlyCents)} a year</strong>. Bills and repeating charges are listed by
              yearly cost.
            </p>
            <ul className="mt-3 flex flex-col divide-y divide-border text-sm">
              {d.subs.items.slice(0, 8).map((i) => (
                <li key={i.name + i.frequency} className="flex justify-between gap-3 py-2">
                  <span className="line-clamp-2 break-words">
                    {i.name}{" "}
                    <span className="text-xs text-muted">
                      · {i.frequency}
                      {i.kind === "bill" ? " · bill" : i.tracked ? "" : " · spotted repeating"}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-text-2">{whole(i.yearlyCents)}/yr</span>
                </li>
              ))}
            </ul>
            {d.subs.priceChanges.map((p) => (
              <p key={p.name} className="mt-2 text-sm text-warning">
                {p.name} went up from {formatCents(p.fromCents)} to {formatCents(p.toCents)}.
              </p>
            ))}
            {d.subs.overlaps.map((o) => (
              <p key={o.group} className="mt-2 text-sm text-text-2">
                You pay for {o.names.length} streaming services ({whole(o.yearlyCents)} a year). Rotating one at a time could save most of that.
              </p>
            ))}
            {d.subs.studentPlans.length > 0 && (
              <p className="mt-2 text-sm text-text-2">
                Student plans may be cheaper for: {d.subs.studentPlans.map((s) => s.name).join(", ")}. Check current prices on their sites.
              </p>
            )}
            <div className="mt-3">
              <AskJarvisButton prompt="Look at my subscriptions and help me decide what to cancel. Ask me which ones I actually use.">
                Review with Jarvis
              </AskJarvisButton>
            </div>
          </>
        )}
      </Section>

      <Section icon={<BookOpen />} title="Quick lessons">
        <ul className="grid gap-2 sm:grid-cols-2">
          {lessons.map((l) => (
            <li key={l.id}>
              <details className="rounded-2xl bg-surface-2/70 p-4 text-sm">
                <summary className="cursor-pointer font-medium">{l.title}</summary>
                <p className="mt-2 text-text-2">{l.body}</p>
              </details>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">{GENERAL_INFO}</p>
      </Section>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-surface p-5 shadow-soft sm:p-6" aria-label={title}>
      <h2 className="mb-4 flex items-center gap-2 text-[17px] font-semibold [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:text-accent">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, cents, sub }: { label: string; cents: number; sub?: boolean }) {
  return (
    <>
      <dt className={cn(sub && "pl-3 text-xs text-muted")}>{label.trim()}</dt>
      <dd className={cn("tabular text-right", sub && "text-xs text-muted")}>{whole(cents)}</dd>
    </>
  );
}
