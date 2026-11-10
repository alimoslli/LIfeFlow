"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
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
import { AGE_LINE, BIRTHDAY_NEEDED, birthDateProblem } from "@/lib/birthday";
import { COMPANIONS, companionOf, SKY_CHOICE, SKY_CHOICE_LABEL, type CompanionChoice, type CompanionKey } from "@/lib/companions";
import { useSkyling } from "@/components/skylings/use-skyling";
import type { ClockData } from "@/lib/day-clock";
import type { LifeStage } from "@/lib/life";
import { cn } from "@/lib/utils";
import { connectCanvasFeedAction } from "@/app/(app)/settings/integrations/actions";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import type { PixelName } from "@/components/pixel/art";
import { NotifyAsk } from "@/components/jarvis/notify-ask";
import { completeOnboardingAction, saveWelcomeAction, skipOnboardingAction, skyNowAction } from "./actions";

/**
 * First run (owner, 2026-11-09: "catered to the new app"; "they won't have to add their classes, syncing their school
 * calendar does that, we want to show them how easy it is to sync and connect, and get some info on them like their
 * birth date"):
 *   1. skyling: meet the six on the night sky, pick one and name it (research 2026-11-09: the character comes first);
 *   2. about: it says hi and gets to know them: what to call them, their birthday, what fills their week, their school
 *      or work;
 *   3. connect: their real sky, opened into the week, and one tap each for Canvas, Google Calendar and Outlook; what a
 *      connection brings in lands on the sky (Google and Microsoft come back here, to this step);
 *   4. learn: they turn the wheel, open it into the week and fold it back themselves, each one ticked off.
 * No made-up demo day: everything on screen is theirs. The bank waits for Money (research: never in the first minute).
 */
type StepId = "skyling" | "about" | "connect" | "learn";
const STEPS: StepId[] = ["skyling", "about", "connect", "learn"];

/** What each step changes (research 2026-11-09, proposal 3: a step that changes nothing is cut). */
const CHANGES: Record<StepId, string> = {
  skyling: "Changes who sits on top of your sky, and how it talks to you.",
  about: "Helps your skyling plan around you. Private to your account.",
  connect: "What you connect lands on your sky and stays up to date. You approve what it changes.",
  learn: "Nothing to save here. Just try it.",
};

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u;
/** What it sounds like before a skyling is picked (each one has its own line, lib/companions). */
const SAMPLE = "You've got 2 things due this week. The BIO lab is the big one, so let's start it Tuesday. You've got this.";

/** What's free. `paid` is false while LifeFlow is free for everyone (testing). */
export type PlanInfo = { paid: boolean; freeChatsPerDay: number; proFeatures: string[] };
/** What the welcome kept on the account (it comes back here after connecting Google or Microsoft). */
export type Saved = {
  companion: CompanionChoice | null;
  name: string;
  style: AssistantStyle;
  lifeStage: LifeStage | null;
  birthDate: string;
  school: string;
  job: string;
};
type Source = { available: boolean; connected: boolean };
type SourceKey = "canvas" | "google" | "outlook";
type Back = {
  provider: "google" | "outlook";
  result: "connected" | "denied" | "failed" | "missing_scopes" | "admin_consent" | "not_configured" | "use_main_site";
};

const BACK_TEXT: Record<Back["result"], string> = {
  connected: "is connected. Look up: it's on your sky.",
  denied: "wasn't connected. No problem, you can connect it anytime.",
  failed: "couldn't connect. Try again.",
  missing_scopes: "needs calendar access to fill your sky. Connect again and leave the calendar box ticked.",
  admin_consent: "needs your school or workplace to approve LifeFlow first.",
  not_configured: "isn't available yet.",
  use_main_site: "connects from the main site. Tap Connect again.",
};

export function Onboarding({
  firstName,
  plan,
  clock: firstClock,
  saved,
  back,
  sources,
}: {
  firstName: string;
  plan: PlanInfo;
  clock: ClockData;
  saved: Saved;
  back: Back | null;
  sources: Record<SourceKey, Source>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // coming back from Google or Microsoft: straight to "Connect your sky". After a refresh: where they had got to, from
  // what the account already keeps (about you saved means connecting is next; a skyling picked means about you is next)
  const [index, setIndex] = useState(back || (saved.birthDate && saved.lifeStage) ? 2 : saved.companion ? 1 : 0);
  const dir = useRef(1);
  const step = STEPS[index];

  // 1. the skyling
  const [companion, setCompanion] = useState<CompanionChoice | null>(saved.companion);
  // who to draw: the one picked, or whoever's moment it is for "Changes with the sky"
  const drawn = useSkyling(companion, firstClock.tz);
  const skyNow = useSkyling(SKY_CHOICE, firstClock.tz);
  const [name, setName] = useState(saved.name);
  const [style, setStyle] = useState<AssistantStyle>(saved.style);
  const chosen = companion && companion !== SKY_CHOICE ? companionOf(companion) : null;
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
  /** "Changes with the sky": only the look follows the time; one name (their own, else "your skyling") and one style. */
  const pickSky = () => {
    if (COMPANIONS.some((x) => x.name === cleanName)) setName("");
    setCompanion(SKY_CHOICE);
    setStyle("friend");
    cheerSkylings();
  };

  // 2. about you
  const [yourName, setYourName] = useState(firstName === "there" ? "" : firstName);
  const cleanYou = yourName.trim().replace(/\s+/g, " ");
  const [birthDate, setBirthDate] = useState(saved.birthDate);
  const [stage, setStage] = useState<LifeStage | null>(saved.lifeStage);
  const [school, setSchool] = useState(saved.school);
  const [job, setJob] = useState(saved.job);
  const isSchool = stage === "student" || stage === "both";
  const isWork = stage === "working" || stage === "both";
  // a neutral age question: the form only flags a day that can't be right (impossible, in the future); the age rule is the
  // server's, so the form never hints at the cutoff (an under-13 date locks the welcome there)
  const typed = birthDate ? birthDateProblem(birthDate, firstClock.today) : null;
  const birthProblem = typed === AGE_LINE ? null : typed;

  // 3. connect
  const [clock, setClock] = useState(firstClock);
  const [linked, setLinked] = useState<Record<SourceKey, boolean>>({
    canvas: sources.canvas.connected,
    google: sources.google.connected || (back?.provider === "google" && back.result === "connected"),
    outlook: sources.outlook.connected || (back?.provider === "outlook" && back.result === "connected"),
  });
  const anyLinked = linked.canvas || linked.google || linked.outlook;

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

  /** Leaving "about you": everything so far is kept on the account, so connecting can leave the page and come back. */
  const saveAbout = () =>
    start(async () => {
      if (birthProblem) return setError(birthProblem);
      const r = await saveWelcomeAction({
        assistant: { name: cleanName || undefined, style, companion: companion ?? undefined },
        name: cleanYou !== firstName ? cleanYou : undefined,
        birthDate,
        lifeStage: stage ?? undefined,
        school: isSchool ? school.trim() : undefined,
        job: isWork ? job.trim() : "",
      });
      // under 13: the account's welcome is now locked, and the page says so (one calm line, nothing to retry)
      if (r?.error === AGE_LINE) return router.refresh();
      if (!r?.ok) return setError(r?.error ?? "Couldn't save. Try again.");
      go(1);
    });

  /** Leaving "meet the skylings": the pick is kept right away (a refresh used to lose it), without holding the next step up. */
  const savePick = () => {
    if (companion) void saveWelcomeAction({ assistant: { name: cleanName || undefined, style, companion } });
    go(1);
  };

  const next = () => (step === "about" ? saveAbout() : step === "skyling" ? savePick() : go(1));

  /** Canvas connects right here (its Calendar Feed link), then the sky comes back with what it brought in. */
  const connectCanvas = (feed: string, at: DOMRect | undefined) =>
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("feed", feed);
      const r = await connectCanvasFeedAction(null, fd);
      if (!r?.ok) return setError(r?.error ?? "Couldn't connect Canvas. Check the link and try again.");
      setLinked((l) => ({ ...l, canvas: true }));
      const sky = await skyNowAction();
      if (sky.ok) setClock(sky.clock);
      celebrate(at, "big", "Connected");
      cheerSkylings();
    });

  /** Finishes setup (their skyling, their week, where they work) and goes to their sky. */
  const finish = (to: string) =>
    start(async () => {
      if (!nameOk) return setError("Use letters, numbers, spaces or simple punctuation for the name (up to 24 characters).");
      const r = await completeOnboardingAction({
        lifeStage: stage ?? undefined,
        assistant: { name: cleanName || undefined, style, companion: companion ?? undefined },
        job: isWork && job.trim() ? { name: job.trim() } : undefined,
      });
      if (r?.ok) return router.replace(to);
      if (r?.error === BIRTHDAY_NEEDED) return toAbout();
      setError(r?.error ?? "Couldn't save. Try again.");
    });

  // skipping still needs a birthday on the account (the server decides): without one, "About you" first
  const toAbout = () => {
    dir.current = 1;
    setIndex(1);
    setError(BIRTHDAY_NEEDED);
    window.scrollTo({ top: 0 });
  };
  const skipAll = () =>
    start(async () => {
      const r = await skipOnboardingAction();
      if (r?.ok) return router.replace("/");
      if (r?.error === BIRTHDAY_NEEDED) return toAbout();
      if (r?.error === AGE_LINE) return router.refresh();
      setError(r?.error ?? "Couldn't continue. Try again.");
    });

  const night = step === "skyling" || step === "about";
  // the sources in the order that matters to them: students start with Canvas
  const order: SourceKey[] = isSchool || !stage ? ["canvas", "google", "outlook"] : ["google", "outlook", "canvas"];
  return (
    <div className="lf-glass min-h-dvh bg-bg">
      {/* the top: the skylings' night while you meet them; then the sun comes up on your own sky */}
      {night ? (
        <div className="relative isolate h-[clamp(12rem,30svh,19rem)] overflow-hidden bg-night-ground md:h-[clamp(15rem,34vh,22rem)]">
          <div className="absolute inset-x-0 top-0 bottom-8">
            <NightSky stage="strip" focus={drawn} />
          </div>
        </div>
      ) : (
        <div className="lf-welcome-sky relative mx-auto w-full max-w-3xl pb-8 md:pt-4">
          {/* connecting: opened into the week, so what comes in lands on its day; learning: folded back to turn and open */}
          <DayClock data={clock} mode="full" companion={companion} open={step === "connect" ? true : step === "learn" ? false : undefined} />
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
              <PixelIcon name="back" className="h-5 w-5" />
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-1.5" role="img" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
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
                  <button
                    type="button"
                    role="radio"
                    aria-checked={companion === SKY_CHOICE}
                    onClick={pickSky}
                    className={cn(
                      "col-span-3 flex min-h-16 items-center justify-center gap-3 rounded-[1.25rem] px-3 py-2 transition-all duration-300 active:scale-95",
                      companion === SKY_CHOICE
                        ? "-translate-y-0.5 bg-gradient-to-b from-dawn-1 to-dawn-2 text-ink-night shadow-lift ring-2 ring-dawn-3"
                        : "bg-surface shadow-soft hover:-translate-y-0.5",
                    )}
                  >
                    <CompanionGlyph companion={skyNow} night={skyNow === "star"} className="h-10 w-10" />
                    <span className="text-left">
                      <span className="block text-[0.9375rem] font-medium">{SKY_CHOICE_LABEL.name}</span>
                      <span className={cn("block text-xs", companion === SKY_CHOICE ? "text-ink-night/75" : "text-muted")}>{SKY_CHOICE_LABEL.moment}</span>
                    </span>
                  </button>
                </div>
                {companion === SKY_CHOICE && (
                  <p className="-mt-2 text-sm leading-relaxed text-text-2" aria-live="polite">
                    <span className="font-medium text-text">{SKY_CHOICE_LABEL.line}</span> Same name and the same way of talking all day.
                  </p>
                )}
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
                    <CompanionGlyph companion={drawn} className="h-7 w-7" />
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

          {step === "about" && (
            <>
              <div data-anim className="flex items-end gap-3">
                <CompanionGlyph companion={drawn} night={drawn === "star"} pose="celebrate" frame={3} className="lf-breathe h-14 w-14" />
                <h1 className="font-display text-[2.75rem] leading-[1.05] font-medium tracking-tight">Hi{cleanYou ? ` ${cleanYou.split(" ")[0]}` : ""}.</h1>
              </div>
              <p data-anim className="mt-3 text-[1.0625rem] leading-relaxed text-text-2">
                I&apos;m {shown ?? "your skyling"}. Tell me a little about you, and then we&apos;ll connect your sky.
              </p>
              <div className="mt-6 flex flex-col gap-5">
                <Group label="What should I call you?">
                  <Input
                    aria-label="What should I call you?"
                    value={yourName}
                    onChange={(e) => setYourName(e.target.value)}
                    maxLength={80}
                    autoComplete="given-name"
                    className="min-h-11"
                  />
                </Group>
                <Group label="Your birthday">
                  <Input
                    type="date"
                    aria-label="Your birthday"
                    value={birthDate}
                    max={firstClock.today}
                    onChange={(e) => setBirthDate(e.target.value)}
                    autoComplete="bday"
                    className="min-h-11"
                    aria-invalid={!!birthProblem || undefined}
                  />
                  <p className={cn("mt-1.5 text-xs", birthProblem ? "text-danger" : "text-muted")}>{birthProblem ?? "Private to your account."}</p>
                </Group>
                <div data-anim>
                  <p className="mb-2 text-sm font-medium text-text-2">What fills your week?</p>
                  <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="What fills your week">
                    {(
                      [
                        ["student", "Classes", "I'm a student", "class"],
                        ["working", "Work", "I have a job", "shift"],
                        ["both", "Both", "Classes and a job", "calendar"],
                        ["life", "Neither", "My day and my money", "today"],
                      ] as const
                    ).map(([value, label, hint, icon]) => (
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
                        <PixelIcon name={icon} className="h-6 w-6" />
                        <span className="text-[1rem] font-medium">{label}</span>
                        <span className={cn("text-xs", stage === value ? "text-ink-night/75" : "text-muted")}>{hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {isSchool && (
                  <Group label="Your school">
                    <Input
                      aria-label="Your school"
                      value={school}
                      onChange={(e) => setSchool(e.target.value)}
                      maxLength={120}
                      placeholder="State University"
                      autoComplete="organization"
                      className="min-h-11"
                    />
                  </Group>
                )}
                {isWork && (
                  <Group label="Where you work">
                    <Input
                      aria-label="Where you work"
                      value={job}
                      onChange={(e) => setJob(e.target.value)}
                      maxLength={120}
                      placeholder="Campus Coffee"
                      autoComplete="off"
                      className="min-h-11"
                    />
                  </Group>
                )}
                <p data-anim className="rounded-2xl bg-surface-2 px-4 py-3 text-[0.9375rem] leading-snug text-text-2">
                  {plan.paid
                    ? `Free plan: everything you add yourself, and ${plan.freeChatsPerDay} chats with your skyling a day. Pro adds ${listOf(plan.proFeatures)}.`
                    : "LifeFlow is free while we're testing. Everything is open to you."}
                </p>
              </div>
            </>
          )}

          {step === "connect" && (
            <>
              <Title sub="Your classes, shifts and due dates already live somewhere. Connect it once and they land on your sky by themselves, and stay up to date.">
                Connect your sky
              </Title>
              {back && (
                <p
                  data-anim
                  role="status"
                  className={cn(
                    "mt-4 rounded-2xl px-4 py-3 text-sm",
                    back.result === "connected" ? "bg-gradient-to-b from-dawn-1 to-dawn-2 text-ink-night" : "bg-surface-2 text-text-2",
                  )}
                >
                  {back.provider === "google" ? "Google Calendar" : "Outlook"} {BACK_TEXT[back.result]}
                </p>
              )}
              <ul data-anim className="mt-5 flex flex-col gap-2.5">
                {order.map((k) => (
                  <li key={k}>
                    {k === "canvas" ? (
                      <CanvasSource connected={linked.canvas} disabled={pending} onConnect={connectCanvas} />
                    ) : (
                      <LinkSource
                        source={k}
                        connected={linked[k]}
                        available={sources[k].available}
                        icon={k === "google" ? "calendar" : "chat"}
                        title={k === "google" ? "Google Calendar" : "Outlook and Teams"}
                        brings={k === "google" ? "Your classes, plans and shifts from your calendar" : "School or work calendar, and Teams meetings"}
                      />
                    )}
                  </li>
                ))}
              </ul>
              <p data-anim className="mt-3 text-[0.8125rem] text-muted">
                No calendar? Tell your skyling your week in one sentence later. Your bank can come later too, from Money.
              </p>
            </>
          )}

          {step === "learn" && <Learn />}
          {/* the welcome's last beat: a calm ask for notifications (owner's program, item 3); nothing if they can't come */}
          {step === "learn" && (
            <div className="mt-5">
              <NotifyAsk
                title={`Want ${shown ?? (chosen ? chosen.name : "your skyling")}'s check-ins as notifications?`}
                line="One line when something needs you, like a bill your checking can't cover or a promise to check on. Quiet at night."
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 pt-8">
          <p className="flex items-center gap-2 text-[0.8125rem] text-muted">
            <span className="h-1.5 w-1.5 shrink-0 bg-dawn-2" aria-hidden />
            {CHANGES[step]}
          </p>
          {error && <FormError message={error} />}
          {step === "learn" ? (
            <SkyButton onClick={() => finish("/")} loading={pending} disabled={!nameOk} skyling={drawn ?? "ray"} className="w-full justify-between pl-6">
              Go to my sky
            </SkyButton>
          ) : (
            <SkyButton
              onClick={next}
              disabled={pending || (step === "skyling" && !nameOk) || (step === "about" && (!cleanYou || !stage || !birthDate || !!birthProblem))}
              skyling={drawn ?? "dawn"}
              cheer={step === "skyling" && !!companion}
              variant={step === "connect" && !anyLinked ? "glass" : "sun"}
              day={step === "connect" && !anyLinked}
              className="w-full justify-between pl-6"
            >
              {step === "about" ? "Connect my sky" : step === "connect" ? (anyLinked ? "Show me how to read it" : "I'll connect later") : "Continue"}
            </SkyButton>
          )}
        </div>
      </div>
    </div>
  );
}

/** Google or Microsoft: one tap away and back (the start route remembers it came from here). */
function LinkSource({
  source,
  connected,
  available,
  icon,
  title,
  brings,
}: {
  source: "google" | "outlook";
  connected: boolean;
  available: boolean;
  icon: PixelName;
  title: string;
  brings: string;
}) {
  const href = source === "google" ? "/api/integrations/google/start?from=welcome" : "/api/integrations/microsoft/start?from=welcome";
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl px-4 py-3.5",
        connected ? "bg-gradient-to-b from-dawn-1 to-dawn-2 text-ink-night" : "bg-surface shadow-soft",
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl max-[359px]:hidden",
          connected ? "bg-ink-night text-star-gold" : "bg-surface-2",
        )}
      >
        <PixelIcon name={connected ? "todo" : icon} className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-medium">{title}</span>
        <span className={cn("block text-sm", connected ? "text-ink-night/75" : "text-muted")}>{connected ? "Connected. It's on your sky." : brings}</span>
        {/* under the words, not in a column beside them: on a small phone that squeezed them to two words a line */}
        {!connected && !available && <span className="mt-1 block text-xs text-muted">Isn&apos;t available yet</span>}
      </span>
      {!connected && available && (
        <a href={href} className="lf-sb lf-sb-sun lf-sb-sm shrink-0" aria-label={`Connect ${title}`}>
          Connect
        </a>
      )}
    </div>
  );
}

/** Canvas: the Calendar Feed link works for every student, pasted right here. */
function CanvasSource({
  connected,
  disabled,
  onConnect,
}: {
  connected: boolean;
  disabled: boolean;
  onConnect: (feed: string, at: DOMRect | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState("");
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <div className={cn("rounded-2xl px-4 py-3.5", connected ? "bg-gradient-to-b from-dawn-1 to-dawn-2 text-ink-night" : "bg-surface shadow-soft")}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl max-[359px]:hidden",
            connected ? "bg-ink-night text-star-gold" : "bg-surface-2",
          )}
        >
          <PixelIcon name={connected ? "todo" : "school"} className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-medium">Canvas</span>
          <span className={cn("block text-sm", connected ? "text-ink-night/75" : "text-muted")}>
            {connected ? "Connected. Your due dates are on your sky." : "Every assignment and due date, from all your classes"}
          </span>
        </span>
        {!connected && !open && (
          <button type="button" onClick={() => setOpen(true)} className="lf-sb lf-sb-sun lf-sb-sm shrink-0" aria-label="Connect Canvas">
            Connect
          </button>
        )}
      </div>
      {!connected && open && (
        <div className="mt-3.5 flex flex-col gap-3 border-t border-border pt-3.5">
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-text-2">
            <li>Open Canvas in a browser and go to Calendar.</li>
            <li>Tap Calendar Feed (bottom right) and copy the link.</li>
            <li>Paste it here. LifeFlow only reads due dates and class events.</li>
          </ol>
          <div className="flex items-center gap-2">
            <Input
              type="url"
              inputMode="url"
              value={feed}
              onChange={(e) => setFeed(e.target.value)}
              placeholder="https://…/feeds/calendars/user_….ics"
              aria-label="Calendar Feed link"
              autoCapitalize="none"
              autoCorrect="off"
              className="min-h-11 min-w-0 flex-1"
            />
            <SkyButton
              ref={btn}
              type="button"
              size="sm"
              chip={false}
              disabled={disabled || !feed.trim()}
              onClick={() => onConnect(feed.trim(), btn.current?.getBoundingClientRect())}
            >
              Connect
            </SkyButton>
          </div>
        </div>
      )}
    </div>
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
            {/* the app's own tick box (task-check.tsx): empty, then ticked when the wheel does it */}
            <PixelIcon name={done[k] ? "todo" : "box"} className="mt-0.5 h-6 w-6 shrink-0" />
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
