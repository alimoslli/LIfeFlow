"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { ArrowLeft, BookOpen, Briefcase, CalendarDays, Check, GraduationCap, Layers, Sun } from "lucide-react";
import { gsap, MOTION, prefersReducedMotion, useGSAP } from "@/components/motion/gsap";
import { isHydrated } from "@/components/motion/intro";
import { celebrate } from "@/components/motion/burst";
import { DayClock } from "@/components/day-clock/day-clock";
import { NightSky } from "@/components/skylings/night-sky";
import { cheerSkylings } from "@/components/skylings/night";
import { SkyButton } from "@/components/skylings/sky-button";
import { FormError, Input } from "@/components/ui/field";
import { CompanionGlyph } from "@/components/sky/companion-glyph";
import { ASSISTANT_STYLES, type AssistantStyle } from "@/lib/assistant";
import { COMPANIONS, companionOf, type CompanionKey } from "@/lib/companions";
import type { ClockData } from "@/lib/day-clock";
import type { LifeStage } from "@/lib/life";
import { addDaysStr } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { addClassAction, addDueAction, addWorkAction, completeOnboardingAction, setNameAction, skipOnboardingAction, type SkyResult } from "./actions";

/**
 * First run (owner, 2026-11-09: "catered to the new app ... make sure any user will understand the app and the new way
 * they will see their life"; "we want the users to actually sign up"): it's about building their real sky.
 *   1. skyling: meet the six on the night sky, pick one and name it (research 2026-11-09: the character comes first);
 *   2. you: it says hi and asks what to call you and what fills your week;
 *   3. build: the sky comes up, their real wheel, and every class, shift and due date they add is saved at once and
 *      lands on it while they watch;
 *   4. learn: they turn it, open it into the week and fold it back themselves, each one ticked off;
 *   5. connect: their calendar and Canvas can fill it from now on, or straight to their sky.
 * No made-up demo day: everything on screen is theirs.
 */
type StepId = "skyling" | "you" | "build" | "learn" | "connect";
const STEPS: StepId[] = ["skyling", "you", "build", "learn", "connect"];

/** What each step changes (research 2026-11-09, proposal 3: a step that changes nothing is cut). */
const CHANGES: Record<StepId, string> = {
  skyling: "Changes who sits on top of your sky, and how it talks to you.",
  you: "Changes what your skyling calls you and what fills your sky.",
  build: "Everything you add is saved, and it's on your sky right away.",
  learn: "Nothing to save here. Just try it.",
  connect: "Connected things come in on their own. You can disconnect anytime.",
};

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u;
const WEEK = ["S", "M", "T", "W", "T", "F", "S"];
const WEEK_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** What it sounds like before a skyling is picked (each one has its own line, lib/companions). */
const SAMPLE = "You've got 2 things due this week. The BIO lab is the big one, so let's start it Tuesday. You've got this.";

/** What's free. `paid` is false while LifeFlow is free for everyone (testing). */
export type PlanInfo = { paid: boolean; freeChatsPerDay: number; proFeatures: string[] };
type Added = { kind: "class" | "work" | "due"; label: string };

export function Onboarding({ firstName, plan, clock: firstClock }: { firstName: string; plan: PlanInfo; clock: ClockData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const dir = useRef(1);
  const step = STEPS[index];

  // 1. the skyling
  const [companion, setCompanion] = useState<CompanionKey | null>(null);
  const [name, setName] = useState("");
  const [style, setStyle] = useState<AssistantStyle>("friend");
  const chosen = companion ? companionOf(companion) : null;
  const cleanName = useMemo(() => name.trim().replace(/\s+/g, " "), [name]);
  const nameOk = cleanName.length === 0 || (cleanName.length <= 24 && NAME_RE.test(cleanName));
  const shown = cleanName && nameOk ? cleanName : null;
  const pick = (k: CompanionKey) => {
    const c = companionOf(k);
    if (!cleanName || COMPANIONS.some((x) => x.name === cleanName)) setName(c.name);
    setCompanion(k);
    setStyle(c.tone);
    cheerSkylings(); // the whole sky cheers your pick
  };

  // 2. you
  const [yourName, setYourName] = useState(firstName === "there" ? "" : firstName);
  const cleanYou = yourName.trim().replace(/\s+/g, " ");
  const [stage, setStage] = useState<LifeStage | null>(null);
  const school = stage === "student" || stage === "both";
  const work = stage === "working" || stage === "both";

  // 3. the sky they build
  const [clock, setClock] = useState(firstClock);
  const [added, setAdded] = useState<Added[]>([]);

  const panel = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (!panel.current || prefersReducedMotion() || (index === 0 && !isHydrated())) return;
      gsap.fromTo(panel.current, { x: 28 * dir.current, opacity: 0 }, { x: 0, opacity: 1, duration: MOTION.enter, ease: MOTION.ease });
      gsap.from(panel.current.querySelectorAll("[data-anim]"), {
        y: 10,
        opacity: 0,
        duration: MOTION.enter,
        ease: MOTION.ease,
        stagger: MOTION.stagger,
        delay: 0.05,
      });
    },
    { dependencies: [index], scope: panel },
  );

  const go = (delta: number) => {
    dir.current = delta;
    setError(null);
    setIndex((i) => Math.max(0, Math.min(STEPS.length - 1, i + delta)));
    window.scrollTo({ top: 0 });
  };

  const next = () => {
    if (step === "you" && cleanYou !== firstName) {
      start(async () => {
        const r = await setNameAction(cleanYou);
        if (!r?.ok) return setError(r?.error ?? "Couldn't save your name. Try again.");
        go(1);
      });
      return;
    }
    go(1);
  };

  /** Saves one thing for real and puts the sky it comes back with on screen, with a star where it was added. */
  const add = (kind: Added["kind"], label: string, save: () => Promise<SkyResult>, at: DOMRect | undefined, after: () => void) =>
    start(async () => {
      setError(null);
      const r = await save();
      if (!r.ok) return setError(r.error);
      setClock(r.clock);
      setAdded((a) => [...a, { kind, label }]);
      celebrate(at, "small", "On your sky");
      cheerSkylings();
      after();
    });

  /** Finishes setup (their skyling and what fills their week; everything else is already saved) and goes on. */
  const finish = (to: string) =>
    start(async () => {
      if (!nameOk) return setError("Use letters, numbers, spaces or simple punctuation for the name (up to 24 characters).");
      const r = await completeOnboardingAction({
        lifeStage: stage ?? undefined,
        assistant: { name: cleanName || undefined, style, companion: companion ?? undefined },
      });
      if (r?.ok) router.replace(to);
      else setError(r?.error ?? "Couldn't save. Try again.");
    });

  const skipAll = () =>
    start(async () => {
      const r = await skipOnboardingAction();
      if (r?.ok) router.replace("/");
      else setError(r?.error ?? "Couldn't continue. Try again.");
    });

  const night = step === "skyling" || step === "you";
  return (
    <div className="lf-glass min-h-dvh bg-bg">
      {/* the top: the skylings' night while you meet them; then the sun comes up on your own sky */}
      {night ? (
        <div className="relative isolate h-[clamp(12rem,30svh,19rem)] overflow-hidden bg-night-ground md:h-[clamp(15rem,34vh,22rem)]">
          <div className="absolute inset-x-0 top-0 bottom-8">
            <NightSky stage="strip" focus={companion} />
          </div>
        </div>
      ) : (
        <div className="lf-welcome-sky relative mx-auto w-full max-w-3xl pb-8 md:pt-4">
          {/* building: the sky pours into the week, so every class, shift and due date lands on its day; learning: folded
              back, for them to turn and open themselves */}
          <DayClock data={clock} mode="full" companion={companion} open={step === "build" ? true : step === "learn" ? false : undefined} />
        </div>
      )}

      <div className="relative z-10 mx-auto -mt-8 flex min-h-[60dvh] w-full max-w-xl flex-col rounded-t-[2rem] bg-bg px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-10 md:min-h-0 md:rounded-[2rem] md:pb-8 md:shadow-lift">
        <header className="flex h-10 items-center justify-between">
          {index > 0 ? (
            <button
              onClick={() => go(-1)}
              className="-ml-3 flex h-11 w-11 items-center justify-center rounded-full text-muted hover:text-text"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-1.5" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === index ? "w-6 bg-dawn-2" : i < index ? "w-1.5 bg-dawn-2/60" : "w-1.5 bg-surface-3",
                )}
              />
            ))}
          </div>
          <button onClick={skipAll} disabled={pending} className="-mr-2 flex min-h-11 items-center rounded-full px-2 text-sm text-muted hover:text-text">
            Skip setup
          </button>
        </header>

        <div ref={panel} className="flex flex-1 flex-col pt-5 md:flex-none md:pt-6">
          {step === "skyling" && (
            <>
              <Title sub="Pick yours, a little one from the sky who keeps an eye on your day.">Meet the skylings</Title>
              <div className="mt-6 flex flex-col gap-6">
                <div data-anim role="radiogroup" aria-label="Your skyling" className="grid grid-cols-3 gap-2">
                  {COMPANIONS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      role="radio"
                      aria-checked={companion === c.key}
                      onClick={() => pick(c.key)}
                      className={cn(
                        "flex min-h-24 flex-col items-center justify-center gap-0.5 rounded-[1.25rem] px-1 py-2 transition-all duration-300 active:scale-95",
                        companion === c.key
                          ? "-translate-y-0.5 bg-gradient-to-b from-dawn-1 to-dawn-2 text-ink-night shadow-lift ring-2 ring-dawn-3"
                          : "bg-surface shadow-soft hover:-translate-y-0.5",
                      )}
                    >
                      <CompanionGlyph
                        companion={c.key}
                        night={c.key === "star"}
                        pose={companion === c.key ? "celebrate" : "idle"}
                        frame={companion === c.key ? 1 : 0}
                        className="h-12 w-12"
                      />
                      <span className="text-[0.9375rem] font-medium">{c.name}</span>
                      <span className={cn("text-xs", companion === c.key ? "text-ink-night/75" : "text-muted")}>{c.moment}</span>
                    </button>
                  ))}
                </div>
                {chosen && (
                  <p className="-mt-2 text-sm leading-relaxed text-text-2" aria-live="polite">
                    <span className="font-medium text-text">{chosen.line}</span> Best at {chosen.skill.charAt(0).toLowerCase() + chosen.skill.slice(1)} Talks
                    like a {ASSISTANT_STYLES[chosen.tone].label.toLowerCase()}.
                  </p>
                )}
                <Group label="Its name">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={24}
                    placeholder="your skyling"
                    aria-label="Skyling's name"
                    autoCapitalize="words"
                    autoComplete="off"
                    className="min-h-11 text-[1rem]"
                  />
                  <p className="mt-1.5 text-xs text-muted">{chosen ? "Keep the name or type your own." : "Optional. Pick one above, or type a name."}</p>
                  <div className="mt-3 flex gap-2.5 rounded-2xl bg-surface-2 p-3.5" aria-live="polite">
                    <CompanionGlyph companion={companion} className="h-7 w-7" />
                    <p className="text-[0.875rem] leading-relaxed text-text-2">
                      <span className="font-semibold text-text">{shown ?? "Your skyling"}:</span> {chosen ? chosen.sample : SAMPLE}{" "}
                      {/* the numbers in a sample line are made up (research 2026-11-09, rule 6) */}
                      <span className="ml-1 rounded-full bg-surface px-2 py-0.5 text-[0.6875rem] font-medium text-muted">Example</span>
                    </p>
                  </div>
                </Group>
              </div>
            </>
          )}

          {step === "you" && (
            <>
              <div data-anim className="flex items-end gap-3">
                <CompanionGlyph companion={companion} night={companion === "star"} pose="celebrate" frame={3} className="lf-breathe h-14 w-14" />
                <h1 className="font-display text-[2.75rem] leading-[1.05] font-medium tracking-tight">Hi{cleanYou ? ` ${cleanYou.split(" ")[0]}` : ""}.</h1>
              </div>
              <p data-anim className="mt-3 text-[1.0625rem] leading-relaxed text-text-2">
                I&apos;m {shown ?? "your skyling"}. Two quick things, and then we build your sky together.
              </p>
              <label data-anim className="mt-6 flex flex-col gap-1.5">
                <span className="text-sm font-medium text-text-2">What should I call you?</span>
                <Input
                  aria-label="What should I call you?"
                  value={yourName}
                  onChange={(e) => setYourName(e.target.value)}
                  maxLength={80}
                  autoComplete="given-name"
                  className="min-h-11"
                />
              </label>
              <p data-anim className="mt-6 mb-2 text-sm font-medium text-text-2">
                What fills your week?
              </p>
              <div data-anim className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="What fills your week">
                {(
                  [
                    ["student", "Classes", "I'm a student", BookOpen],
                    ["working", "Work", "I have a job", Briefcase],
                    ["both", "Both", "Classes and a job", Layers],
                    ["life", "Neither", "My day and my money", Sun],
                  ] as const
                ).map(([value, label, hint, Icon]) => (
                  <button
                    key={value}
                    role="radio"
                    aria-checked={stage === value}
                    onClick={() => setStage(value)}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-2xl px-4 py-3.5 text-left transition-all active:scale-[0.98]",
                      stage === value ? "bg-gradient-to-b from-dawn-1 to-dawn-2 text-ink-night shadow-lift ring-2 ring-dawn-3" : "bg-surface shadow-soft",
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.8} />
                    <span className="text-[1rem] font-medium">{label}</span>
                    <span className={cn("text-xs", stage === value ? "text-ink-night/75" : "text-muted")}>{hint}</span>
                  </button>
                ))}
              </div>
              <p data-anim className="mt-5 rounded-2xl bg-surface-2 px-4 py-3 text-[0.9375rem] leading-snug text-text-2">
                {plan.paid
                  ? `Free plan: everything you add yourself, and ${plan.freeChatsPerDay} chats with your skyling a day. Pro adds ${listOf(plan.proFeatures)}.`
                  : "LifeFlow is free while we're testing. Everything is open to you."}
              </p>
            </>
          )}

          {step === "build" && (
            <>
              <Title sub="Here's your sky, opened into your week. Add what fills it and watch each one land on its day.">Build your sky</Title>
              <div className="mt-5 flex flex-col gap-3">
                {school && (
                  <WeeklyAdder
                    icon={GraduationCap}
                    title="A class"
                    namePlaceholder="BIO 110"
                    nameLabel="Class name"
                    disabled={pending}
                    onAdd={(v, at, done) =>
                      add("class", `${v.name} · ${v.days.map((d) => WEEK_NAMES[d]).join("/")} ${v.start}`, () => addClassAction(v), at, done)
                    }
                  />
                )}
                {work && (
                  <WeeklyAdder
                    icon={Briefcase}
                    title="Your usual work hours"
                    namePlaceholder="Campus Coffee"
                    nameLabel="Where you work"
                    disabled={pending}
                    onAdd={(v, at, done) =>
                      add("work", `${v.name} · ${v.days.map((d) => WEEK_NAMES[d]).join("/")} ${v.start}`, () => addWorkAction(v), at, done)
                    }
                  />
                )}
                <DueAdder
                  today={clock.today}
                  disabled={pending}
                  onAdd={(v, at, done) => add("due", `${v.title} · ${v.date.slice(5).replace("-", "/")}`, () => addDueAction(v), at, done)}
                />
                {added.length > 0 && (
                  <ul data-anim className="flex flex-col gap-1.5 rounded-2xl bg-surface-2 p-3.5" aria-label="On your sky">
                    {added.map((a, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-text-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-ink-night text-star-gold" aria-hidden>
                          <Check className="h-3 w-3" strokeWidth={3.2} />
                        </span>
                        {a.label}
                      </li>
                    ))}
                  </ul>
                )}
                <p data-anim className="text-[0.8125rem] leading-relaxed text-muted">
                  <CalendarDays className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                  Got a calendar or Canvas? You can connect it in a minute and your sky fills itself.
                </p>
              </div>
            </>
          )}

          {step === "learn" && <Learn />}

          {step === "connect" && (
            <>
              <Title sub="Connect once and new classes, shifts and due dates come in on their own. You approve what they change.">
                Let your sky fill itself
              </Title>
              <ul data-anim className="mt-5 flex flex-col gap-2.5">
                {[
                  ["Google Calendar", "Your plans, classes and shifts from your calendar"],
                  ["Outlook and Teams", "School or work calendar, and Teams meetings"],
                  ["Canvas", "Assignments and due dates, counted back so nothing's a surprise"],
                ].map(([t, d]) => (
                  <li key={t}>
                    <button
                      type="button"
                      onClick={() => finish("/settings/integrations")}
                      disabled={pending}
                      className="flex w-full items-center gap-3 rounded-2xl bg-surface px-4 py-3.5 text-left shadow-soft transition-transform active:scale-[0.99]"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                        <CalendarDays className="h-5 w-5 text-text-2" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.9375rem] font-medium">{t}</span>
                        <span className="block text-sm text-muted">{d}</span>
                      </span>
                      <span className="text-sm font-medium text-morning-link">Connect</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p data-anim className="mt-3 text-[0.8125rem] text-muted">
                Your bank can come later, from Money, when you want it.
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 pt-8">
          <p className="flex items-center gap-2 text-[0.8125rem] text-muted">
            <span className="h-1.5 w-1.5 shrink-0 bg-dawn-2" aria-hidden />
            {CHANGES[step]}
          </p>
          {error && <FormError message={error} />}
          {step === "connect" ? (
            <SkyButton onClick={() => finish("/")} loading={pending} disabled={!nameOk} skyling={companion ?? "ray"} className="w-full justify-between pl-6">
              Go to my sky
            </SkyButton>
          ) : (
            <SkyButton
              onClick={next}
              disabled={pending || (step === "skyling" && !nameOk) || (step === "you" && (!cleanYou || !stage))}
              skyling={companion ?? "dawn"}
              cheer={step === "skyling" && !!companion}
              variant={step === "build" && added.length === 0 ? "glass" : "sun"}
              day={step === "build" && added.length === 0}
              className="w-full justify-between pl-6"
            >
              {step === "you" ? "Build my sky" : step === "build" ? (added.length ? "That's my week" : "I'll add things later") : "Continue"}
            </SkyButton>
          )}
        </div>
      </div>
    </div>
  );
}

/** A thing that happens every week: a name, the days, from and to. Saved on Add. */
function WeeklyAdder({
  icon: Icon,
  title,
  nameLabel,
  namePlaceholder,
  disabled,
  onAdd,
}: {
  icon: typeof Sun;
  title: string;
  nameLabel: string;
  namePlaceholder: string;
  disabled: boolean;
  onAdd: (v: { name: string; days: number[]; start: string; end: string }, at: DOMRect | undefined, done: () => void) => void;
}) {
  const [name, setName] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [startT, setStart] = useState("");
  const [endT, setEnd] = useState("");
  const btn = useRef<HTMLButtonElement>(null);
  const ready = name.trim() && days.length && startT && endT;
  return (
    <section data-anim className="rounded-[1.5rem] bg-surface p-3.5 shadow-soft sm:p-4" aria-label={title}>
      <p className="flex items-center gap-2 text-[0.9375rem] font-medium">
        <Icon className="h-4.5 w-4.5 text-text-2" strokeWidth={1.8} aria-hidden />
        {title}
      </p>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={namePlaceholder}
        aria-label={nameLabel}
        maxLength={120}
        className="mt-3 min-h-11"
      />
      {/* seven days at 44 px each on a 393 px phone */}
      <div className="mt-2.5 flex justify-between gap-0.5" role="group" aria-label={`${title}: days`}>
        {WEEK.map((d, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={days.includes(i)}
            aria-label={WEEK_NAMES[i]}
            onClick={() => setDays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))}
            className={cn(
              "flex h-11 min-w-0 flex-1 items-center justify-center rounded-xl text-sm font-semibold transition-colors",
              days.includes(i) ? "bg-ink-night text-star-gold" : "bg-surface-2 text-text-2",
            )}
          >
            {d}
          </button>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <Input type="time" value={startT} onChange={(e) => setStart(e.target.value)} aria-label={`${title}: starts`} className="min-h-11 min-w-0 flex-1" />
        <span className="text-sm text-muted">to</span>
        <Input type="time" value={endT} onChange={(e) => setEnd(e.target.value)} aria-label={`${title}: ends`} className="min-h-11 min-w-0 flex-1" />
        <SkyButton
          ref={btn}
          type="button"
          size="sm"
          chip={false}
          variant="sun"
          disabled={disabled || !ready}
          onClick={() =>
            onAdd({ name: name.trim(), days: [...days].sort(), start: startT, end: endT }, btn.current?.getBoundingClientRect(), () => {
              setName("");
              setDays([]);
              setStart("");
              setEnd("");
            })
          }
        >
          Add
        </SkyButton>
      </div>
    </section>
  );
}

/** Something due soon: a name and the day (a time if it has one). */
function DueAdder({
  today,
  disabled,
  onAdd,
}: {
  today: string;
  disabled: boolean;
  onAdd: (v: { title: string; date: string; time?: string }, at: DOMRect | undefined, done: () => void) => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => addDaysStr(today, 1));
  const [time, setTime] = useState("");
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <section data-anim className="rounded-[1.5rem] bg-surface p-4 shadow-soft" aria-label="Something due soon">
      <p className="flex items-center gap-2 text-[0.9375rem] font-medium">
        <CalendarDays className="h-4.5 w-4.5 text-text-2" strokeWidth={1.8} aria-hidden />
        Something due soon
      </p>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Lab report, rent, dentist…"
        aria-label="What's due"
        maxLength={200}
        className="mt-3 min-h-11"
      />
      <div className="mt-2.5 flex items-center gap-2">
        <Input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} aria-label="Due day" className="min-h-11 min-w-0 flex-1" />
        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Due time (optional)" className="min-h-11 min-w-0 flex-1" />
        <SkyButton
          ref={btn}
          type="button"
          size="sm"
          chip={false}
          disabled={disabled || !title.trim() || !date}
          onClick={() =>
            onAdd({ title: title.trim(), date, time: time || undefined }, btn.current?.getBoundingClientRect(), () => {
              setTitle("");
              setTime("");
            })
          }
        >
          Add
        </SkyButton>
      </div>
    </section>
  );
}

/**
 * Learning the sky by doing it, on their own wheel above: turn it, open it into the week, fold it back. Each is ticked
 * when the wheel says it happened (its data-state, and a drag on it).
 */
function Learn() {
  const [done, setDone] = useState({ turn: false, open: false, fold: false });
  useEffect(() => {
    const dc = document.querySelector<HTMLElement>("[data-testid=day-clock]");
    if (!dc) return;
    let opened = false;
    const watch = new MutationObserver(() => {
      const s = dc.dataset.state;
      if (s === "timeline") {
        opened = true;
        setDone((d) => ({ ...d, open: true }));
      }
      if (s === "clock" && opened) setDone((d) => ({ ...d, fold: true }));
    });
    watch.observe(dc, { attributes: true, attributeFilter: ["data-state"] });
    let from: number | null = null;
    const down = (e: PointerEvent) => (from = e.clientX);
    const move = (e: PointerEvent) => {
      if (from != null && Math.abs(e.clientX - from) > 28 && dc.dataset.state === "clock") setDone((d) => ({ ...d, turn: true }));
    };
    const up = () => (from = null);
    const wheel = () => setDone((d) => ({ ...d, turn: true }));
    dc.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") wheel();
    };
    dc.addEventListener("wheel", wheel, { passive: true });
    dc.addEventListener("keydown", key);
    return () => {
      watch.disconnect();
      dc.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dc.removeEventListener("wheel", wheel);
      dc.removeEventListener("keydown", key);
    };
  }, []);
  const rows: [keyof typeof done, string, string][] = [
    ["turn", "Turn it", "Drag the sky sideways. Things rise on the right and set on the left; now is at the top."],
    ["open", "Open it", "Tap the sky. It pours into a line of your whole week."],
    ["fold", "Fold it back", "Pull the line down, or tap Back to now."],
  ];
  return (
    <>
      <Title sub="Your sky is how you'll see your life from now on. Try it up there.">Read your sky</Title>
      <ol data-anim className="mt-5 flex flex-col gap-2.5">
        {rows.map(([k, t, d]) => (
          <li
            key={k}
            className={cn(
              "flex items-start gap-3 rounded-2xl px-4 py-3.5 transition-colors duration-300",
              done[k] ? "bg-gradient-to-b from-dawn-1 to-dawn-2 text-ink-night" : "bg-surface shadow-soft",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
                done[k] ? "bg-ink-night text-star-gold" : "bg-surface-2 text-muted",
              )}
              aria-hidden
            >
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
            <span>
              <span className="block text-[0.9375rem] font-medium">
                {t}
                {done[k] && <span className="sr-only"> (done)</span>}
              </span>
              <span className={cn("block text-sm", done[k] ? "text-ink-night/75" : "text-muted")}>{d}</span>
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

function Title({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <>
      <h1 data-anim className="font-display text-[2.125rem] leading-tight font-medium tracking-tight">
        {children}
      </h1>
      {sub && (
        <p data-anim className="mt-2 text-[0.9375rem] text-muted">
          {sub}
        </p>
      )}
    </>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div data-anim>
      <p className="mb-2 text-sm font-medium text-text-2">{label}</p>
      {children}
    </div>
  );
}

/** "a, b and c" */
function listOf(items: string[]) {
  const lower = items.map((t, i) => (i === 0 ? t.toLowerCase() : t.charAt(0).toLowerCase() + t.slice(1)));
  return lower.length > 1 ? `${lower.slice(0, -1).join(", ")} and ${lower[lower.length - 1]}` : (lower[0] ?? "");
}
