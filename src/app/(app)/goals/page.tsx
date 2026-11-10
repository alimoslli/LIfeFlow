import { AssistantName } from "@/components/assistant-name";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton, ActionForm } from "@/components/action-form";
import { PixelIcon, pixel, type IconLike } from "@/components/pixel/pixel-icon";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, EmptyState } from "@/components/ui/surface";
import { SegmentedNav } from "@/components/ui/segmented-nav";
import { BOOKS, PixelArt, SkyWindow, STAR } from "@/components/skylings/sky-window";
import { MySkyling, SkylingIcon } from "@/components/skylings/sprite";
import { formatDateStr, todayIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requireUser, withCurrentUser } from "@/server/auth/current-user";
import { moneyLocked } from "@/server/auth/money-lock";
import { series } from "@/server/db/series";
import { MILESTONE_CATEGORIES, type MilestoneCategory } from "@/server/db/schema";
import { listAccounts } from "@/server/services/finance/accounts";
import { goalsWithPlans } from "@/server/services/finance/goals";
import { recentCheckins } from "@/server/services/goal-checkins";
import { listHabits } from "@/server/services/habits";
import { lifeTimeline, whenLabel, type TimelineItem } from "@/server/services/milestones";
import { listPersonalGoals } from "@/server/services/personal-goals";
import { AskJarvisButton, CelebrateGoal } from "../money/money-client";
import { checkHabitAction } from "../habits/actions";
import { HabitsSection } from "../habits/habits-section";
import { createMilestoneAction, deleteMilestoneAction, updateMilestoneAction } from "../milestones/actions";
import { setPersonalGoalDoneAction, stepPersonalGoalAction } from "./actions";
import { closestAim, squares } from "./closest";
import { AddSheet, GoalSheet } from "./goal-sheet";
import { PURPOSE } from "./purpose";
import { MoneyGoalCard, NewMoneyGoal } from "./money-goal-card";
import { GoalCheckin, NewPersonalGoal, PersonalGoals } from "./personal-goals";

export const metadata: Metadata = { title: "Goals" };

const whole = (c: number) => formatCents(c).replace(/\.\d\d$/, "");

const VIEWS = [
  { key: "aiming", href: "/goals", label: "Aiming for" },
  { key: "done", href: "/goals?view=done", label: "Done" },
];

// our pixel pictures for each kind of moment
const CATEGORY: Record<MilestoneCategory, { label: string; icon: IconLike }> = {
  school: { label: "School", icon: pixel("class") },
  work: { label: "Work", icon: pixel("shift") },
  money: { label: "Money", icon: pixel("money") },
  health: { label: "Health", icon: pixel("health") },
  travel: { label: "Travel", icon: pixel("pin") },
  family: { label: "Family", icon: pixel("person") },
  personal: { label: "Personal", icon: pixel("star") },
};

const TELL_STORY =
  "I want to tell you about milestones in my life. Ask me one short question at a time about things I've done (school, work, moves, trips, achievements), and add each one to my milestones with the year.";
const PLAN_GOAL = "Help me set a goal. Ask me one question at a time about what I want to reach, then create it.";

const STREAK_UNIT = { daily: "days", weekly: "weeks", weekends: "weekends", payday: "paydays" } as const;

export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ view?: string; imported?: string }> }) {
  const { view, imported } = await searchParams;
  const done = view === "done";
  // Personal goals and habits are always here; only money goals wait for the Money lock.
  const locked = await moneyLocked(await requireUser());
  const d = await withCurrentUser(async (s, u) => {
    const today = todayIn(u.timezone);
    if (done) {
      const items = await lifeTimeline(s, { includeMoney: !locked, tz: u.timezone });
      const personal = await listPersonalGoals(s);
      const [money, checkins] = await series(
        async () => (locked ? [] : await goalsWithPlans(s, today)),
        async () =>
          recentCheckins(
            s,
            personal.map((g) => g.id),
            1,
          ),
      );
      return { today, tz: u.timezone, items, personal, money, accounts: [], checkins, habits: [] };
    }
    const personal = await listPersonalGoals(s);
    const [money, accounts, habits] = await series(
      async () => (locked ? [] : await goalsWithPlans(s, today)),
      async () => (locked ? [] : await listAccounts(s, { types: ["depository", "investment", "cash"] })),
      async () => listHabits(s, today),
    );
    const checkins = await recentCheckins(s, [...personal.map((g) => g.id), ...money.map((g) => g.id)], 1);
    return { today, tz: u.timezone, items: [] as TimelineItem[], personal, money, accounts, checkins, habits };
  });
  const year = Number(d.today.slice(0, 4));

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6 lg:max-w-[720px]">
      {!done && d.money.find((g) => g.milestoneToCelebrate) && (
        <CelebrateGoal
          goalId={d.money.find((g) => g.milestoneToCelebrate)!.id}
          name={d.money.find((g) => g.milestoneToCelebrate)!.name}
          percent={d.money.find((g) => g.milestoneToCelebrate)!.milestoneToCelebrate!}
        />
      )}
      <header className="animate-rise flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{formatDateStr(d.today, "EEEE, MMMM d")}</p>
          <h1 className="mt-1 font-display text-[2.5rem] leading-none font-medium tracking-tight">Goals</h1>
        </div>
        {done ? (
          <AddSheet label="Milestone" title="Add a milestone">
            <Card className="p-5">
              <ActionForm action={createMilestoneAction} cheer={{ size: "big", label: "Milestone!" }} className="flex flex-col gap-3">
                <Field label="What happened" htmlFor="ms-title">
                  <Input id="ms-title" name="title" required maxLength={200} placeholder="Graduated from high school" />
                </Field>
                <div className="flex gap-3">
                  <Field label="When" htmlFor="ms-when" className="flex-1">
                    <Input id="ms-when" name="when" maxLength={40} placeholder="2022 or May 2022" />
                  </Field>
                  <Field label="Kind" htmlFor="ms-cat" className="flex-1">
                    <Select id="ms-cat" name="category" defaultValue="personal">
                      {MILESTONE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY[c].label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <SubmitButton>Add milestone</SubmitButton>
              </ActionForm>
            </Card>
            <AskJarvisButton prompt={TELL_STORY}>
              <SkylingIcon className="h-5 w-5" /> Tell <AssistantName /> your story
            </AskJarvisButton>
          </AddSheet>
        ) : (
          <AddSheet label="Goal" title="Add a goal">
            <NewPersonalGoal />
            {!locked && <NewMoneyGoal accounts={d.accounts} />}
            <AskJarvisButton prompt={PLAN_GOAL}>
              <SkylingIcon className="h-5 w-5" /> Plan a goal with <AssistantName />
            </AskJarvisButton>
          </AddSheet>
        )}
      </header>

      <SegmentedNav label="Goals" items={VIEWS} active={done ? "done" : "aiming"} />

      {done ? <DoneView d={d} year={year} imported={imported} /> : <AimingView d={d} locked={locked} />}
    </div>
  );
}

type Data = {
  today: string;
  tz: string;
  items: TimelineItem[];
  personal: Awaited<ReturnType<typeof listPersonalGoals>>;
  money: Awaited<ReturnType<typeof goalsWithPlans>>;
  accounts: Awaited<ReturnType<typeof listAccounts>>;
  checkins: Awaited<ReturnType<typeof recentCheckins>>;
  habits: Awaited<ReturnType<typeof listHabits>>;
};

function AimingView({ d, locked }: { d: Data; locked: boolean }) {
  const openPersonal = d.personal.filter((g) => !g.doneAt);
  const activeMoney = d.money.filter((g) => g.status === "active");

  const aims = [
    ...openPersonal.map((g) => ({
      key: g.id,
      fraction: g.target != null ? Math.min(1, g.progress / g.target) : null,
      date: g.targetDate,
      title: g.title,
      done: g.progress,
      total: g.target,
      line:
        g.target != null
          ? `${g.progress} done, ${Math.max(0, g.target - g.progress)} to go`
          : g.targetDate
            ? `By ${formatDateStr(g.targetDate, "MMMM d")}`
            : "Not done yet",
    })),
    ...activeMoney.map((g) => ({
      key: g.id,
      fraction: g.percent / 100,
      date: g.targetDate,
      title: g.name,
      done: g.percent,
      total: 100,
      line: `${whole(g.savedCents)} of ${whole(g.targetCents)} saved`,
    })),
  ];
  const closest = closestAim(aims);
  const sq = closest && closest.total != null ? squares(closest.done, closest.total) : { filled: 0, count: 0 };
  const checkinGoals = [...openPersonal.map((g) => ({ id: g.id, title: g.title })), ...activeMoney.map((g) => ({ id: g.id, title: g.name }))];
  const habits = d.habits.filter((h) => h.active);

  return (
    <>
      <section className="animate-rise" aria-label="Closest goal">
        <SkyWindow tz={d.tz} data-tilt className="rounded-[1.75rem]">
          <div className="relative min-h-[12rem] px-6 pt-6 pb-6">
            <p className="text-xs font-semibold tracking-[0.18em] text-white/80 uppercase">{closest ? "Closest" : "Goals"}</p>
            <p className="lf-sw-num mt-2 max-w-[62%] font-display text-[1.75rem] leading-tight font-medium break-words">
              {closest ? closest.title : "What are you aiming for?"}
            </p>
            <p className="mt-1 max-w-[62%] text-sm text-white/80">{closest ? closest.line : "Add a goal with the button above."}</p>
            {sq.count > 0 && (
              <div className="mt-4 flex max-w-[62%] gap-1" role="img" aria-label={`${sq.filled} of ${sq.count}`}>
                {Array.from({ length: sq.count }, (_, i) => (
                  <span key={i} className={cn("h-2.5 min-w-0 flex-1 rounded-[2px]", i < sq.filled ? "bg-sun" : "bg-white/30")} />
                ))}
              </div>
            )}
            <div className="absolute right-5 bottom-0 flex flex-col items-center">
              <MySkyling className="relative z-10 -mb-1.5 h-16 w-16 cursor-pointer" />
              <PixelArt art={BOOKS} className="w-12" />
            </div>
          </div>
        </SkyWindow>
      </section>

      <section aria-label="Aiming for">
        <h2 className="mb-3 font-display text-[1.3125rem] leading-none font-medium tracking-tight">Aiming for</h2>
        {locked && (
          <Link href="/money" className="mb-2 flex min-h-14 items-center gap-3 rounded-3xl bg-surface px-5 shadow-soft">
            <PixelIcon name="lock" className="h-6 w-6" />
            <span className="flex-1 text-[0.9375rem]">Money is locked. Unlock it to see money goals.</span>
          </Link>
        )}
        {openPersonal.length === 0 && activeMoney.length === 0 ? (
          <Card>
            <EmptyState icon={<PixelIcon name="target" />} title="What are you working toward?">
              Run a 5K, read 12 books, save for a trip. Tap + Goal to add one.
            </EmptyState>
          </Card>
        ) : (
          <ul className="lf-tiles">
            {openPersonal.map((g) => {
              const measured = g.target != null;
              return (
                <li key={g.id} className="flex items-center gap-1 pr-2">
                  <GoalSheet
                    title={g.title}
                    className="flex min-h-16 flex-1 items-center gap-3.5 py-3 pl-4"
                    trigger={
                      <>
                        <PixelIcon name="flag" className="h-8 w-8 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 block text-[0.9375rem] font-semibold break-words">{g.title}</span>
                          <span className="block truncate text-[0.8125rem] text-muted">
                            {measured
                              ? `${g.progress} of ${g.target}${g.unit ? ` ${g.unit}` : ""}${g.targetDate ? ` · by ${formatDateStr(g.targetDate, "MMM d")}` : ""}`
                              : g.targetDate
                                ? `By ${formatDateStr(g.targetDate, "MMMM d")}`
                                : "Not done yet"}
                          </span>
                        </span>
                      </>
                    }
                  >
                    <PersonalGoals goals={[g]} checkins={d.checkins} />
                  </GoalSheet>
                  {measured ? (
                    <ActionButton
                      action={stepPersonalGoalAction.bind(null, g.id, g.progress + 1)}
                      title={`One more for "${g.title}"`}
                      cheer={g.progress + 1 >= g.target! ? { size: "big", label: "Goal reached!" } : { size: "small" }}
                      className="lf-sb lf-sb-app lf-sb-sm shrink-0"
                    >
                      +1
                    </ActionButton>
                  ) : (
                    <ActionButton
                      action={setPersonalGoalDoneAction.bind(null, g.id, true)}
                      title={`Mark "${g.title}" done`}
                      cheer={{ size: "big", label: "Goal reached!" }}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-border-strong text-transparent"
                    >
                      <PixelIcon name="check" className="h-5 w-5" />
                    </ActionButton>
                  )}
                </li>
              );
            })}
            {activeMoney.map((g) => {
              const P = (PURPOSE[g.purpose] ?? PURPOSE.other).icon;
              return (
                <li key={g.id}>
                  <GoalSheet
                    title={g.name}
                    className="flex min-h-16 w-full items-center gap-3.5 px-4 py-3"
                    trigger={
                      <>
                        <P className="h-8 w-8 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 block text-[0.9375rem] font-semibold break-words">{g.name}</span>
                          <span className="block truncate text-[0.8125rem] text-muted">
                            {whole(g.savedCents)} of {whole(g.targetCents)} saved
                          </span>
                        </span>
                      </>
                    }
                  >
                    <MoneyGoalCard g={g} />
                  </GoalSheet>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Habits">
        <h2 className="mb-3 font-display text-[1.3125rem] leading-none font-medium tracking-tight">Every day</h2>
        <ul className="lf-tiles lf-tiles-2">
          {habits.map((h) => (
            <li key={h.id} className="flex flex-col gap-1 p-3">
              <div className="flex items-start justify-between">
                <PixelIcon name="flame" className={cn("h-8 w-8", !h.current && "opacity-40 grayscale")} />
                <ActionButton
                  action={checkHabitAction.bind(null, h.id, !h.doneThisPeriod)}
                  title={h.doneThisPeriod ? `Uncheck ${h.title}` : `Done: ${h.title}`}
                  className={cn(
                    "-mt-1 -mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2",
                    h.doneThisPeriod ? "border-accent bg-accent text-accent-text" : "border-border-strong text-transparent",
                  )}
                >
                  <PixelIcon name="check" className="h-5 w-5" />
                </ActionButton>
              </div>
              <p className="line-clamp-2 text-[0.9375rem] font-semibold break-words">{h.title}</p>
              <p className="text-[0.8125rem] text-muted">{h.current > 0 ? `${h.current} ${STREAK_UNIT[h.cadence]} in a row` : "Start today"}</p>
            </li>
          ))}
          <li className="basis-full">
            <GoalSheet title="Habits" className="flex min-h-14 w-full items-center gap-3 px-4 py-3" trigger={<HabitsDoor empty={habits.length === 0} />}>
              <HabitsSection />
            </GoalSheet>
          </li>
        </ul>
      </section>

      <GoalCheckin goals={checkinGoals} checkins={d.checkins} today={d.today} />
    </>
  );
}

function HabitsDoor({ empty }: { empty: boolean }) {
  return (
    <>
      <PixelIcon name="plus" className="h-6 w-6 shrink-0" />
      <span className="text-[0.9375rem] font-semibold">{empty ? "Start a habit" : "Add or manage habits"}</span>
    </>
  );
}

function groupLabel(i: TimelineItem, year: number) {
  if (!i.date) return "No date";
  const [y, m] = i.date.split("-").map(Number);
  if (i.precision === "year") return String(y);
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return y === year ? month : `${month} ${y}`;
}

function DoneView({ d, year, imported }: { d: Data; year: number; imported?: string }) {
  const thisYear = d.items.filter((i) => i.date?.startsWith(String(year))).length;
  const groups: { label: string; items: TimelineItem[] }[] = [];
  for (const i of d.items) {
    const label = groupLabel(i, year);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(i);
    else groups.push({ label, items: [i] });
  }
  const [facts, ms, goals] = (imported ?? "").split(".").map(Number);

  return (
    <>
      {imported && (
        <p className="rounded-2xl bg-success-soft px-4 py-3 text-sm text-success" role="status">
          Imported{" "}
          {[facts ? `${facts} about you` : "", ms ? `${ms} milestone${ms === 1 ? "" : "s"}` : "", goals ? `${goals} goal${goals === 1 ? "" : "s"}` : ""]
            .filter(Boolean)
            .join(", ")}
          .
        </p>
      )}
      <section className="animate-rise" aria-label={`Done in ${year}`}>
        <SkyWindow tz={d.tz} data-tilt className="rounded-[1.75rem]">
          <div className="relative min-h-[10rem] px-6 pt-6 pb-5">
            <p className="text-xs font-semibold tracking-[0.18em] text-white/80 uppercase">Done in {year}</p>
            <p className="lf-sw-num tabular mt-2 font-display text-[3.375rem] leading-none font-medium">{thisYear}</p>
            <div className="absolute right-5 bottom-0 flex flex-col items-center">
              <MySkyling className="relative z-10 -mb-1.5 h-16 w-16 cursor-pointer" />
              <PixelArt art={STAR} className="w-12" />
            </div>
          </div>
        </SkyWindow>
      </section>

      {d.items.length === 0 && (
        <Card>
          <EmptyState icon={<PixelIcon name="goal" />} title="Your story starts here">
            Add the things you&apos;ve done: graduating, a first job, moving out, a race you finished. Every goal you reach lands here too. Tap + Milestone.
          </EmptyState>
        </Card>
      )}

      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h2 className="mb-2 px-1 text-[0.9375rem] font-semibold text-muted">{g.label}</h2>
          <ol className="lf-tiles">
            {g.items.map((i) => {
              const C =
                i.kind === "milestone" ? CATEGORY[i.category] : { label: "Goal reached", icon: i.kind === "money_goal" ? pixel("target") : pixel("goal") };
              const day = i.date && i.precision === "day" ? formatDateStr(i.date, "MMM d") : null;
              const personal = i.kind === "goal" ? d.personal.find((p) => p.id === i.id) : undefined;
              const money = i.kind === "money_goal" ? d.money.find((m) => m.id === i.id) : undefined;
              return (
                <li key={`${i.kind}-${i.id}`}>
                  <GoalSheet
                    title={i.title}
                    className="flex min-h-16 w-full items-center gap-3.5 px-4 py-3"
                    trigger={
                      <>
                        <C.icon className="h-8 w-8 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.9375rem] font-semibold break-words">{i.title}</span>
                          <span className="block text-[0.8125rem] text-muted">{[day, C.label].filter(Boolean).join(" · ")}</span>
                          {i.note && <span className="mt-0.5 block text-sm text-text-2">{i.note}</span>}
                        </span>
                      </>
                    }
                  >
                    {i.kind === "milestone" ? (
                      <ActionForm action={updateMilestoneAction.bind(null, i.id)} reset={false} showSuccess className="flex flex-col gap-3">
                        <Field label="What happened" htmlFor={`ms-t-${i.id}`}>
                          <Input id={`ms-t-${i.id}`} name="title" defaultValue={i.title} required maxLength={200} />
                        </Field>
                        <div className="flex gap-3">
                          <Field label="When" htmlFor={`ms-w-${i.id}`} className="flex-1">
                            <Input
                              id={`ms-w-${i.id}`}
                              name="when"
                              defaultValue={i.date ? (i.precision === "day" ? i.date : (whenLabel(i) ?? "")) : ""}
                              placeholder="2022 or May 2022"
                            />
                          </Field>
                          <Field label="Kind" htmlFor={`ms-c-${i.id}`} className="flex-1">
                            <Select id={`ms-c-${i.id}`} name="category" defaultValue={i.category}>
                              {MILESTONE_CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {CATEGORY[c].label}
                                </option>
                              ))}
                            </Select>
                          </Field>
                        </div>
                        <Field label="Note (optional)" htmlFor={`ms-n-${i.id}`}>
                          <Input id={`ms-n-${i.id}`} name="note" defaultValue={i.note ?? ""} maxLength={500} />
                        </Field>
                        <SubmitButton size="sm" className="self-end">
                          Save
                        </SubmitButton>
                        <ActionButton
                          action={deleteMilestoneAction.bind(null, i.id)}
                          confirm={`Delete "${i.title}"?`}
                          title={`Delete ${i.title}`}
                          className="flex items-center gap-1 self-start rounded-full px-3 py-1.5 text-sm text-danger hover:bg-danger-soft"
                        >
                          <PixelIcon name="trash" className="h-4 w-4" /> Delete
                        </ActionButton>
                      </ActionForm>
                    ) : personal ? (
                      <PersonalGoals goals={[personal]} checkins={d.checkins} />
                    ) : money ? (
                      <MoneyGoalCard g={money} />
                    ) : (
                      <p className="text-sm text-text-2">Goal reached.</p>
                    )}
                  </GoalSheet>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      <Link href="/jarvis/memory/import" className="flex min-h-14 items-center gap-3 rounded-3xl bg-surface px-5 py-4 shadow-soft">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <PixelIcon name="download" className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-medium">Import from ChatGPT or another AI</span>
          <span className="block text-xs text-muted">Bring your story, milestones and goals in one paste.</span>
        </span>
      </Link>
    </>
  );
}
