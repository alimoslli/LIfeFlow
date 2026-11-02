"use client";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { ArrowLeft, BookOpen, Briefcase, CalendarDays, Camera, GraduationCap, Layers, Link2, PencilLine, Sun, Wallet } from "lucide-react";
import { gsap, MOTION, prefersReducedMotion, useGSAP } from "@/components/motion/gsap";
import { isHydrated } from "@/components/motion/intro";
import { BrandMark } from "@/components/brand/brand-mark";
import { ThemePicker } from "@/components/theme-picker";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/field";
import { ASSISTANT_STYLES, type AssistantStyle } from "@/lib/assistant";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { LifeStage } from "@/lib/life";
import { completeOnboardingAction, skipOnboardingAction } from "./actions";

type StepId = "hello" | "what" | "add" | "week" | "yours";
const STEPS: StepId[] = ["hello", "what", "add", "week", "yours"];

const NAMES = ["Jarvis", "Nova", "Sage", "Atlas", "Max"];
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u;
/** How each personality answers "What's due this week?" (shown live as they pick). */
const SAMPLE: Record<AssistantStyle, string> = {
  friend: "You've got 2 things due this week. The BIO lab is the big one, so let's start it Tuesday. You've got this.",
  coach: "2 due this week. BIO lab first: block 90 minutes Tuesday and knock it out. Small wins add up.",
  direct: "2 due: BIO lab (Thu), PSY quiz (Fri). Start the lab Tuesday.",
};

/**
 * First run: a short introduction, not a setup form. Nothing to connect or type in
 * except a name for their assistant; connecting the bank, Canvas and calendar comes
 * after the tour, when Jarvis points to it.
 */
/** What's free. `paid` is false while LifeFlow is free for everyone (testing). */
export type PlanInfo = { paid: boolean; freeChatsPerDay: number; proFeatures: string[] };

export function Onboarding({ firstName, theme, plan }: { firstName: string; theme: Theme; plan: PlanInfo }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const dir = useRef(1);

  const [stage, setStage] = useState<LifeStage | null>(null);
  const [name, setName] = useState("Jarvis");
  const [style, setStyle] = useState<AssistantStyle>("friend");
  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  const cleanName = useMemo(() => name.trim().replace(/\s+/g, " "), [name]);
  const nameOk = cleanName.length > 0 && cleanName.length <= 24 && NAME_RE.test(cleanName);

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
  };

  const finish = () =>
    start(async () => {
      if (!nameOk) return setError("Use letters, numbers, spaces or simple punctuation for the name (up to 24 characters).");
      const r = await completeOnboardingAction({ lifeStage: stage ?? undefined, assistant: { name: cleanName, style } });
      if (r?.ok) router.replace("/");
      else setError(r?.error ?? "Couldn't save. Try again.");
    });

  const skipAll = () =>
    start(async () => {
      const r = await skipOnboardingAction();
      if (r?.ok) router.replace("/");
      else setError(r?.error ?? "Couldn't continue. Try again.");
    });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex h-10 items-center justify-between">
        {index > 0 ? (
          <button onClick={() => go(-1)} className="-ml-2 rounded-full p-2 text-muted hover:text-text" aria-label="Back">
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
        <button onClick={skipAll} disabled={pending} className="text-sm text-muted hover:text-text">
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
              Hi {firstName}.
            </h1>
            <p data-anim className="mt-4 text-[1.0625rem] leading-relaxed text-text-2">
              LifeFlow is your classes, work, money and plans in one place, with a personal assistant who helps with all of it.
            </p>
          </>
        )}

        {step === "what" && (
          <>
            <Title>Here&apos;s what LifeFlow does</Title>
            <ul className="mt-7 flex flex-col gap-5">
              {(
                [
                  [null, "Your own assistant", "Ask anything. It plans your days, watches your money and keeps you ahead in school."],
                  [CalendarDays, "Plan", "Classes, shifts and to-dos in one week, with your heaviest days spotted early."],
                  [Wallet, "Money", "What's in your account, where it goes, and every subscription you pay for."],
                  [GraduationCap, "School", "Every due date in one list, and study time that fits around work."],
                ] as const
              ).map(([Icon, title, text]) => (
                <li key={title} data-anim className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                    {Icon ? <Icon className="h-5 w-5" /> : <BrandMark className="h-7 w-7" alt="" />}
                  </span>
                  <span>
                    <span className="block text-[1rem] font-semibold">{title}</span>
                    <span className="mt-0.5 block text-[0.9375rem] leading-snug text-text-2">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {step === "add" && (
          <>
            <Title sub="Three ways, and you can mix them.">How your week gets in</Title>
            <ul className="mt-7 flex flex-col gap-5">
              {(
                [
                  [Link2, "Connect", "Canvas, Google Calendar and your bank keep themselves up to date."],
                  [Camera, "Send a picture", "A syllabus, your assignments, a work schedule or a bank statement. Your assistant reads it and adds it."],
                  [PencilLine, "Add it yourself", "Any class, shift, bill or goal, in a few taps."],
                ] as const
              ).map(([Icon, title, text]) => (
                <li key={title} data-anim className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-[1rem] font-semibold">{title}</span>
                    <span className="mt-0.5 block text-[0.9375rem] leading-snug text-text-2">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p data-anim className="mt-7 rounded-2xl bg-surface-2 px-4 py-3 text-[0.9375rem] leading-snug text-text-2">
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

        {step === "yours" && (
          <>
            <Title>Make it yours</Title>
            <div className="mt-6 flex flex-col gap-6">
              <Group label="Name your assistant">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={24}
                  aria-label="Assistant name"
                  autoCapitalize="words"
                  autoComplete="off"
                  className="text-[1rem]"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {NAMES.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setName(n)}
                      className={cn(
                        "min-h-9 rounded-full px-3.5 text-sm transition-all",
                        cleanName === n ? "bg-hero text-hero-text shadow-soft" : "bg-surface text-text-2 shadow-soft hover:text-text",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </Group>
              <Group label="Personality">
                <div className="flex flex-col gap-2" role="radiogroup" aria-label="Personality">
                  {(Object.keys(ASSISTANT_STYLES) as AssistantStyle[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={style === k}
                      onClick={() => setStyle(k)}
                      className={cn(
                        "flex min-h-12 items-center justify-between rounded-2xl px-4 py-3 text-left transition-all",
                        style === k ? "bg-hero text-hero-text shadow-lift" : "bg-surface shadow-soft",
                      )}
                    >
                      <span className="text-[0.9375rem] font-medium">{ASSISTANT_STYLES[k].label}</span>
                      <span className={cn("text-sm", style === k ? "opacity-80" : "text-muted")}>{ASSISTANT_STYLES[k].hint}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex gap-2.5 rounded-2xl bg-surface-2 p-3.5" aria-live="polite">
                  <BrandMark className="h-6 w-6" alt="" />
                  <p className="text-[0.875rem] leading-relaxed text-text-2">
                    <span className="font-semibold text-text">{nameOk ? cleanName : "Your assistant"}:</span> {SAMPLE[style]}
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
          <Button onClick={finish} loading={pending} disabled={!nameOk} className="h-12 text-[0.9375rem]">
            Meet {nameOk ? cleanName : "your assistant"}
          </Button>
        ) : (
          <Button onClick={() => go(1)} disabled={step === "week" && !stage} className="h-12 text-[0.9375rem]">
            {step === "hello" ? "Show me" : "Continue"}
          </Button>
        )}
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
