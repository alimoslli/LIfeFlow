import type { Metadata } from "next";
import Link from "next/link";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { ActionForm } from "@/components/action-form";
import { AskJarvisButton } from "@/components/shell/app-shell";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Money } from "@/components/ui/surface";
import { addDaysStr, currentInstant, formatDateStr, formatIn, isValidDateStr, localDateOf, todayIn, weekStart } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { MySkyling } from "@/components/skylings/sprite";
import { SkyWindow } from "@/components/skylings/sky-window";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { listEmployers, listPaychecks, listShifts, regularHoursOf, shiftPaidMinutes } from "@/server/services/work";
import { JobHoursForm, PaycheckDialog, ShiftDialog, WorkHoursField } from "./forms";
import { ShiftList } from "./shift-list";
import { addPaycheckAction, createEmployerAction, createShiftAction, setJobHoursAction } from "./actions";
import { scheduleLabel } from "@/lib/work-schedule";
import { SkylingIcon } from "@/components/skylings/sprite";

export const metadata: Metadata = { title: "Work" };

export default async function WorkPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const sp = await searchParams;
  const d = await withCurrentUser(async (s, u) => {
    const tz = u.timezone;
    const today = todayIn(tz);
    const wk = weekStart(sp.week && isValidDateStr(sp.week) ? sp.week : today);
    const [employers, shifts, thisWeek, ahead, paychecks] = await series(
      () => listEmployers(s),
      () => listShifts(s, tz, wk, addDaysStr(wk, 6), { includeCancelled: true }),
      () => listShifts(s, tz, weekStart(today), addDaysStr(weekStart(today), 6)),
      () => listShifts(s, tz, today, addDaysStr(today, 30)),
      () => listPaychecks(s, 8),
    );
    return { employers, shifts, thisWeek, ahead, paychecks, wk, today, tz, now: currentInstant().getTime() };
  });
  const { tz, today, now } = d;
  const jobs = d.employers.map((e) => ({ id: e.id, name: e.name }));
  const empName = new Map(d.employers.map((e) => [e.id, e.name]));
  const paid = (x: (typeof d.thisWeek)[number]) => shiftPaidMinutes(x).minutes / 60;
  const live = d.thisWeek.filter((x) => x.status !== "cancelled");
  const worked = live.filter((x) => x.endsAt.getTime() <= now).reduce((a, x) => a + paid(x), 0);
  const planned = live.reduce((a, x) => a + paid(x), 0);
  const next = d.ahead.find((x) => x.status !== "cancelled" && x.endsAt.getTime() > now);
  const last = d.paychecks[0];
  const hrs = (h: number) => `${Math.round(h * 10) / 10} h`;
  const when = (t: Date) => formatIn(t, tz, formatIn(t, tz, "m") === "0" ? "EEE, h a" : "EEE, h:mm a");
  const dayWord = (t: Date) => {
    const day = localDateOf(t, tz);
    return day === today ? "Today" : day === addDaysStr(today, 1) ? "Tomorrow" : formatDateStr(day, "MMM d");
  };
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDaysStr(weekStart(today), i);
    const on = live.filter((x) => localDateOf(x.startsAt, tz) === day);
    const hours = on.reduce((a, x) => a + paid(x), 0);
    const done = on.length > 0 && on.every((x) => x.endsAt.getTime() <= now);
    return { day, letter: formatDateStr(day, "EEEEE"), hours, done, today: day === today, planned: on.length > 0 && !done };
  });

  if (d.employers.length === 0)
    return (
      <div className="mx-auto max-w-[640px]">
        <Header today={today} />
        <SkyWindow tz={tz} className="mt-6 rounded-[1.75rem]">
          <div className="relative min-h-[11rem] px-6 pt-6 pb-5">
            <p className="text-xs font-semibold tracking-[0.14em] text-sun uppercase">Work</p>
            <p className="mt-1 max-w-[62%] font-display text-[1.75rem] leading-tight font-medium">Add your job</p>
            <p className="mt-2 max-w-[62%] text-sm text-white/80">Then your shifts and pay show up here and on your sky.</p>
            <SkylingOnCup />
          </div>
        </SkyWindow>
        <div className="mt-6 rounded-[1.375rem] bg-surface p-5 shadow-soft">
          <EmployerForm />
        </div>
      </div>
    );

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-9">
      <Header
        today={today}
        action={
          <ShiftDialog
            action={createShiftAction}
            employers={jobs}
            today={today}
            label={
              <>
                <PixelIcon name="plus" className="h-4 w-4" /> Shift
              </>
            }
          />
        }
      />

      {/* what's next and how the week stands, on the sky like Money's "Available now" (owner's reset, 2026-11-10) */}
      <section className="animate-rise -mt-4" aria-label="Next shift">
        <SkyWindow tz={tz} data-tilt className="rounded-[1.75rem]">
          <div className="relative min-h-[11rem] px-6 pt-6 pb-5">
            <p className="text-xs font-semibold tracking-[0.14em] text-sun uppercase">{next ? "Next shift" : "No shift planned"}</p>
            {next ? (
              <>
                <p className="mt-1 font-display text-[2.25rem] leading-tight font-medium tracking-tight">{when(next.startsAt)}</p>
                <p className="mt-1 max-w-[62%] text-sm text-white/80">
                  {dayWord(next.startsAt)} · {empName.get(next.employerId)}
                </p>
              </>
            ) : (
              <p className="mt-1 max-w-[62%] text-sm text-white/80">Nothing in the next 30 days. Add a shift or send your schedule to your skyling.</p>
            )}
            <SkylingOnCup />
          </div>
          <div className="lf-sw-glass grid grid-cols-2 divide-x divide-white/12 border-t border-white/10">
            <div className="p-4">
              <p className="flex items-center gap-1.5 text-xs opacity-75">
                <PixelIcon name="clock" className="h-4 w-4" /> Hours this week
              </p>
              <p className="tabular mt-1 text-lg font-medium">{hrs(worked)}</p>
              <p className="tabular mt-0.5 text-xs opacity-70">of {hrs(planned).replace(" h", "")} planned</p>
            </div>
            <div className="p-4">
              <p className="flex items-center gap-1.5 text-xs opacity-75">
                <PixelIcon name="down" className="h-4 w-4" /> Last paycheck
              </p>
              {last ? (
                <>
                  <p className="tabular mt-1 text-lg font-medium">{formatCents(last.netCents)}</p>
                  <p className="tabular mt-0.5 text-xs opacity-70">Came in {formatDateStr(last.payDate, "MMM d")}</p>
                </>
              ) : (
                <p className="mt-1 text-sm opacity-80">None yet</p>
              )}
            </div>
          </div>
        </SkyWindow>
      </section>

      <section className="animate-rise" style={{ animationDelay: "60ms" }} aria-label="This week">
        <h2 className="mb-3 font-display text-[1.3125rem] leading-tight font-medium tracking-tight">This week</h2>
        <ol className="grid grid-cols-7 rounded-[1.375rem] bg-surface px-2 py-4 shadow-soft">
          {week.map((w) => (
            <li key={w.day} className="flex flex-col items-center gap-2" aria-label={`${formatDateStr(w.day, "EEEE")}${w.hours ? `, ${hrs(w.hours)}` : ""}`}>
              <span className="text-xs text-muted" aria-hidden>
                {w.letter}
              </span>
              <span
                aria-hidden
                className={cn(
                  "flex items-center justify-center rounded-full",
                  w.done ? "h-9 w-9 bg-night text-sun" : w.today ? "h-9 w-9 bg-sun/25 ring-2 ring-sun" : w.planned ? "h-6 w-6 bg-sun/25" : "h-6 w-6 bg-border",
                )}
              >
                {w.done && <PixelIcon name="check" className="h-4 w-4" />}
              </span>
              <span className="tabular h-4 text-xs text-text-2">{w.hours ? Math.round(w.hours * 10) / 10 : ""}</span>
            </li>
          ))}
        </ol>
        {/* the shifts themselves, to change or cancel, one tap deeper (open when a past shift needs its hours, or when
            another week was asked for) */}
        <details className="mt-3" open={!!sp.week || d.shifts.some((x) => x.status === "scheduled" && x.endsAt.getTime() <= now) || undefined}>
          <summary className="flex min-h-11 cursor-pointer items-center px-1 text-sm font-medium text-text-2">Change a shift</summary>
          <div className="mt-2 rounded-[1.375rem] bg-surface pb-2 shadow-soft">
            <div className="flex items-center justify-between gap-2 px-4 pt-3">
              <p className="text-sm font-medium">
                {formatDateStr(d.wk, "MMM d")} to {formatDateStr(addDaysStr(d.wk, 6), "MMM d")}
              </p>
              <div className="flex items-center">
                <Link href={`/work?week=${addDaysStr(d.wk, -7)}`} className="tap flex items-center justify-center text-muted" aria-label="Previous week">
                  <PixelIcon name="back" className="h-4 w-4" />
                </Link>
                <Link href={`/work?week=${addDaysStr(d.wk, 7)}`} className="tap flex items-center justify-center text-muted" aria-label="Next week">
                  <PixelIcon name="arrow" className="h-4 w-4" />
                </Link>
              </div>
            </div>
            {d.shifts.length === 0 && <p className="px-4 py-3 text-sm text-muted">No shifts that week.</p>}
            <ShiftList
              shifts={d.shifts.map((x) => ({
                id: x.id,
                employerId: x.employerId,
                startsAt: x.startsAt,
                endsAt: x.endsAt,
                recordedStart: x.recordedStart,
                recordedEnd: x.recordedEnd,
                breakMinutes: x.breakMinutes,
                notes: x.notes,
                status: x.status,
                paidHours: shiftPaidMinutes(x).minutes / 60,
              }))}
              employers={jobs}
              tz={tz}
              today={today}
              now={now}
            />
            <div className="px-4 pt-2">
              <AskJarvisButton prompt="Here's my work schedule, please add these shifts: " className="lf-sb lf-sb-app lf-sb-sm">
                <SkylingIcon className="h-5 w-5" /> Send your schedule
              </AskJarvisButton>
            </div>
          </div>
        </details>
      </section>

      <section className="animate-rise" style={{ animationDelay: "120ms" }} aria-label="Pay that came in">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-[1.3125rem] leading-tight font-medium tracking-tight">Pay that came in</h2>
          <PaycheckDialog action={addPaycheckAction} employers={jobs} today={today} />
        </div>
        {d.paychecks.length === 0 ? (
          <p className="px-1 text-sm text-muted">None recorded yet.</p>
        ) : (
          <ul className="lf-tiles">
            {d.paychecks.map((p) => (
              <li key={p.id} className="flex min-h-16 items-center gap-3.5 px-4 py-3">
                <PixelIcon name="payday" className="h-8 w-8" />
                <span className="min-w-0 flex-1">
                  <span className="tabular block text-[0.9375rem] font-semibold">{formatCents(p.netCents)}</span>
                  <span className="block truncate text-[0.8125rem] text-muted">
                    {formatDateStr(p.payDate, "MMM d")}
                    {p.hours ? ` · ${Number(p.hours)} hours` : ""}
                    {d.employers.length > 1 ? ` · ${empName.get(p.employerId)}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* the job itself (pay rate, usual hours, another job), one tap deeper */}
      <details className="animate-rise" style={{ animationDelay: "160ms" }}>
        <summary className="flex min-h-11 cursor-pointer items-center px-1 text-sm font-medium text-text-2">
          {d.employers.length > 1 ? "Your jobs" : "Your job"}
        </summary>
        <ul className="lf-tiles mt-2">
          {d.employers.map((e) => (
            <li key={e.id} className="px-4 py-3">
              <p className="flex flex-wrap justify-between gap-x-3 text-[0.9375rem]">
                <span className="font-semibold">
                  {e.name}
                  {e.position && <span className="font-normal text-muted"> · {e.position}</span>}
                </span>
                <span className="tabular text-text-2">
                  {e.payType === "hourly" && e.hourlyRateCents != null ? (
                    <>
                      <Money cents={e.hourlyRateCents} /> an hour
                    </>
                  ) : (
                    "Salary"
                  )}
                </span>
              </p>
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center text-xs text-text-2">
                  {regularHoursOf(e.schedule) ? `Usual hours: ${scheduleLabel(regularHoursOf(e.schedule)!)}` : "Shifts change week to week"} · Change
                </summary>
                <JobHoursForm action={setJobHoursAction} employerId={e.id} initial={regularHoursOf(e.schedule)} />
              </details>
            </li>
          ))}
          <li className="px-4 py-3">
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-accent">Add another job</summary>
              <div className="mt-3">
                <EmployerForm />
              </div>
            </details>
          </li>
        </ul>
      </details>
    </div>
  );
}

function Header({ today, action }: { today: string; action?: React.ReactNode }) {
  return (
    <header className="animate-rise flex items-end justify-between gap-3">
      <div>
        <p className="text-sm text-muted">{formatDateStr(today, "EEEE, MMMM d")}</p>
        <h1 className="mt-1 font-display text-[2.5rem] leading-none font-medium tracking-tight">Work</h1>
      </div>
      {action}
    </header>
  );
}

/** Their skyling standing on a cup of coffee in the corner of the sky (tap it and it hops). */
function SkylingOnCup() {
  return (
    <div className="absolute right-5 bottom-0 flex flex-col items-center">
      <MySkyling className="relative z-10 -mb-1 h-16 w-16 cursor-pointer" />
      <PixelIcon name="coffee" className="h-12 w-12" />
    </div>
  );
}

function EmployerForm() {
  return (
    <ActionForm action={createEmployerAction} className="mx-auto w-full max-w-md">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Employer" htmlFor="e-name">
          <Input id="e-name" name="name" required placeholder="Campus Library" />
        </Field>
        <Field label="Position" htmlFor="e-pos">
          <Input id="e-pos" name="position" placeholder="Barista" />
        </Field>
        <Field label="Pay type" htmlFor="e-type">
          <Select id="e-type" name="payType" defaultValue="hourly">
            <option value="hourly">Hourly</option>
            <option value="salary">Salary</option>
          </Select>
        </Field>
        <Field label="Hourly rate ($)" htmlFor="e-rate">
          <Input id="e-rate" name="hourlyRate" inputMode="decimal" placeholder="16.50" />
        </Field>
      </div>
      <WorkHoursField />
      <SubmitButton className="self-end">Save job</SubmitButton>
    </ActionForm>
  );
}
