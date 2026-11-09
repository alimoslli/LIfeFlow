"use client";
import { useRouter } from "next/navigation";
import { SkyScene } from "@/components/sky/sky-scene";
import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { ArrowLeft, BookOpen, Briefcase, Layers, Sun } from "lucide-react";
import { gsap, MOTION, prefersReducedMotion, useGSAP } from "@/components/motion/gsap";
import { isHydrated } from "@/components/motion/intro";
import { BrandMark } from "@/components/brand/brand-mark";
import { ThemePicker } from "@/components/theme-picker";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/field";
import { CompanionGlyph } from "@/components/sky/companion-glyph";
import { ASSISTANT_STYLES, type AssistantStyle } from "@/lib/assistant";
import { COMPANIONS, companionOf, type CompanionKey } from "@/lib/companions";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { LifeStage } from "@/lib/life";
import { completeOnboardingAction, setNameAction, skipOnboardingAction } from "./actions";
import { DayPreview } from "./day-preview";

type StepId = "hello" | "week" | "details" | "yours" | "day";
/** "details" (one class, where they work) is skipped when neither applies. "day" is Your day, connected. */
const stepsFor = (stage: LifeStage | null): StepId[] => (stage === "life" ? ["hello", "week", "yours", "day"] : ["hello", "week", "details", "yours", "day"]);

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u;
/** What it sounds like before a companion is picked (each companion has its own line, lib/companions). */
const SAMPLE = "You've got 2 things due this week. The BIO lab is the big one, so let's start it Tuesday. You've got this.";

/**
 * First run: hello, what fills their week, one class or job (optional, saved for real),
 * their assistant, then "Your day, connected": a day with everything connected, so they
 * see what LifeFlow does before connecting anything. Ends at Connections or Today.
 */
/** What's free. `paid` is false while LifeFlow is free for everyone (testing). */
export type PlanInfo = { paid: boolean; freeChatsPerDay: number; proFeatures: string[] };

export function Onboarding({ firstName, theme, plan, tz }: { firstName: string; theme: Theme; plan: PlanInfo; tz: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const dir = useRef(1);

  const [stage, setStage] = useState<LifeStage | null>(null);
  const [course, setCourse] = useState("");
  const [job, setJob] = useState("");
  const [name, setName] = useState("");
  // What to call the person: asked here (sign-up only takes email and password), saved when they leave this step.
  const [yourName, setYourName] = useState(firstName === "there" ? "" : firstName);
  const cleanYou = yourName.trim().replace(/\s+/g, " ");
  const [style, setStyle] = useState<AssistantStyle>("friend");
  // The cast: nothing is picked until they tap one, so it stays "your assistant" unless they choose.
  const [companion, setCompanion] = useState<CompanionKey | null>(null);
  const chosen = companion ? companionOf(companion) : null;
  const STEPS = stepsFor(stage);
  const step = STEPS[Math.min(index, STEPS.length - 1)];
  const last = step === "day";
  const school = stage === "student" || stage === "both";
  const work = stage === "working" || stage === "both";
  const cleanName = useMemo(() => name.trim().replace(/\s+/g, " "), [name]);
  // Naming is optional; an empty name keeps "your assistant".
  const nameOk = cleanName.length === 0 || (cleanName.length <= 24 && NAME_RE.test(cleanName));
  const shown = cleanName && nameOk ? cleanName : null;

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

  const next = () => {
    if (step === "hello" && cleanYou && cleanYou !== firstName) {
      start(async () => {
        const r = await setNameAction(cleanYou);
        if (!r?.ok) return setError(r?.error ?? "Couldn't save your name. Try again.");
        go(1);
      });
      return;
    }
    go(1);
  };

  /** Picking a companion brings its name (unless they typed their own) and its tone. */
  const pick = (k: CompanionKey) => {
    const c = companionOf(k);
    if (!cleanName || COMPANIONS.some((x) => x.name === cleanName)) setName(c.name);
    setCompanion(k);
    setStyle(c.tone);
  };

  const go = (delta: number) => {
    dir.current = delta;
    setError(null);
    setIndex((i) => Math.max(0, Math.min(STEPS.length - 1, i + delta)));
    window.scrollTo({ top: 0 });
  };

  /** Saves everything (their class and job become real records) and goes to Connections or Today. */
  const finish = (to: "/" | "/settings/integrations") =>
    start(async () => {
      if (!nameOk) return setError("Use letters, numbers, spaces or simple punctuation for the name (up to 24 characters).");
      const r = await completeOnboardingAction({
        lifeStage: stage ?? undefined,
        assistant: { name: cleanName || undefined, style, companion: companion ?? undefined },
        courses: school && course.trim() ? [course.trim()] : [],
        job: work && job.trim() ? { name: job.trim() } : undefined,
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

  return (
    // the same sky for this hour and the same glass as the app, from the first screen (A-to-Z audit A3)
    <div className="lf-glass">
      <SkyScene tz={tz} />
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
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
                  i === index ? "w-6 bg-accent" : i < index ? "w-1.5 bg-accent/60" : "w-1.5 bg-surface-3",
                )}
              />
            ))}
          </div>
          <button onClick={skipAll} disabled={pending} className="-mr-2 flex min-h-11 items-center rounded-full px-2 text-sm text-muted hover:text-text">
            Skip setup
          </button>
        </header>

        <div ref={panel} className="flex flex-1 flex-col pt-10">
          {step === "hello" && (
            <>
              <div data-anim className="relative h-16 w-16">
                <span className="lf-orb-glow absolute -inset-1/3 rounded-full" aria-hidden />
                <BrandMark className="lf-float relative h-full w-full" priority />
              </div>
              <h1 data-anim className="mt-8 font-display text-[2.75rem] leading-[1.05] font-medium tracking-tight">
                Hi{cleanYou ? ` ${cleanYou.split(" ")[0]}` : ""}.
              </h1>
              <p data-anim className="mt-4 text-[1.0625rem] leading-relaxed text-text-2">
                LifeFlow is your classes, work, money and plans in one place, with a personal assistant who helps with all of it.
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
              <p data-anim className="mt-6 rounded-2xl bg-surface-2 px-4 py-3 text-[0.9375rem] leading-snug text-text-2">
                {plan.paid
                  ? `Free plan: everything you add yourself, and ${plan.freeChatsPerDay} chats with your assistant a day. Pro adds ${listOf(plan.proFeatures)}.`
                  : "LifeFlow is free while we're testing. Everything is open to you."}
              </p>
            </>
          )}

          {step === "week" && (
            <>
              <Title sub="So LifeFlow shows what matters to you. You can change it anytime.">What fills your week?</Title>
              <div data-anim className="mt-6 flex flex-col gap-2.5" role="radiogroup" aria-label="What fills your week">
                {(
                  [
                    ["student", "Classes", "I'm a student", BookOpen],
                    ["working", "Work", "I have a job", Briefcase],
                    ["both", "Both", "Classes and a job", Layers],
                    ["life", "Neither", "Just my day and my money", Sun],
                  ] as const
                ).map(([value, label, hint, Icon]) => (
                  <button
                    key={value}
                    role="radio"
                    aria-checked={stage === value}
                    onClick={() => setStage(value)}
                    className={cn(
                      "flex items-center gap-4 rounded-2xl px-4 py-4 text-left transition-all active:scale-[0.99]",
                      stage === value ? "bg-hero text-hero-text shadow-lift" : "bg-surface shadow-soft hover:shadow-lift",
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
                    <span>
                      <span className="block text-[1rem] font-medium">{label}</span>
                      <span className={cn("block text-sm", stage === value ? "opacity-80" : "text-muted")}>{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === "details" && (
            <>
              <Title sub="Optional. I'll use it to show you a day like yours, and it's saved for you.">
                {school && work ? "A class and your job" : school ? "One class you're taking" : "Where do you work?"}
              </Title>
              <div className="mt-6 flex flex-col gap-4">
                {school && (
                  <Group label="A class you're taking">
                    <Input
                      value={course}
                      onChange={(e) => setCourse(e.target.value)}
                      maxLength={60}
                      placeholder="BIO 110"
                      aria-label="A class you're taking"
                      autoComplete="off"
                      className="min-h-11"
                    />
                  </Group>
                )}
                {work && (
                  <Group label="Where you work">
                    <Input
                      value={job}
                      onChange={(e) => setJob(e.target.value)}
                      maxLength={60}
                      placeholder="Campus Coffee"
                      aria-label="Where you work"
                      autoComplete="off"
                      className="min-h-11"
                    />
                  </Group>
                )}
              </div>
            </>
          )}

          {step === "day" && stage && (
            <DayPreview
              firstName={cleanYou.split(" ")[0] || firstName}
              assistant={shown ?? "Your assistant"}
              stage={stage}
              course={school ? course : undefined}
              job={work ? job : undefined}
            />
          )}

          {step === "yours" && (
            <>
              <Title>Make it yours</Title>
              <p data-anim className="mt-2 text-[0.9375rem] leading-relaxed text-text-2">
                Pick who runs on top of your day. It&apos;s your assistant.
              </p>
              <div className="mt-6 flex flex-col gap-6">
                <div data-anim role="radiogroup" aria-label="Your companion" className="grid grid-cols-3 gap-2">
                  {COMPANIONS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      role="radio"
                      aria-checked={companion === c.key}
                      onClick={() => pick(c.key)}
                      className={cn(
                        "flex min-h-24 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-2 transition-all",
                        companion === c.key ? "bg-hero text-hero-text shadow-lift" : "bg-surface shadow-soft",
                      )}
                    >
                      <CompanionGlyph
                        companion={c.key}
                        pose={companion === c.key ? "celebrate" : "idle"}
                        frame={companion === c.key ? 1 : 0}
                        className="h-12 w-12"
                      />
                      <span className="text-[0.9375rem] font-medium">{c.name}</span>
                      <span className={cn("text-xs", companion === c.key ? "opacity-80" : "text-muted")}>{c.moment}</span>
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
                    placeholder="your assistant"
                    aria-label="Assistant name"
                    autoCapitalize="words"
                    autoComplete="off"
                    className="min-h-11 text-[1rem]"
                  />
                  <p className="mt-1.5 text-xs text-muted">{chosen ? "Keep the name or type your own." : "Optional. Pick one above, or type a name."}</p>
                  <div className="mt-3 flex gap-2.5 rounded-2xl bg-surface-2 p-3.5" aria-live="polite">
                    <CompanionGlyph companion={companion} className="h-7 w-7" />
                    <p className="text-[0.875rem] leading-relaxed text-text-2">
                      <span className="font-semibold text-text">{shown ?? "Your assistant"}:</span> {chosen ? chosen.sample : SAMPLE}
                    </p>
                  </div>
                </Group>
                <Group label="Appearance">
                  <ThemePicker initial={theme} />
                </Group>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 pt-8">
          {error && <FormError message={error} />}
          {last ? (
            <>
              <Button onClick={() => finish("/settings/integrations")} loading={pending} disabled={!nameOk} className="h-12 text-[0.9375rem]">
                Connect my accounts
              </Button>
              <Button variant="ghost" onClick={() => finish("/")} disabled={pending || !nameOk} className="h-12 text-[0.9375rem]">
                Meet {shown ?? "your assistant"} first
              </Button>
            </>
          ) : (
            <Button
              onClick={next}
              disabled={pending || (step === "hello" && !cleanYou) || (step === "week" && !stage) || (step === "yours" && !nameOk)}
              className="h-12 text-[0.9375rem]"
            >
              {step === "hello" ? "Let's go" : step === "yours" ? "Show me my day" : "Continue"}
            </Button>
          )}
        </div>
      </div>
    </div>
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
