import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, ChevronLeft, ChevronRight, Sparkles, Trash2 } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { AskJarvisButton } from "@/components/shell/app-shell";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, CardHeader, EmptyState, Money, PageHeader, Stat } from "@/components/ui/surface";
import { addDaysStr, formatDateStr, formatIn, isValidDateStr, monthEnd, monthStart, todayIn, weekStart } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { estimateEarnings, listEmployers, listPaychecks, listShifts, ratesOf, shiftPaidMinutes } from "@/server/services/work";
import { ShiftDialog } from "./forms";
import { addPaycheckAction, cancelShiftAction, createEmployerAction, createShiftAction, deleteShiftAction, recordHoursAction } from "./actions";

export const metadata: Metadata = { title: "Work" };

export default async function WorkPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const sp = await searchParams;
  const d = await withCurrentUser(async (s, u) => {
    const tz = u.timezone;
    const today = todayIn(tz);
    const wk = weekStart(sp.week && isValidDateStr(sp.week) ? sp.week : today);
    const [employers, shifts, monthShifts, paychecks] = await series(
      () => listEmployers(s),
      () => listShifts(s, tz, wk, addDaysStr(wk, 6), { includeCancelled: true }),
      () => listShifts(s, tz, monthStart(today), monthEnd(today)),
      () => listPaychecks(s, 8),
    );
    return { employers, shifts, monthShifts, paychecks, wk, today, tz };
  });
  const { tz } = d;
  const est = (list: typeof d.shifts) =>
    d.employers.map((e) => estimateEarnings(list.filter((x) => x.employerId === e.id), ratesOf(e), tz)).reduce(
      (a, b) => ({ hours: a.hours + b.paidHours, cents: a.cents + (b.estimatedGrossCents ?? 0), shifts: a.shifts + b.shiftCount }),
      { hours: 0, cents: 0, shifts: 0 },
    );
  const week = est(d.shifts);
  const month = est(d.monthShifts);
  const empName = new Map(d.employers.map((e) => [e.id, e.name]));

  return (
    <>
      <PageHeader
        title="Work"
        description="Your shifts, hours and pay."
        actions={
          d.employers.length > 0 ? (
            <>
              <AskJarvisButton prompt="Here's my work schedule, please add these shifts: " className="flex h-10 items-center gap-1.5 rounded-full bg-surface px-5 text-sm font-medium shadow-soft">
                <Sparkles className="h-4 w-4 text-accent" /> Import schedule
              </AskJarvisButton>
              <ShiftDialog action={createShiftAction} employers={d.employers.map((e) => ({ id: e.id, name: e.name }))} today={d.today} />
            </>
          ) : undefined
        }
      />

      {d.employers.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={<Briefcase />} title="Add your job to start tracking shifts and pay" />
          <EmployerForm />
        </Card>
      ) : (
        <>
          <Card className="mb-5 grid grid-cols-2 gap-5 p-5 md:grid-cols-4">
            <Stat label="Hours this week" value={week.hours.toFixed(1)} sub={`${week.shifts} shift${week.shifts === 1 ? "" : "s"}`} />
            <Stat label="Est. gross this week" value={<Money cents={week.cents} />} sub="Before taxes" />
            <Stat label="Hours this month" value={month.hours.toFixed(1)} />
            <Stat label="Est. gross this month" value={<Money cents={month.cents} />} sub="Estimate, not actual pay" />
          </Card>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader
                title="Shifts"
                subtitle={`${formatDateStr(d.wk, "MMM d")} – ${formatDateStr(addDaysStr(d.wk, 6), "MMM d")}`}
                action={
                  <div className="flex items-center gap-1">
                    <Link href={`/work?week=${addDaysStr(d.wk, -7)}`} className="rounded p-1 text-muted hover:text-text" aria-label="Previous week">
                      <ChevronLeft className="h-4 w-4" />
                    </Link>
                    <Link href="/work" className="text-xs text-muted hover:text-text">
                      This week
                    </Link>
                    <Link href={`/work?week=${addDaysStr(d.wk, 7)}`} className="rounded p-1 text-muted hover:text-text" aria-label="Next week">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                }
              />
              {d.shifts.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted">No shifts this week.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {d.shifts.map((s) => {
                    const paid = shiftPaidMinutes(s);
                    const cancelled = s.status === "cancelled";
                    return (
                      <li key={s.id} className={cn("group px-5 py-4", cancelled && "opacity-50")}>
                        <div className="flex items-start gap-4">
                          <div className="w-11 shrink-0 text-center">
                            <p className="text-[11px] font-medium text-muted uppercase">{formatIn(s.startsAt, tz, "EEE")}</p>
                            <p className="font-display text-2xl leading-tight">{formatIn(s.startsAt, tz, "d")}</p>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px]">
                              {formatIn(s.startsAt, tz, "h:mm")}–{formatIn(s.endsAt, tz, "h:mm a")}
                            </p>
                            <p className="truncate text-sm text-muted">
                              {empName.get(s.employerId)}
                              {s.breakMinutes ? ` · ${s.breakMinutes} min break` : ""}
                            </p>
                            {s.recordedStart && s.recordedEnd && (
                              <p className="mt-0.5 text-sm text-text-2">
                                Clocked {formatIn(s.recordedStart, tz, "h:mm")}–{formatIn(s.recordedEnd, tz, "h:mm a")}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="tabular text-[15px]">{(paid.minutes / 60).toFixed(1)} h</p>
                            <p className={cn("text-xs", cancelled ? "text-muted" : s.status === "worked" ? "text-success" : "text-info")}>{cancelled ? "Cancelled" : s.status === "worked" ? "Worked" : "Scheduled"}</p>
                          </div>
                        </div>
                        {!cancelled && (
                          <details className="mt-2 pl-15">
                            <summary className="cursor-pointer text-xs text-accent">{s.recordedStart ? "Edit recorded hours" : "Record actual hours"}</summary>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <ActionForm action={recordHoursAction.bind(null, s.id)} reset={false} className="flex-row items-center gap-1.5">
                                <Input name="clockIn" type="time" required defaultValue={formatIn(s.recordedStart ?? s.startsAt, tz, "HH:mm")} className="h-8 w-28 text-[13px]" aria-label="Clock in" />
                                <span className="text-xs text-muted">to</span>
                                <Input name="clockOut" type="time" required defaultValue={formatIn(s.recordedEnd ?? s.endsAt, tz, "HH:mm")} className="h-8 w-28 text-[13px]" aria-label="Clock out" />
                                <SubmitButton size="sm" variant="secondary">
                                  Save
                                </SubmitButton>
                              </ActionForm>
                              <ActionButton action={cancelShiftAction.bind(null, s.id)} confirm="Mark this shift cancelled?" className="text-xs text-muted hover:text-text">
                                Cancel shift
                              </ActionButton>
                              <ActionButton action={deleteShiftAction.bind(null, s.id)} confirm="Delete this shift?" title="Delete shift" className="ml-auto text-muted hover:text-danger">
                                <Trash2 className="h-3.5 w-3.5" />
                              </ActionButton>
                            </div>
                          </details>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <div className="flex flex-col gap-5">
              <Card>
                <CardHeader title="Jobs" />
                <ul className="px-5 pb-3">
                  {d.employers.map((e) => (
                    <li key={e.id} className="flex justify-between py-1.5 text-sm">
                      <span>
                        {e.name}
                        {e.position && <span className="text-muted"> · {e.position}</span>}
                      </span>
                      <span className="tabular text-text-2">{e.payType === "hourly" && e.hourlyRateCents != null ? <><Money cents={e.hourlyRateCents} />/hr</> : e.payType}</span>
                    </li>
                  ))}
                </ul>
                <details className="border-t border-border px-5 py-3">
                  <summary className="cursor-pointer text-xs font-medium text-accent">Add another job</summary>
                  <div className="mt-3">
                    <EmployerForm />
                  </div>
                </details>
              </Card>
              <Card>
                <CardHeader title="Paychecks" subtitle="Actual pay, as you record it" />
                <ul className="px-5">
                  {d.paychecks.length === 0 && <li className="pb-2 text-sm text-muted">None recorded yet.</li>}
                  {d.paychecks.map((p) => (
                    <li key={p.id} className="flex justify-between py-1.5 text-sm">
                      <span>
                        {formatDateStr(p.payDate, "MMM d")} <span className="text-muted">· {empName.get(p.employerId)}</span>
                      </span>
                      <span className="tabular">
                        <Money cents={p.netCents} /> <span className="text-xs text-muted">net</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <details className="mt-1 border-t border-border px-5 py-3">
                  <summary className="cursor-pointer text-xs font-medium text-accent">Record a paycheck</summary>
                  <ActionForm action={addPaycheckAction} className="mt-3">
                    <Select name="employerId" required aria-label="Job">
                      {d.employers.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </Select>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Pay date" htmlFor="p-date">
                        <Input id="p-date" name="payDate" type="date" required defaultValue={d.today} />
                      </Field>
                      <Field label="Hours" htmlFor="p-h">
                        <Input id="p-h" name="hours" inputMode="decimal" />
                      </Field>
                      <Field label="Net pay ($)" htmlFor="p-net">
                        <Input id="p-net" name="net" inputMode="decimal" required />
                      </Field>
                      <Field label="Gross pay ($)" htmlFor="p-gross">
                        <Input id="p-gross" name="gross" inputMode="decimal" />
                      </Field>
                    </div>
                    <SubmitButton size="sm" className="self-end">
                      Save paycheck
                    </SubmitButton>
                  </ActionForm>
                </details>
              </Card>
              <Card className="p-5 text-sm text-text-2">
                <h2 className="mb-1 text-[13px] font-semibold tracking-wide uppercase">UKG Pro</h2>
                Not connected. UKG API access is normally issued to employers, not personal logins, so LifeFlow uses manual entry and Jarvis-assisted schedule import for now. <Link href="/settings/integrations" className="text-accent hover:underline">Details</Link>
              </Card>
            </div>
          </div>
        </>
      )}
    </>
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
          <Input id="e-pos" name="position" placeholder="Student assistant" />
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
      <SubmitButton className="self-end">Save job</SubmitButton>
    </ActionForm>
  );
}
