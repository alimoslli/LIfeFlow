import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandLockup, BrandMark } from "@/components/brand/brand-mark";

/** The front page for anyone who isn't signed in. Signed-in visitors never see it (see proxy.ts). */
export const metadata: Metadata = {
  title: { absolute: "LifeFlow: Your whole life, made simple" },
};

const button =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent px-7 text-[15px] font-medium text-accent-text transition-colors hover:bg-accent-hover";

const AREAS = [
  { name: "Today", body: "What's next, what's due, and what needs you. One screen, every morning." },
  { name: "Calendar", body: "Classes, shifts, events and deadlines together. Tap any block to change it. Syncs with Google Calendar." },
  { name: "School", body: "Courses and assignments from Canvas, with study time built around your free hours. Jarvis coaches, and never does graded work." },
  { name: "Work", body: "Jobs, shifts and hours, and what you've earned so far." },
  { name: "Money", body: "Connect your bank and choose which accounts LifeFlow sees. Spending, bills and what's coming in. LifeFlow never moves money." },
  {
    name: "Goals and habits",
    body: "Goals don't have to be about money. Jarvis checks in each evening and asks how you moved them forward, in your own words.",
  },
  { name: "Health", body: "Sleep, steps and workouts from Apple Health, in the same week view as everything else." },
];

const STEPS = [
  { title: "Create your account", body: "Sign up in under a minute." },
  { title: "Add your week", body: "Classes, a job, bills and goals. Connect the rest whenever you're ready." },
  { title: "Follow Today", body: "Open Today and go. A short tour shows you the rest." },
];

const PRINCIPLES = [
  { title: "You choose what connects", body: "Turn any bank account on or off at any time." },
  { title: "Your data stays yours", body: "Never sold, and never used to train AI without your clear permission." },
  { title: "Jarvis asks first", body: "He checks with you before sending, spending or deleting anything." },
  { title: "Only what's real", body: "Nothing shows as done until it is. Money counts only once it has landed." },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-bg text-text">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <BrandLockup markClassName="h-8 w-8" priority />
        <nav className="flex items-center gap-1" aria-label="Account">
          <Link href="/login" className="inline-flex min-h-11 items-center rounded-full px-4 text-[15px] text-text-2 transition-colors hover:text-text">
            Sign in
          </Link>
          <Link href="/signup" className={`${button} min-h-11 px-5 text-sm`}>
            Get started
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-5 pt-12 pb-20 sm:px-8 sm:pt-20 lg:pt-28">
          <div className="max-w-4xl">
            <h1 className="animate-rise font-display text-[52px] leading-[0.98] font-medium tracking-[-0.04em] text-balance sm:text-[84px] lg:text-[96px]">
              Your whole life, in flow.
            </h1>
            <p className="animate-rise mt-7 max-w-2xl text-[19px] leading-relaxed text-text-2 sm:text-[21px]" style={{ animationDelay: "80ms" }}>
              LifeFlow puts your calendar, tasks, schedules, money, goals, habits and health in one calm place. Jarvis, your assistant, knows your week and
              tells you what to do next.
            </p>
            <div className="animate-rise mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center" style={{ animationDelay: "160ms" }}>
              <Link href="/signup" className={button}>
                Get started
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/login" className="inline-flex min-h-12 items-center text-[15px] text-text-2 underline-offset-4 hover:text-text hover:underline">
                I already have an account
              </Link>
            </div>
          </div>

          <TodayView />
        </section>

        {/* Jarvis */}
        <section className="border-t border-border">
          <div className="mx-auto grid max-w-6xl gap-14 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:items-center lg:py-28">
            <div>
              <p className="text-sm font-medium text-accent">Jarvis</p>
              <h2 className="mt-4 font-display text-[40px] leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-[56px]">
                Ask in plain words. Get a plan.
              </h2>
              <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-text-2">
                Jarvis checks your calendar, assignments, shifts and money before he answers, so you get a plan built around your real week.
              </p>
            </div>
            <ul className="divide-y divide-border border-y border-border">
              {["When can I study before my shift on Wednesday?", "Can I afford concert tickets this week?", "What should I do first today?"].map((q) => (
                <li key={q} className="flex items-center justify-between gap-6 py-5 text-[17px]">
                  <span>{q}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Everything in one place */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <h2 className="font-display text-[40px] leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-[56px]">
                One place for the whole week.
              </h2>
            </div>
            <ul className="mt-14 border-t border-border">
              {AREAS.map((a) => (
                <li key={a.name} className="grid gap-2 border-b border-border py-7 sm:grid-cols-[minmax(0,0.35fr)_minmax(0,0.65fr)] sm:gap-10">
                  <h3 className="text-[19px] font-semibold tracking-[-0.01em]">{a.name}</h3>
                  <p className="text-[16px] leading-relaxed text-text-2">{a.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Setup */}
        <section className="border-t border-border bg-surface/50">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
            <h2 className="font-display text-[40px] leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-[56px]">Ready in three steps.</h2>
            <ol className="mt-14 grid gap-10 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <span className="font-display text-[15px] text-accent">0{i + 1}</span>
                  <h3 className="mt-3 text-[21px] font-semibold tracking-[-0.01em]">{s.title}</h3>
                  <p className="mt-2 text-[16px] leading-relaxed text-text-2">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Principles */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
            <h2 className="max-w-2xl font-display text-[40px] leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-[56px]">
              Built so you stay in charge.
            </h2>
            <ul className="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2">
              {PRINCIPLES.map((p) => (
                <li key={p.title} className="border-t border-border pt-6">
                  <h3 className="text-[19px] font-semibold tracking-[-0.01em]">{p.title}</h3>
                  <p className="mt-2 text-[16px] leading-relaxed text-text-2">{p.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Closing */}
        <section className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-5 py-20 sm:px-8 md:flex-row md:items-end md:justify-between lg:py-28">
            <h2 className="font-display text-[44px] leading-[1.02] font-medium tracking-[-0.035em] text-balance sm:text-[64px]">Start your week in order.</h2>
            <div className="flex flex-col gap-3">
              <Link href="/signup" className={button}>
                Get started
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <p className="text-sm text-muted">
                Already have an account?{" "}
                <Link href="/login" className="text-text-2 underline underline-offset-4 hover:text-text">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <BrandLockup markClassName="h-6 w-6" />
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

/** One realistic view of Today with example content. It's the page's only illustration. */
function TodayView() {
  return (
    <div
      className="animate-rise mt-16 overflow-hidden rounded-[28px] border border-border bg-surface shadow-lift lg:mt-24"
      style={{ animationDelay: "240ms" }}
      aria-hidden
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-7">
        <div className="flex items-center gap-3">
          <BrandMark className="h-7 w-7" alt="" />
          <span className="font-display text-[20px] font-medium">Today</span>
        </div>
        <span className="text-xs text-muted">Example</span>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="divide-y divide-border">
          <div className="bg-hero px-5 py-7 text-hero-text sm:px-7">
            <p className="text-xs font-medium tracking-[0.1em] uppercase opacity-80">Up next · in 40 min</p>
            <p className="mt-2 font-display text-[28px] leading-tight font-medium">Pharmacology quiz review</p>
            <p className="mt-1 text-sm opacity-85">Library · 2:00 to 3:30 PM</p>
          </div>
          {[
            ["4:00 PM", "Shift at the campus café", "4h"],
            ["Fri", "Biology lab report due", "Canvas"],
            ["Thu", "Phone bill", "$45"],
          ].map(([when, what, note]) => (
            <div key={what} className="flex items-baseline justify-between gap-6 px-5 py-5 sm:px-7">
              <div className="min-w-0">
                <p className="text-[15px] font-medium">{what}</p>
                <p className="mt-1 text-sm text-muted">{when}</p>
              </div>
              <span className="shrink-0 text-sm text-text-2">{note}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-6 border-t border-border bg-surface-2/60 px-5 py-7 sm:px-7 lg:border-t-0 lg:border-l">
          <div>
            <p className="text-xs font-medium tracking-[0.1em] text-muted uppercase">Available now</p>
            <p className="tabular mt-2 font-display text-[40px] leading-none font-medium">$412</p>
          </div>
          <div className="rounded-2xl bg-surface p-4 text-[15px] leading-snug shadow-soft">
            <p>You&apos;re free 1:00 to 3:30 PM before your shift. Two study blocks fit.</p>
            <p className="mt-3 font-medium text-accent">Add them to my calendar</p>
          </div>
        </div>
      </div>
    </div>
  );
}
