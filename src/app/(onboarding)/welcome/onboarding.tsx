"use client";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { ArrowLeft, BookOpen, Briefcase, Layers, Plus, Sun, X } from "lucide-react";
import { gsap, MOTION, prefersReducedMotion, useGSAP } from "@/components/motion/gsap";
import { isHydrated } from "@/components/motion/intro";
import { BrandMark } from "@/components/brand/brand-mark";
import { ThemePicker } from "@/components/theme-picker";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Textarea } from "@/components/ui/field";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { lifeAreas, starterIdeas, type LifeStage } from "@/lib/life";
import { WorkHours } from "@/components/work-hours";
import type { WorkSchedule } from "@/server/db/schema";
import { completeOnboardingAction, skipOnboardingAction } from "./actions";

type Stage = LifeStage;
type StepId = "hello" | "week" | "classes" | "job" | "money" | "yours";

const STUDY = [
  ["morning", "Mornings"],
  ["afternoon", "Afternoons"],
  ["evening", "Evenings"],
  ["night", "Late nights"],
] as const;
const TONE = [
  ["concise", "Short & sweet"],
  ["balanced", "Balanced"],
  ["detailed", "Detailed"],
] as const;

/** First-run setup: a few quick, skippable steps so day one isn't empty. Saved once, at the end. */
export function Onboarding({ firstName, theme }: { firstName: string; theme: Theme }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const dir = useRef(1);

  const [stage, setStage] = useState<Stage | null>(null);
  const [courses, setCourses] = useState<string[]>([]);
  const [courseDraft, setCourseDraft] = useState("");
  const [job, setJob] = useState({ name: "", rate: "" });
  const [balance, setBalance] = useState("");
  const [studyTime, setStudyTime] = useState<(typeof STUDY)[number][0] | null>(null);
  const [tone, setTone] = useState<(typeof TONE)[number][0]>("balanced");
  const [aboutMe, setAboutMe] = useState("");
  const [idea, setIdea] = useState<string | null>(null);
  const [hours, setHours] = useState<WorkSchedule | null>(null);
  const areas = lifeAreas(stage ?? undefined);

  const steps = useMemo<StepId[]>(
    () => [
      "hello",
      "week",
      ...(stage && lifeAreas(stage).school ? (["classes"] as const) : []),
      ...(stage && lifeAreas(stage).work ? (["job"] as const) : []),
      "money",
      "yours",
    ],
    [stage],
  );
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;

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
    setIndex((i) => Math.max(0, Math.min(steps.length - 1, i + delta)));
  };

  const addCourse = () => {
    const name = courseDraft.trim();
    if (name && courses.length < 12 && !courses.some((c) => c.toLowerCase() === name.toLowerCase())) setCourses((c) => [...c, name]);
    setCourseDraft("");
  };

  const finish = () =>
    start(async () => {
      const rate = job.rate.trim() ? Number(job.rate) : undefined;
      const bal = balance.trim() ? Number(balance.replace(/[$,\s]/g, "")) : undefined;
      if (bal !== undefined && Number.isNaN(bal)) return setError("Enter your balance as a number, like 1250.50.");
      const r = await completeOnboardingAction({
        lifeStage: stage ?? undefined,
        courses: !areas.school ? [] : [...courses, ...(courseDraft.trim() ? [courseDraft.trim()] : [])],
        job:
          areas.work && job.name.trim()
            ? { name: job.name.trim(), hourlyRate: rate !== undefined && !Number.isNaN(rate) ? rate : undefined, schedule: hours ?? undefined }
            : undefined,
        checking: bal !== undefined ? { name: "Checking", balance: bal } : undefined,
        studyTime: studyTime ?? undefined,
        jarvisTone: tone,
        aboutMe: aboutMe.trim() || undefined,
      });
      if (r?.ok) router.replace(idea ? `/jarvis?ask=${encodeURIComponent(idea)}` : "/");
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
        <div className="flex items-center gap-1.5" aria-label={`Step ${index + 1} of ${steps.length}`}>
          {steps.map((s, i) => (
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
            <div data-anim>
              <BrandMark className="h-14 w-14" priority />
            </div>
            <h1 data-anim className="mt-8 font-display text-[44px] leading-[1.05] font-medium tracking-tight">
              Hi {firstName}.
            </h1>
            <p data-anim className="mt-4 text-[17px] leading-relaxed text-text-2">
              LifeFlow keeps your classes, work, money and plans in one calm place, and Jarvis helps with all of it.
            </p>
            <p data-anim className="mt-3 text-[15px] text-muted">
              A few quick questions so your first day isn&apos;t empty. Everything can be changed later.
            </p>
          </>
        )}

        {step === "week" && (
          <>
            <Title>What fills your week?</Title>
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
                    <span className="block text-[16px] font-medium">{label}</span>
                    <span className={cn("block text-sm", stage === value ? "opacity-80" : "text-muted")}>{hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "classes" && (
          <>
            <Title sub="Just the names for now. Jarvis can add assignments from your syllabus later.">Your classes</Title>
            <form
              data-anim
              className="mt-6 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addCourse();
              }}
            >
              <Input
                value={courseDraft}
                onChange={(e) => setCourseDraft(e.target.value)}
                placeholder="e.g. Biology II"
                aria-label="Class name"
                maxLength={200}
                className="flex-1"
              />
              <Button type="submit" variant="secondary" aria-label="Add class" disabled={!courseDraft.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </form>
            <ul data-anim className="mt-4 flex flex-wrap gap-2" aria-label="Classes added">
              {courses.map((c) => (
                <li key={c} className="flex items-center gap-1.5 rounded-full bg-surface py-1.5 pr-2 pl-3.5 text-sm shadow-soft">
                  {c}
                  <button
                    onClick={() => setCourses((x) => x.filter((y) => y !== c))}
                    aria-label={`Remove ${c}`}
                    className="rounded-full p-0.5 text-muted hover:text-text"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {step === "job" && (
          <>
            <Title sub="Used to estimate earnings from your shifts. Pay only counts as income once it's in your bank.">Where do you work?</Title>
            <div data-anim className="mt-6 flex flex-col gap-4">
              <Field label="Workplace" htmlFor="ob-job">
                <Input
                  id="ob-job"
                  value={job.name}
                  onChange={(e) => setJob((j) => ({ ...j, name: e.target.value }))}
                  placeholder="Campus Library"
                  maxLength={200}
                />
              </Field>
              <WorkHours value={hours} onChange={setHours} />
              <Field label="Hourly pay (optional)" htmlFor="ob-rate">
                <Input
                  id="ob-rate"
                  value={job.rate}
                  onChange={(e) => setJob((j) => ({ ...j, rate: e.target.value }))}
                  inputMode="decimal"
                  placeholder="16.50"
                />
              </Field>
            </div>
          </>
        )}

        {step === "money" && (
          <>
            <Title sub="Type what your bank app shows right now. Automatic bank sync is coming; you can update this anytime.">
              What&apos;s in your checking?
            </Title>
            <div data-anim className="mt-6">
              <Field label="Checking balance" htmlFor="ob-bal">
                <Input id="ob-bal" value={balance} onChange={(e) => setBalance(e.target.value)} inputMode="decimal" placeholder="1,250.00" />
              </Field>
            </div>
          </>
        )}

        {step === "yours" && (
          <>
            <Title>Make it yours</Title>
            <div className="mt-6 flex flex-col gap-6">
              {areas.school && (
                <Group label="Best time to study">
                  <Chips options={STUDY} value={studyTime} onChange={setStudyTime} />
                </Group>
              )}
              <Group label="How Jarvis should answer">
                <Chips options={TONE} value={tone} onChange={(v) => setTone(v ?? "balanced")} />
              </Group>
              <Group label="Appearance">
                <ThemePicker initial={theme} />
              </Group>
              <Group label="Try one with Jarvis first (optional)">
                <div className="flex flex-col gap-2" role="radiogroup" aria-label="Try one with Jarvis first">
                  {starterIdeas(stage ?? undefined).map((p) => (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={idea === p}
                      onClick={() => setIdea(idea === p ? null : p)}
                      className={cn(
                        "min-h-11 rounded-2xl px-4 py-3 text-left text-[15px] transition-all",
                        idea === p ? "bg-hero text-hero-text shadow-lift" : "bg-surface shadow-soft",
                      )}
                    >
                      &ldquo;{p}&rdquo;
                    </button>
                  ))}
                </div>
              </Group>
              <div data-anim>
                <Field label="Anything Jarvis should know about you? (optional)" htmlFor="ob-about">
                  <Textarea
                    id="ob-about"
                    value={aboutMe}
                    onChange={(e) => setAboutMe(e.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="I'm saving for a car and I hate early mornings."
                  />
                </Field>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-3 pt-8">
        {error && <FormError message={error} />}
        {last ? (
          <Button onClick={finish} loading={pending} className="h-12 text-[15px]">
            Finish
          </Button>
        ) : (
          <Button onClick={() => go(1)} disabled={step === "week" && !stage} className="h-12 text-[15px]">
            {step === "hello" ? "Let's set it up" : "Continue"}
          </Button>
        )}
        {(step === "classes" || step === "job" || step === "money") && (
          <button onClick={() => go(1)} className="text-sm text-muted hover:text-text">
            Skip this step
          </button>
        )}
      </div>
    </div>
  );
}

function Title({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <>
      <h1 data-anim className="font-display text-[34px] leading-tight font-medium tracking-tight">
        {children}
      </h1>
      {sub && (
        <p data-anim className="mt-2 text-[15px] text-muted">
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

function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly (readonly [T, string])[];
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(value === v ? null : v)}
          className={cn(
            "rounded-full px-4 py-2 text-sm transition-all",
            value === v ? "bg-hero text-hero-text shadow-soft" : "bg-surface text-text-2 shadow-soft hover:text-text",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
