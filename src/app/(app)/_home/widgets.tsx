import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarDays, CheckSquare, GraduationCap, PiggyBank, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { TaskCheck } from "@/components/task-check";
import { Badge, Card, CardHeader, EmptyState, Money, Progress } from "@/components/ui/surface";
import { dueLabel, formatDateStr, formatIn } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { toggleTaskAction } from "../tasks/actions";
import type { HomeData } from "./data";

const More = ({ href, children = "View all" }: { href: string; children?: ReactNode }) => (
  <Link href={href} className="flex items-center gap-1 text-xs font-medium text-accent hover:underline">
    {children} <ArrowRight className="h-3 w-3" />
  </Link>
);

export function AlertsWidget({ d }: { d: HomeData }) {
  const alerts: { tone: "danger" | "warning"; text: string; href: string }[] = [];
  if (d.overdue.length) alerts.push({ tone: "danger", text: `${d.overdue.length} overdue assignment${d.overdue.length > 1 ? "s" : ""}`, href: "/school?view=overdue" });
  for (const c of d.conflicts.slice(0, 2)) alerts.push({ tone: "warning", text: `${c.a.title} overlaps ${c.b.title}`, href: "/calendar" });
  for (const b of d.budgets.filter((x) => x.percent >= 90).slice(0, 2))
    alerts.push({ tone: b.percent >= 100 ? "danger" : "warning", text: `${b.categoryName} budget at ${b.percent}%`, href: "/finances/budgets" });
  if (!alerts.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {alerts.map((a) => (
        <Link key={a.text} href={a.href} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm", a.tone === "danger" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>
          <AlertTriangle className="h-4 w-4" /> {a.text}
        </Link>
      ))}
    </div>
  );
}

export function ScheduleWidget({ d }: { d: HomeData }) {
  return (
    <Card>
      <CardHeader title="Today" subtitle={formatDateStr(d.today, "EEEE, MMMM d")} action={<More href="/calendar">Calendar</More>} />
      {d.agenda.length === 0 ? (
        <EmptyState icon={<CalendarDays />} title="Nothing scheduled today">
          A good day for deep work.
        </EmptyState>
      ) : (
        <ol className="px-5 pb-4">
          {d.agenda.map((i) => {
            const past = i.endsAt && i.endsAt < d.now;
            return (
              <li key={i.key} className={cn("flex gap-3 py-2", past && "opacity-50")}>
                <span className="tabular w-16 shrink-0 pt-0.5 text-xs text-muted">{i.allDay ? "All day" : formatIn(i.startsAt, d.tz, "h:mm a")}</span>
                <span className="mt-1 h-8 w-[3px] shrink-0 rounded-full" style={{ background: i.color ?? "var(--accent)" }} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{i.title}</p>
                  <p className="truncate text-xs text-muted">
                    {i.endsAt && !i.allDay ? `until ${formatIn(i.endsAt, d.tz, "h:mm a")}` : ""}
                    {i.subtitle ? ` · ${i.subtitle}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

export function PriorityTasksWidget({ d }: { d: HomeData }) {
  return (
    <Card>
      <CardHeader title="Priorities" subtitle={`${d.tasks.length} open task${d.tasks.length === 1 ? "" : "s"}`} action={<More href="/tasks" />} />
      {d.priorityTasks.length === 0 ? (
        <EmptyState icon={<CheckSquare />} title="No open tasks">
          Ask Jarvis to plan your week, or add a task.
        </EmptyState>
      ) : (
        <ul className="px-5 pb-4">
          {d.priorityTasks.map((t) => {
            const due = dueLabel(t.dueAt, t.dueAllDay, d.tz, d.now);
            return (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <TaskCheck done={false} action={toggleTaskAction.bind(null, t.id)} label={`Complete ${t.title}`} />
                <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                {(t.priority === "urgent" || t.priority === "high") && <Badge tone={t.priority === "urgent" ? "danger" : "warning"}>{t.priority}</Badge>}
                {due.text && <span className={cn("shrink-0 text-xs", due.overdue ? "text-danger" : "text-muted")}>{due.text}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function DeadlinesWidget({ d }: { d: HomeData }) {
  const items = [...d.overdue, ...d.deadlines];
  return (
    <Card>
      <CardHeader title="Deadlines" subtitle="Overdue and next 7 days" action={<More href="/school" />} />
      {items.length === 0 ? (
        <EmptyState icon={<GraduationCap />} title="No upcoming deadlines">
          Paste assignment details into Jarvis and they&apos;ll appear here.
        </EmptyState>
      ) : (
        <ul className="px-5 pb-4">
          {items.slice(0, 7).map((a) => {
            const due = dueLabel(a.dueAt, a.dueAllDay, d.tz, d.now);
            return (
              <li key={a.id} className="flex items-center gap-3 py-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.course.color ?? "var(--accent)" }} />
                <Link href={`/school/courses/${a.course.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm">{a.title}</p>
                  <p className="truncate text-xs text-muted">{a.course.code ?? a.course.name}</p>
                </Link>
                {a.kind === "exam" && <Badge tone="danger">Exam</Badge>}
                <span className={cn("shrink-0 text-xs", due.overdue ? "font-medium text-danger" : due.soon ? "text-warning" : "text-muted")}>{due.overdue ? `Overdue · ${due.text}` : due.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function MoneyWidget({ d }: { d: HomeData }) {
  if (!d.accounts.length) {
    return (
      <Card>
        <CardHeader title="Money" />
        <EmptyState icon={<Wallet />} title="No accounts yet" action={<More href="/finances/accounts">Add an account</More>}>
          Add accounts manually or import a CSV. Bank sync via Plaid is coming next.
        </EmptyState>
      </Card>
    );
  }
  const near = d.budgets.filter((b) => b.percent >= 75).slice(0, 3);
  return (
    <Card>
      <CardHeader title="Money" subtitle={`${formatDateStr(d.today, "MMMM")} so far`} action={<More href="/finances">Finances</More>} />
      <div className="grid grid-cols-3 gap-4 px-5 pt-1 pb-4">
        <div>
          <p className="text-xs text-muted">Cash</p>
          <Money cents={d.balances.cashCents} className="text-lg font-semibold" />
        </div>
        <div>
          <p className="text-xs text-muted">Spent</p>
          <Money cents={d.month.netSpendingCents} className="text-lg font-semibold" />
        </div>
        <div>
          <p className="text-xs text-muted">Earned</p>
          <Money cents={d.month.incomeCents} className="text-lg font-semibold" />
        </div>
      </div>
      {(near.length > 0 || d.bills.length > 0) && (
        <div className="border-t border-border px-5 py-3">
          {near.map((b) => (
            <div key={b.id} className="py-1.5">
              <div className="mb-1 flex justify-between text-xs">
                <span>{b.categoryName}</span>
                <span className="tabular text-muted">
                  <Money cents={b.spentCents} /> / <Money cents={b.limitCents} />
                </span>
              </div>
              <Progress value={b.percent} tone={b.percent >= 100 ? "danger" : b.percent >= 90 ? "warning" : "accent"} label={`${b.categoryName} budget`} />
            </div>
          ))}
          {d.bills.slice(0, 3).map((b) => (
            <div key={`${b.id}-${b.date}`} className="flex justify-between py-1 text-xs">
              <span className="text-text-2">
                {b.name} · {formatDateStr(b.date, "EEE MMM d")}
              </span>
              <Money cents={-b.amountCents} className="text-text-2" />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function GoalsWidget({ d }: { d: HomeData }) {
  return (
    <Card>
      <CardHeader title="Goals" action={<More href="/finances/goals" />} />
      {d.goals.length === 0 ? (
        <EmptyState icon={<PiggyBank />} title="No goals yet">
          Set a savings goal and track progress here.
        </EmptyState>
      ) : (
        <ul className="px-5 pb-4">
          {d.goals.map((g) => (
            <li key={g.id} className="py-2">
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="truncate">{g.name}</span>
                <span className="tabular text-xs text-muted">{g.percent}%</span>
              </div>
              <Progress value={g.percent} label={g.name} />
              <p className="tabular mt-1 text-xs text-muted">
                <Money cents={g.savedCents} /> of <Money cents={g.targetCents} />
                {g.targetDate ? ` · by ${formatDateStr(g.targetDate, "MMM yyyy")}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * Home is a list of widgets: add a component here (and to its column) to
 * extend the dashboard without touching the page layout.
 */
export const HOME_WIDGETS = {
  primary: [ScheduleWidget, PriorityTasksWidget, DeadlinesWidget],
  secondary: [MoneyWidget, GoalsWidget],
} as const;
