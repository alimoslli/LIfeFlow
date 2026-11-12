"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { gsap, MOTION, prefersReducedMotion, useGSAP } from "@/components/motion/gsap";
import { isHydrated } from "@/components/motion/intro";
import { celebrate } from "@/components/motion/burst";
import { DayClock } from "@/components/day-clock/day-clock";
import { AllFive } from "@/components/skylings/all-five";
import { NightSky } from "@/components/skylings/night-sky";
import { cheerSkylings } from "@/components/skylings/night";
import { SkyButton } from "@/components/skylings/sky-button";
import { FormError, Input } from "@/components/ui/field";
import { CompanionGlyph } from "@/components/sky/companion-glyph";
import { ASSISTANT_STYLES, nameAtStart, type AssistantStyle } from "@/lib/assistant";
import { AGE_LINE, BIRTHDAY_NEEDED, birthDateProblem } from "@/lib/birthday";
import { COMPANIONS, companionOf, SKY_CHOICE, SKY_CHOICE_LABEL, type CompanionChoice, type CompanionKey, ownsNight } from "@/lib/companions";
import { useSkyling } from "@/components/skylings/use-skyling";
import type { ClockData } from "@/lib/day-clock";
import type { LifeStage } from "@/lib/life";
import { cn } from "@/lib/utils";
import { connectCanvasFeedAction } from "@/app/(app)/settings/integrations/actions";
import { setAiConsentAction } from "@/app/(app)/settings/actions";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import type { PixelName } from "@/components/pixel/art";
import { NotifyAsk } from "@/components/jarvis/notify-ask";
import { completeOnboardingAction, saveWelcomeAction, skipOnboardingAction, skyNowAction } from "./actions";
import { BirthdayField } from "@/components/ui/birthday-field";
import { WeekStep } from "./week-step";
import { useLink } from "@/components/finance/plaid-link";

/**
 * First run (owner, 2026-11-09: "catered to the new app"; "they won't have to add their classes, syncing their school
 * calendar does that, we want to show them how easy it is to sync and connect, and get some info on them like their
 * birth date"):
 *   1. skyling: meet the five on the night sky, pick one and name it (research 2026-11-09: the character comes first);
 *   2. about: it says hi and gets to know them: what to call them, their birthday, what fills their week, their school
 *      or work;
 *   3. connect: their real sky, opened into the week, and one tap each for Canvas, Google Calendar and Outlook; what a
 *      connection brings in lands on the sky (Google and Microsoft come back here, to this step);
 *   4. week: "Here's your week so far" (owner, 2026-11-12): what landed, on the same wheel, and one first fix to say yes to
 *      (or, with nothing connected, one real thing to add);
 *   5. learn: they turn the wheel, open it into the week and fold it back themselves, each one ticked off.
 * No made-up demo day: everything on screen is theirs. The bank waits for Money (research: never in the first minute).
 */
type StepId = "skyling" | "about" | "connect" | "week" | "learn";
const STEPS: StepId[] = ["skyling", "about", "connect", "week", "learn"];

/** What each step changes (research 2026-11-09, proposal 3: a step that changes nothing is cut). */
const CHANGES: Record<StepId, string> = {
  skyling: "Changes who sits on top of your sky, and how it talks to you.",
  about: "Helps your skyling plan around you. Private to your account.",
  connect: "What you connect lands on your sky and stays up to date. Your skyling asks before it deletes or sends anything.",
  week: "Shows what landed. Your skyling changes nothing unless you say yes, and Undo is right there.",
  learn: "Nothing to save here. Just try it.",
};

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u;
/** What it sounds like before a skyling is picked (each one has its own line, lib/companions). */
const SAMPLE = "You've got 2 things due this week. The BIO lab is the big one, so let's start it Tuesday. You've got this.";

/** What's free. `paid` is false while LifeFlow is free for everyone (testing). */
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
/** What can be connected right in the welcome; "shifts" is a photo of the work schedule read by the skyling. */
type SourceKey = "canvas" | "google" | "outlook" | "bank" | "shifts";
type Linkable = Exclude<SourceKey, "shifts">;
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
  aiOk,
  clock: firstClock,
  saved,
  back,
  sources,
}: {
  firstName: string;
  /** They already allowed the skyling to use AI (the chat's "Before we start"). */
  aiOk: boolean;
  clock: ClockData;
  saved: Saved;
  back: Back | null;
  sources: Record<Linkable, Source>;
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
  const isSchool = stage === "student" || stage === "both";
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
    bank: sources.bank.connected,
    shifts: false,
  });
  // a bank connects in Plaid's window and the page refreshes: the server's answer counts too
  const bankOn = linked.bank || sources.bank.connected;
  // a week told in one message (or a schedule photo) counts like a connection: something real is on the sky
  const [told, setTold] = useState(false);
  const anyLinked = linked.canvas || linked.google || linked.outlook || bankOn || linked.shifts || told;
  // the AI permission, asked once in the welcome for whatever the skyling reads (a typed week, a schedule photo)
  const [aiOn, setAiOn] = useState(aiOk);

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
      // a star: the sun plays only when a sun is earned on the skyling's cloud (owner, 2026-11-11)
      celebrate(at, "small", "Connected");
      cheerSkylings();
    });

  /** A week told in one message was saved: the sky comes back with it. */
  const weekTold = async () => {
    setTold(true);
    const sky = await skyNowAction();
    if (sky.ok) setClock(sky.clock);
  };

  /** Finishes setup (their skyling and their week) and goes to their sky. Where they study or work comes from connecting. */
  const finish = (to: string) =>
    start(async () => {
      if (!nameOk) return setError("Use letters, numbers, spaces or simple punctuation for the name (up to 24 characters).");
      const r = await completeOnboardingAction({
        lifeStage: stage ?? undefined,
        assistant: { name: cleanName || undefined, style, companion: companion ?? undefined },
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
  // every connection, in the order that matters to them (owner, 2026-11-11: "encourage connecting everything as soon as
  // possible"): students start with Canvas, anyone with a job gets their shifts from a photo, and the bank is for everyone
  const works = stage === "working" || stage === "both";
  const order: SourceKey[] = [
    ...(isSchool || !stage ? (["canvas"] as const) : []),
    "google",
    "outlook",
    ...(works ? (["shifts"] as const) : []),
    "bank",
    ...(isSchool || !stage ? [] : (["canvas"] as const)),
  ];
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
          <DayClock data={clock} mode="full" companion={companion} open={step === "connect" || step === "week" ? true : step === "learn" ? false : undefined} />
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
                        night={ownsNight(c.key)}
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
                      "flex min-h-24 flex-col items-center justify-center gap-0.5 rounded-[1.25rem] px-1 py-2 transition-all duration-300 active:scale-95",
                      companion === SKY_CHOICE
                        ? "-translate-y-0.5 bg-gradient-to-b from-dawn-1 to-dawn-2 text-ink-night shadow-lift ring-2 ring-dawn-3"
                        : "bg-surface shadow-soft hover:-translate-y-0.5",
                    )}
                  >
                    {/* the sixth place in the grid: all five along the sky's arc (owner, 2026-11-11) */}
                    <AllFive />
                    <span className="text-center text-[0.9375rem] leading-tight font-medium">{SKY_CHOICE_LABEL.name}</span>
                    <span className={cn("text-xs", companion === SKY_CHOICE ? "text-ink-night/75" : "text-muted")}>{SKY_CHOICE_LABEL.moment}</span>
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
                <CompanionGlyph companion={drawn} night={ownsNight(drawn)} pose="celebrate" frame={3} className="lf-breathe h-14 w-14" />
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
                  <BirthdayField value={birthDate} onChange={setBirthDate} invalid={!!birthProblem} />
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
                        ["life", "Neither", "My life, money and goals", "today"],
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
                {/* no school or workplace to type (owner, 2026-11-11): connecting their sky fills those in. And no plan or
                    price line here: people come in from the waitlist (owner, 2026-11-11) */}
              </div>
            </>
          )}

          {step === "connect" && (
            <>
              <Title sub="Connect everything you can now. Each one fills your sky by itself and keeps it up to date, so you never type your week in.">
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
                    ) : k === "bank" ? (
                      <BankSource connected={bankOn} available={sources.bank.available} />
                    ) : k === "shifts" ? (
                      <ShiftsSource
                        who={shown ?? (chosen ? chosen.name : "your skyling")}
                        allowed={aiOn}
                        onAllowed={() => setAiOn(true)}
                        done={linked.shifts}
                        onDone={async () => {
                          setLinked((l) => ({ ...l, shifts: true }));
                          await weekTold();
                        }}
                      />
                    ) : (
                      <LinkSource
                        source={k}
                        connected={linked[k]}
                        available={sources[k].available}
                        icon={k === "google" ? "calendar" : "chat"}
                        title={k === "google" ? "Google" : "Outlook and Teams"}
                        brings={k === "google" ? "Calendar and Gmail: your plans, bills and receipts" : "School or work calendar, and Teams meetings"}
                      />
                    )}
                  </li>
                ))}
              </ul>
              <TellWeek who={shown ?? (chosen ? chosen.name : "your skyling")} allowed={aiOn} onAllowed={() => setAiOn(true)} onSaved={weekTold} />
            </>
          )}

          {step === "week" && <WeekStep clock={clock} who={shown ?? (chosen ? chosen.name : "your skyling")} skyling={drawn ?? "ray"} onClock={setClock} />}
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
              {step === "about"
                ? "Connect my sky"
                : step === "connect"
                  ? anyLinked
                    ? "See my week so far"
                    : "I'll connect later"
                  : step === "week"
                    ? "Show me how to read it"
                    : "Continue"}
            </SkyButton>
          )}
        </div>
      </div>
    </div>
  );
}

/** Google or Microsoft: one tap away and back (the start route remembers it came from here). */
/** One connection as a card: what it is, what it brings, and its button; warm once it's connected. Same look for all. */
function SourceCard({
  icon,
  title,
  brings,
  connected,
  done = "Connected. It's on your sky.",
  note,
  children,
}: {
  icon: PixelName;
  title: string;
  brings: string;
  connected: boolean;
  done?: string;
  note?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl px-4 py-3.5",
        connected ? "bg-gradient-to-b from-dawn-1 to-dawn-2 text-ink-night" : "bg-surface shadow-soft",
      )}
    >
      <div className="flex items-center gap-3">
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
          <span className={cn("block text-sm", connected ? "text-ink-night/75" : "text-muted")}>{connected ? done : brings}</span>
        </span>
        {!connected && children}
      </div>
      {!connected && note}
    </div>
  );
}

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
    <SourceCard
      icon={icon}
      title={title}
      brings={brings}
      connected={connected}
      // under the words, not in a column beside them: on a small phone that squeezed them to two words a line
      note={!available && <span className="block pl-[3.25rem] text-xs text-muted max-[359px]:pl-0">Isn&apos;t available yet</span>}
    >
      {available && (
        <a href={href} className="lf-sb lf-sb-sun lf-sb-sm shrink-0" aria-label={`Connect ${title}`}>
          Connect
        </a>
      )}
    </SourceCard>
  );
}

/** The bank, in Plaid's own window (read-only, never moves money), the same way Money connects one. */
function BankSource({ connected, available }: { connected: boolean; available: boolean }) {
  const { busy, status, start } = useLink();
  return (
    <SourceCard
      icon="card"
      title="Your bank"
      brings="What's available now, bills and spending"
      connected={connected}
      note={
        available ? (
          <span className="block text-xs text-muted">
            {status ? (
              <span role="status" className={status.ok ? "text-text-2" : "text-danger"}>
                {status.text}
              </span>
            ) : (
              "You sign in to your bank inside Plaid. LifeFlow never sees your password and can't move money."
            )}
          </span>
        ) : (
          <span className="block pl-[3.25rem] text-xs text-muted max-[359px]:pl-0">Isn&apos;t available yet</span>
        )
      }
    >
      {available && (
        <button type="button" onClick={start} disabled={busy} className="lf-sb lf-sb-sun lf-sb-sm shrink-0" aria-label="Connect your bank">
          {busy ? "Opening…" : "Connect"}
        </button>
      )}
    </SourceCard>
  );
}

/**
 * Work shifts: no work app connects yet, so a photo of the schedule is the connection. It goes to the skyling like a chat
 * message with the photo (the same limits and permission), and the shifts it saves land on the sky.
 */
function ShiftsSource({
  who,
  allowed,
  onAllowed,
  done,
  onDone,
}: {
  who: string;
  allowed: boolean;
  onAllowed: () => void;
  done: boolean;
  onDone: () => Promise<void>;
}) {
  const photo = useSendPhoto({
    who,
    allowed,
    onAllowed,
    ask: "Add my work shifts from this schedule.",
    notFound: `${nameAtStart(who)} couldn't find shifts in that photo. Try a clearer one.`,
    onSaved: onDone,
  });
  return (
    <SourceCard
      icon="shift"
      title="Work shifts"
      brings="A photo of your schedule is enough"
      connected={done}
      done="Added. They're on your sky."
      note={
        <>
          {!allowed && <span className="block text-xs text-muted">To read it, {who} sends it to OpenAI. They don&apos;t use it to train their models.</span>}
          {photo.problem && (
            <span role="alert" className="block text-sm [overflow-wrap:anywhere] text-danger">
              {photo.problem}
            </span>
          )}
        </>
      }
    >
      {photo.field}
      <button
        type="button"
        onClick={photo.open}
        disabled={photo.busy}
        className="lf-sb lf-sb-sun lf-sb-sm shrink-0"
        aria-label="Add a photo of your work schedule"
      >
        {photo.busy ? "Reading…" : "Add photo"}
      </button>
    </SourceCard>
  );
}

/**
 * A photo (or PDF) sent to the skyling to read and add to the sky: uploaded like a chat attachment, then asked in the same
 * chat, with the same limits and AI permission. Only what's in the photo is saved; nothing is made up.
 */
function useSendPhoto({
  who,
  allowed,
  onAllowed,
  ask,
  notFound,
  onSaved,
}: {
  who: string;
  allowed: boolean;
  onAllowed: () => void;
  ask: string;
  notFound: string;
  onSaved: () => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const fallback = `${nameAtStart(who)} couldn't read that just now. Try again.`;
  const read = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setProblem(null);
    setSaid(null);
    try {
      if (!allowed) {
        const r = await setAiConsentAction(true);
        if (!r?.ok) throw new Error(r?.error || fallback);
        onAllowed();
      }
      const fd = new FormData();
      fd.append("file", file);
      const up = await fetch("/api/attachments", { method: "POST", body: fd });
      // only words the server wrote for people (size, kind of file); anything else is the calm fallback
      if (!up.ok) throw new Error(((await up.json().catch(() => null)) as { error?: string } | null)?.error || fallback);
      const { id } = (await up.json()) as { id: string };
      const { reply, saved } = await askSkyling(ask, [id], fallback);
      if (!saved) throw new Error(notFound);
      setSaid(reply || "Added. It's on your sky.");
      await onSaved();
    } catch (e) {
      setProblem(e instanceof Error && e.message ? e.message : fallback);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const field = (
    <input ref={input} type="file" accept="image/*,application/pdf" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => read(e.target.files?.[0])} />
  );
  return { field, busy, problem, said, open: () => input.current?.click() };
}

/**
 * Sends one message (and any uploaded files) to the skyling through the same chat as everywhere, and reads its answer:
 * the final words, and whether a tool saved something. Throws with the server's own words, or the fallback.
 */
async function askSkyling(message: string, attachmentIds: string[], fallback: string): Promise<{ reply: string; saved: boolean }> {
  const res = await fetch("/api/jarvis/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, attachmentIds, clientMessageId: crypto.randomUUID(), module: "calendar" }),
  });
  if (!res.ok || !res.body) {
    // only words the server wrote for people (limits, permission); anything else is the calm fallback
    const words = [402, 403, 429, 503].includes(res.status) ? ((await res.json().catch(() => null)) as { error?: string } | null)?.error : null;
    throw new Error(words || fallback);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let reply = "";
  let saved = false;
  let failed = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const ev = JSON.parse(line) as { type: string; delta?: string; ok?: boolean; message?: string };
      if (ev.type === "tool_start") reply = ""; // only the final answer, not "let me check…"
      if (ev.type === "text") reply += ev.delta ?? "";
      if (ev.type === "tool_end" && ev.ok) saved = true;
      if (ev.type === "error") failed = ev.message ?? "";
    }
  }
  if (failed && !saved) throw new Error(failed);
  return { reply: reply.trim(), saved };
}

/**
 * The last suggestion on "Connect your sky" (owner, 2026-11-11: "something including taking a photo and sending it"): a
 * photo of a schedule, a syllabus or a bill, read by the skyling and added to the sky, with typing it one tap away (the
 * week in one message, owner's program item 7). Both go through the same chat as everywhere else (its limits, its AI
 * permission, set_up_schedule), and the sky above comes back with what was saved. Nothing is made up.
 */
function TellWeek({ who, allowed, onAllowed, onSaved }: { who: string; allowed: boolean; onAllowed: () => void; onSaved: () => Promise<void> }) {
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const photo = useSendPhoto({
    who,
    allowed,
    onAllowed,
    ask: "Add what's in this photo to my sky.",
    notFound: `${nameAtStart(who)} couldn't find anything to add in that photo. Try a clearer one.`,
    onSaved,
  });
  const fallback = `${nameAtStart(who)} couldn't save that just now. Try again.`;
  const send = async () => {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      if (!allowed) {
        const r = await setAiConsentAction(true);
        if (!r?.ok) throw new Error(r?.error || fallback);
        onAllowed();
      }
      const { reply, saved } = await askSkyling(message, [], fallback);
      setSaid(reply || "Saved. It's on your sky.");
      setText("");
      if (saved) await onSaved();
    } catch (e) {
      setProblem(e instanceof Error && e.message ? e.message : fallback);
    } finally {
      setBusy(false);
    }
  };
  const shown = said ?? photo.said;
  const wrong = problem ?? photo.problem;
  return (
    <div data-anim className="mt-5 flex flex-col gap-2 rounded-2xl bg-surface px-4 py-3.5 shadow-soft">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 max-[359px]:hidden">
          <PixelIcon name="upload" className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-medium">Or send {who} a photo</span>
          <span className="block text-sm text-muted">A schedule, a syllabus or a bill</span>
        </span>
        {photo.field}
        <button type="button" onClick={photo.open} disabled={photo.busy} className="lf-sb lf-sb-sun lf-sb-sm shrink-0" aria-label={`Send ${who} a photo`}>
          {photo.busy ? "Reading…" : "Photo"}
        </button>
      </div>
      {!allowed && (
        <p className="text-xs text-muted">
          To read it, {who} sends it to OpenAI, our AI provider. They don&apos;t use it to train their models. You can turn this off anytime in Settings.
        </p>
      )}
      {typing ? (
        <>
          <label htmlFor="tell-week" className="sr-only">
            Type it to {who}
          </label>
          <textarea
            id="tell-week"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={2000}
            autoFocus
            placeholder="Bio 101 Mon and Wed at 10, work at Target Tue and Thu 5 to 9"
            className="w-full resize-none rounded-xl bg-surface-2 px-3 py-2.5 text-[1rem] outline-none placeholder:text-muted focus:ring-2 focus:ring-accent"
          />
          <button type="button" onClick={send} disabled={!text.trim() || busy} className="lf-sb lf-sb-sun lf-sb-sm self-start">
            {busy ? "Saving…" : allowed ? "Send" : "Allow and send"}
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setTyping(true)} className="min-h-11 self-start text-sm font-medium text-accent hover:underline">
          Or type it
        </button>
      )}
      {shown && (
        // the reply wraps anywhere: a long word or link must never widen the phone's page
        <p role="status" className="line-clamp-6 text-sm [overflow-wrap:anywhere] text-text-2">
          {shown}
        </p>
      )}
      {wrong && (
        <p role="alert" className="text-sm [overflow-wrap:anywhere] text-danger">
          {wrong}
        </p>
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
