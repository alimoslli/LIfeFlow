import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { BrandLockup } from "@/components/brand/brand-mark";
import { CinematicHero } from "@/components/ui/cinematic-landing-hero";
import { getDb } from "@/server/db/client";
import { inviterFor } from "@/server/services/invites";

/** The front page for anyone who isn't signed in. Signed-in visitors never see it (see proxy.ts). */
export const metadata: Metadata = {
  title: { absolute: "LifeFlow: Your whole life, made simple" },
};

const button =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent px-7 text-[0.9375rem] font-medium text-accent-text transition-colors hover:bg-accent-hover";

const AREAS = [
  { name: "Today", body: "What's next, what's due, and what needs you. One screen, every morning." },
  { name: "Calendar", body: "Classes, shifts, events and deadlines together. Tap any block to change it. Syncs with Google Calendar." },
  {
    name: "School",
    body: "Courses and assignments from Canvas, with study time built around your free hours. Your personal assistant coaches, and never does graded work.",
  },
  { name: "Work", body: "Jobs, shifts and hours, and what you've earned so far." },
  { name: "Money", body: "Connect your bank and choose which accounts LifeFlow sees. Spending, bills and what's coming in. LifeFlow never moves money." },
  {
    name: "Goals and habits",
    body: "Goals don't have to be about money. Your personal assistant checks in each evening and asks how you moved them forward, in your own words.",
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
  { title: "Your assistant asks first", body: "It checks with you before sending, spending or deleting anything." },
  { title: "Only what's real", body: "Nothing shows as done until it is. Money counts only once it has landed." },
];

const INSTAGRAM = "https://www.instagram.com/lifeflowweb";

const FAQS: { q: string; a: string }[] = [
  {
    q: "What is LifeFlow?",
    a: "A personal planner and AI assistant in one app. It keeps your classes, shifts, to-dos, money, goals, habits and health together, and your assistant uses all of it to plan your day.",
  },
  {
    q: "Who is it for?",
    a: "Anyone with a busy week. It's built especially for people juggling school and work, but you only use the parts you need.",
  },
  {
    q: "How much does it cost?",
    a: "LifeFlow is free while we're testing. When it launches on the App Store there will be a free plan and a paid plan, and we'll tell you before anything changes.",
  },
  {
    q: "Do I have to connect my bank or school?",
    a: "No. You can add everything yourself, or send your assistant a picture of a syllabus, a list of assignments, a work schedule or a bank statement and it adds it for you. Connecting Canvas, Google Calendar or your bank is optional.",
  },
  {
    q: "My school doesn't use Canvas. Can I still use it?",
    a: "Yes. Send screenshots of your assignments or upload your syllabus, or just tell your assistant your classes.",
  },
  {
    q: "Is my data private?",
    a: "Your data is locked to your account, so no other user can see it. It's never sold, and it's never used to train AI without your clear permission. You can delete your account and everything in it from Settings.",
  },
  {
    q: "Can LifeFlow move my money?",
    a: "No. Bank connections are read-only. LifeFlow shows what you spent and what's coming in, and it can't make payments or transfers.",
  },
  {
    q: "Will the assistant do my homework?",
    a: "No. It helps you plan, study and understand, but it never writes or solves graded work for you.",
  },
  {
    q: "Is there an iPhone app?",
    a: "The App Store app is on the way. Today you can open LifeFlow in Safari and add it to your Home Screen, and it works like an app.",
  },
];

/** Instagram's glyph (lucide no longer ships brand icons). */
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  // A friend's invite link (/?invite=<code>): say who sent it and carry the code to sign-up.
  const { invite } = await searchParams;
  const code = invite?.trim().toLowerCase() ?? "";
  const inviter = code ? await inviterFor(getDb(), code) : null;
  const signupHref = inviter ? `/signup?invite=${encodeURIComponent(code)}` : "/signup";
  return (
    <div className="min-h-dvh overflow-x-clip bg-bg text-text">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <BrandLockup markClassName="h-8 w-8" priority />
        <nav className="flex items-center gap-1" aria-label="Account">
          <a
            href="#faq"
            className="hidden min-h-11 items-center rounded-full px-4 text-[0.9375rem] text-text-2 transition-colors hover:text-text sm:inline-flex"
          >
            FAQ
          </a>
          <Link href="/login" className="inline-flex min-h-11 items-center rounded-full px-4 text-[0.9375rem] text-text-2 transition-colors hover:text-text">
            Sign in
          </Link>
          <Link href={signupHref} className={`${button} min-h-11 px-5 text-sm`}>
            Get started
          </Link>
        </nav>
      </header>

      <main>
        {/* What LifeFlow is, in plain words, before anything moves. */}
        <section className="mx-auto max-w-6xl px-5 pt-10 pb-14 sm:px-8 sm:pt-16 lg:pt-20">
          <div className="max-w-4xl">
            {inviter && (
              <p className="animate-rise mb-5 inline-flex rounded-full bg-accent-soft px-4 py-2 text-sm font-medium text-text">
                {inviter.firstName} invited you to LifeFlow.
              </p>
            )}
            <p className="animate-rise text-sm font-medium text-accent">A personal planner and AI assistant</p>
            <h1 className="animate-rise mt-4 font-display text-[3rem] leading-[1.0] font-medium tracking-[-0.04em] text-balance sm:text-[5rem] lg:text-[5.75rem]">
              Your whole life, in flow.
            </h1>
            <p className="animate-rise mt-6 max-w-2xl text-[1.125rem] leading-relaxed text-text-2 sm:text-[1.25rem]" style={{ animationDelay: "80ms" }}>
              LifeFlow is one app for your classes, shifts, money, goals and health. Your personal assistant knows your week and plans around all of it.
            </p>
            <div className="animate-rise mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center" style={{ animationDelay: "160ms" }}>
              <Link href={signupHref} className={button}>
                Get started
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex min-h-12 items-center gap-2 rounded-full px-0 text-[0.9375rem] font-medium text-text-2 transition-colors hover:text-text"
              >
                See how it works
                <ChevronDown className="h-4 w-4 motion-safe:animate-bounce" aria-hidden />
              </a>
            </div>
            <p className="animate-rise mt-4 text-sm text-muted" style={{ animationDelay: "220ms" }}>
              Already have an account?{" "}
              <Link href="/login" className="text-text-2 underline underline-offset-4 hover:text-text">
                Sign in
              </Link>
            </p>
          </div>
        </section>

        <div id="how-it-works" className="scroll-mt-0 border-t border-border">
          <CinematicHero signupHref={signupHref} />
        </div>

        {/* Your personal assistant */}
        <section className="border-t border-border">
          <div className="mx-auto grid max-w-6xl gap-14 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:items-center lg:py-28">
            <div>
              <p className="text-sm font-medium text-accent">Your personal assistant</p>
              <h2 className="mt-4 font-display text-[2.5rem] leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-[3.5rem]">
                Ask in plain words. Get a plan.
              </h2>
              <p className="mt-6 max-w-lg text-[1.0625rem] leading-relaxed text-text-2">
                Your assistant checks your calendar, assignments, shifts and money before it answers, so you get a plan built around your real week.
              </p>
            </div>
            <ul className="divide-y divide-border border-y border-border">
              {["When can I study before my shift on Wednesday?", "Can I afford concert tickets this week?", "What should I do first today?"].map((q) => (
                <li key={q} className="flex items-center justify-between gap-6 py-5 text-[1.0625rem]">
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
              <h2 className="font-display text-[2.5rem] leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-[3.5rem]">
                One place for the whole week.
              </h2>
            </div>
            <ul className="mt-14 border-t border-border">
              {AREAS.map((a) => (
                <li key={a.name} className="grid gap-2 border-b border-border py-7 sm:grid-cols-[minmax(0,0.35fr)_minmax(0,0.65fr)] sm:gap-10">
                  <h3 className="text-[1.1875rem] font-semibold tracking-[-0.01em]">{a.name}</h3>
                  <p className="text-[1rem] leading-relaxed text-text-2">{a.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Setup */}
        <section className="border-t border-border bg-surface/50">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
            <h2 className="font-display text-[2.5rem] leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-[3.5rem]">Ready in three steps.</h2>
            <ol className="mt-14 grid gap-10 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <span className="font-display text-[0.9375rem] text-accent">0{i + 1}</span>
                  <h3 className="mt-3 text-[1.3125rem] font-semibold tracking-[-0.01em]">{s.title}</h3>
                  <p className="mt-2 text-[1rem] leading-relaxed text-text-2">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Principles */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
            <h2 className="max-w-2xl font-display text-[2.5rem] leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-[3.5rem]">
              Built so you stay in charge.
            </h2>
            <ul className="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2">
              {PRINCIPLES.map((p) => (
                <li key={p.title} className="border-t border-border pt-6">
                  <h3 className="text-[1.1875rem] font-semibold tracking-[-0.01em]">{p.title}</h3>
                  <p className="mt-2 text-[1rem] leading-relaxed text-text-2">{p.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Questions */}
        <section id="faq" className="scroll-mt-6 border-t border-border">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:py-28">
            <div>
              <h2 className="font-display text-[2.5rem] leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-[3.5rem]">Questions</h2>
              <p className="mt-4 max-w-sm text-[1.0625rem] leading-relaxed text-text-2">
                Something else? Message us on{" "}
                <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline underline-offset-4">
                  Instagram @lifeflowweb
                </a>
                .
              </p>
            </div>
            <div className="divide-y divide-border border-y border-border">
              {FAQS.map((f) => (
                <details key={f.q} className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-4 text-[1.0625rem] font-medium [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <ChevronDown className="h-5 w-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="pb-5 text-[1rem] leading-relaxed text-text-2">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-5 py-20 sm:px-8 md:flex-row md:items-end md:justify-between lg:py-28">
            <h2 className="font-display text-[2.75rem] leading-[1.02] font-medium tracking-[-0.035em] text-balance sm:text-[4rem]">
              Start your week in order.
            </h2>
            <div className="flex flex-col gap-3">
              <Link href={signupHref} className={button}>
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
            <a href="#faq" className="hover:text-text">
              FAQ
            </a>
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
          <div className="flex items-center gap-4">
            <a
              href={INSTAGRAM}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LifeFlow on Instagram (@lifeflowweb)"
              className="inline-flex min-h-11 items-center gap-2 hover:text-text"
            >
              <InstagramIcon className="h-5 w-5" />
              @lifeflowweb
            </a>
            <p>© 2026 LifeFlow</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
