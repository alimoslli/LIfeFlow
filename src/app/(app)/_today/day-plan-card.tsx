import Link from "next/link";
import { AlertTriangle, ArrowRight, ListChecks, Sparkles } from "lucide-react";
import { AskJarvisButton } from "@/components/shell/app-shell";
import { cn } from "@/lib/utils";
import type { DayPlan } from "@/server/briefing/day-plan";
import { RefreshPlan } from "./day-plan";

/** Jarvis's day plan: summary, top priorities, watch-outs and one next step. */
export function DayPlanCard({ plan, name, date }: { plan: DayPlan; name: string; date: string }) {
  return (
    <section aria-label={`${name}'s plan for today`} className="animate-rise overflow-hidden rounded-3xl bg-surface shadow-soft">
      <div className="lf-sheen relative overflow-hidden bg-hero px-5 pt-4 pb-5 text-hero-text">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.18em] uppercase opacity-80">
              <Sparkles className="h-3.5 w-3.5" /> {name}&apos;s day plan
            </p>
            <p className="mt-1 text-xs opacity-70">{date} · from your own records</p>
          </div>
          <RefreshPlan className="-mt-1 -mr-2 bg-white/10 text-hero-text hover:bg-white/20" />
        </div>
        <p className="mt-3 text-[15px] leading-relaxed">{plan.summary.join(" ")}</p>
      </div>

      <div className="flex flex-col gap-5 p-5">
        <div>
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
            <ListChecks className="h-3.5 w-3.5" /> Top priorities
          </h3>
          {plan.priorities.length === 0 ? (
            <p className="mt-2 text-[15px] text-text-2">Nothing due or late. A good day to get ahead.</p>
          ) : (
            <ol className="mt-2 flex flex-col">
              {plan.priorities.map((p, i) => (
                <li key={p.href + i}>
                  <Link href={p.href} className="-mx-2 flex min-h-12 items-start gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-surface-2">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] leading-snug">{p.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        {p.context && <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-text-2">{p.context}</span>}
                        <span className={cn("rounded-md px-1.5 py-0.5 font-medium", p.late ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>
                          {p.tag}
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {plan.moreDue > 0 && (
            <Link href="/tasks" className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent">
              {plan.moreDue} more <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {plan.watch.length > 0 && (
          <div className="border-t border-border pt-4">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
              <AlertTriangle className="h-3.5 w-3.5" /> Watch out for
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {plan.watch.map((w) => {
                const body = (
                  <>
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", w.tone === "attention" ? "bg-danger" : "bg-warning")} />
                    <span className="text-[15px] leading-snug text-text-2">{w.text}</span>
                  </>
                );
                return (
                  <li key={w.text}>
                    {w.href ? (
                      <Link href={w.href} className="flex gap-2.5 hover:text-text">
                        {body}
                      </Link>
                    ) : (
                      <span className="flex gap-2.5">{body}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="border-t border-border pt-4">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
            <ArrowRight className="h-3.5 w-3.5" /> Next step
          </h3>
          <p className="mt-2 text-[15px] leading-snug">{plan.next.text}</p>
          {plan.next.href ? (
            <Link
              href={plan.next.href}
              className="mt-3 flex min-h-11 items-center justify-center rounded-full bg-accent px-4 text-sm font-medium text-accent-text"
            >
              {plan.next.label}
            </Link>
          ) : (
            <AskJarvisButton
              prompt={plan.next.prompt}
              send
              className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full bg-accent px-4 text-sm font-medium text-accent-text"
            >
              {plan.next.label}
            </AskJarvisButton>
          )}
        </div>
      </div>
    </section>
  );
}
