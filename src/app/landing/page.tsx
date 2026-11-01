import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Briefcase, CalendarDays, HeartPulse, ShieldCheck, Sparkles, Sun, Target, Wallet } from "lucide-react";
import { BrandLockup, BrandMark } from "@/components/brand/brand-mark";

/** The front door for anyone who isn't signed in. Signed-in visitors never see it (see proxy.ts). */
export const metadata: Metadata = {
  title: { absolute: "LifeFlow: Your whole life, made simple" },
};

const primary =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent px-6 text-[15px] font-medium text-accent-text shadow-soft transition-colors hover:bg-accent-hover";
const secondary =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-surface px-6 text-[15px] font-medium text-text shadow-soft transition-shadow hover:shadow-lift";

const FEATURES = [
  {
    icon: Sun,
    title: "Today",
    body: "Open one screen to see what's next, what's due, and what needs your attention before the day gets busy.",
  },
  {
    icon: Sparkles,
    title: "Jarvis",
    body: "Ask in plain words: when can I study, can I afford this, what should I do first. He answers from your real calendar, assignments, shifts and money.",
  },
  {
    icon: CalendarDays,
    title: "One calendar",
    body: "Classes, shifts, events and deadlines in one place. Tap any block to change it, and sync with Google Calendar.",
  },
  {
    icon: BookOpen,
    title: "School",
    body: "Bring in courses and assignments from Canvas, see what's due, and get study time built around your free time. Jarvis coaches you. He never does graded work for you.",
  },
  {
    icon: Briefcase,
    title: "Work",
    body: "Track your jobs, shifts and hours, and see what you've earned.",
  },
  {
    icon: Wallet,
    title: "Money",
    body: "Connect your bank through Plaid and choose which accounts LifeFlow sees. See what you've spent, what's coming in, and which bills are due. LifeFlow never moves your money.",
  },
  {
    icon: Target,
    title: "Goals and habits",
    body: "Not every goal is about money. Losing weight, reading more, saving for a car. Jarvis checks in each evening and asks how you worked toward them, in your own words.",
  },
  {
    icon: HeartPulse,
    title: "Health",
    body: "Bring in sleep, steps and workouts from Apple Health, and see how your week is going.",
  },
];

const STEPS = [
  {
    title: "Create your account",
    body: "Sign up, then set up your week in a few quick steps. Jarvis explains each part as you go.",
  },
  {
    title: "Add what's in your week",
    body: "Classes, a job, bills and goals. Connect Canvas, Google, your bank or Apple Health whenever you're ready.",
  },
  {
    title: "Start with Today",
    body: "Open Today and follow the plan. A short tour shows you where everything is.",
  },
];

const PROMISES = [
  "You choose what connects. Turn any bank account on or off at any time.",
  "Your data is never sold, and never used to train AI without your clear permission.",
  "Jarvis asks before he sends, spends or deletes anything.",
  "Nothing is shown as done until it is. Money counts only once it's real.",
  "LifeFlow never moves your money.",
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-bg text-text">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-5 pb-4 sm:px-6">
        <BrandLockup markClassName="h-9 w-9" priority />
        <nav className="flex items-center gap-2" aria-label="Account">
          <Link href="/login" className="inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-medium text-text-2 hover:text-text">
            Sign in
          </Link>
          <Link href="/signup" className={`${primary} min-h-11 px-5`}>
            Get started
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pt-20 lg:pb-24">
          <div className="animate-rise min-w-0">
            <p className="text-xs font-medium tracking-[0.12em] text-muted uppercase">A personal planner and AI assistant</p>
            <h1 className="mt-4 font-display text-[46px] leading-[1.02] font-medium tracking-[-0.035em] text-balance sm:text-[64px] lg:text-[72px]">
              Your whole life, in flow.
            </h1>
            <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-text-2">
              LifeFlow brings your calendar, tasks, schedules, money, goals, habits and health into one calm place. Jarvis knows your week, so you always know
              what&apos;s next.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/signup" className={primary}>
                Get started
              </Link>
              <Link href="/login" className={secondary}>
                I have an account
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted">Set up in a few minutes. You can connect banks and school later.</p>
          </div>

          <HeroPreview />
        </section>

        {/* Features */}
        <section className="border-t border-border/70 bg-surface/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <div className="max-w-2xl">
              <h2 className="font-display text-[34px] leading-tight font-medium tracking-[-0.02em] text-balance sm:text-[44px]">
                One calm place for your whole week.
              </h2>
              <p className="mt-4 text-[17px] leading-relaxed text-text-2">
                Everything LifeFlow does is connected, so a shift, an exam and a bill show up together instead of in five different apps.
              </p>
            </div>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <li key={f.title} className="rounded-3xl bg-surface p-6 shadow-soft">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                    <f.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-5 text-[19px] font-semibold tracking-[-0.01em]">{f.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-text-2">{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div>
              <h2 className="font-display text-[34px] leading-tight font-medium tracking-[-0.02em] text-balance sm:text-[44px]">Ready in three steps.</h2>
              <p className="mt-4 text-[17px] leading-relaxed text-text-2">No setup marathon. Start with what you know, and add the rest when it helps.</p>
            </div>
            <ol className="grid gap-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-5 rounded-3xl bg-surface p-6 shadow-soft">
                  <span className="font-display text-[34px] leading-none font-medium text-accent">{i + 1}</span>
                  <div className="min-w-0">
                    <h3 className="text-[19px] font-semibold tracking-[-0.01em]">{s.title}</h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-text-2">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Trust */}
        <section className="border-t border-border/70">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:py-24">
            <div>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <ShieldCheck className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="mt-6 font-display text-[34px] leading-tight font-medium tracking-[-0.02em] text-balance sm:text-[44px]">Built to be trusted.</h2>
              <p className="mt-4 text-[17px] leading-relaxed text-text-2">Your life is personal. LifeFlow is built so you stay in charge of it.</p>
            </div>
            <ul className="grid gap-5 self-center">
              {PROMISES.map((p) => (
                <li key={p} className="flex gap-3.5 text-[17px] leading-relaxed">
                  <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:pb-24">
          <div className="relative overflow-hidden rounded-[32px] bg-hero px-6 py-14 text-hero-text sm:px-12 sm:py-20">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgb(197_231_209_/_0.22),transparent_40%)]" aria-hidden />
            <div className="relative max-w-2xl">
              <h2 className="font-display text-[38px] leading-[1.05] font-medium tracking-[-0.025em] text-balance sm:text-[52px]">Start your week in order.</h2>
              <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-white/80">Create your account and Jarvis will walk you through the rest.</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/signup"
                  className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 text-[15px] font-medium text-[#1b1a17] shadow-lift hover:bg-white/90"
                >
                  Get started
                </Link>
                <Link
                  href="/login"
                  className="inline-flex min-h-12 items-center justify-center rounded-full px-6 text-[15px] font-medium text-white/90 hover:text-white"
                >
                  I have an account
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <BrandLockup markClassName="h-7 w-7" />
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
            <Link href="/privacy" className="hover:text-text">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-text">
              Terms
            </Link>
            <Link href="/integrity" className="hover:text-text">
              Academic integrity
            </Link>
            <Link href="/login" className="hover:text-text">
              Sign in
            </Link>
          </nav>
          <p>© 2026 LifeFlow</p>
        </div>
      </footer>
    </div>
  );
}

/** A quiet picture of the app with example content, so the first screen shows what it looks like. */
function HeroPreview() {
  return (
    <div className="animate-rise relative mx-auto w-full max-w-md lg:max-w-none" style={{ animationDelay: "120ms" }} aria-hidden>
      <div className="absolute -inset-10 rounded-[48px] bg-[radial-gradient(circle_at_50%_40%,var(--accent-soft),transparent_70%)]" />
      <div className="relative space-y-3.5 rounded-[32px] bg-surface/80 p-4 shadow-lift ring-1 ring-border/60 sm:p-5">
        <div className="relative overflow-hidden rounded-3xl bg-hero p-5 text-hero-text">
          <p className="text-xs font-medium tracking-[0.1em] uppercase opacity-80">Up next · in 40 min</p>
          <p className="mt-3 font-display text-[26px] leading-tight font-medium">Pharmacology quiz review</p>
          <p className="mt-1 text-sm opacity-85">Library, 2:00 to 3:30 PM</p>
          <div className="mt-5 flex items-center gap-3">
            <BrandMark className="h-9 w-9" alt="" />
            <span className="text-xs opacity-80">Example</span>
          </div>
        </div>

        <div className="flex gap-3 rounded-3xl bg-surface p-4 shadow-soft">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] leading-snug">You&apos;re free 1:00 to 3:30 PM before your 4:00 shift. Two 1-hour study blocks fit.</p>
            <p className="mt-2 text-sm font-medium text-accent">Put them on my calendar</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          <div className="rounded-3xl bg-surface p-4 shadow-soft">
            <p className="text-xs text-muted">Available now</p>
            <p className="tabular mt-1 font-display text-[28px] leading-none font-medium">$412</p>
            <p className="mt-2 text-xs text-text-2">Phone bill $45 on Thursday</p>
          </div>
          <div className="rounded-3xl bg-surface p-4 shadow-soft">
            <p className="text-xs text-muted">Reading goal</p>
            <p className="tabular mt-1 font-display text-[28px] leading-none font-medium">
              7<span className="text-base text-muted"> of 12</span>
            </p>
            <p className="mt-2 text-xs text-text-2">Books this year</p>
          </div>
        </div>
        <p className="px-1 pt-1 text-center text-xs text-muted">Example content</p>
      </div>
    </div>
  );
}
