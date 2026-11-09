import type { Metadata } from "next";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { BrandLockup } from "@/components/brand/brand-mark";
import { AssistantScene } from "@/components/landing/assistant-scene";
import { CanvasLogo, GmailLogo, GoogleCalendarLogo, MicrosoftLogo } from "@/components/landing/logos";
import { getDb } from "@/server/db/client";
import { inviterFor } from "@/server/services/invites";

/** The front page for anyone who isn't signed in. Signed-in visitors never see it (see proxy.ts). */
export const metadata: Metadata = {
  title: { absolute: "LifeFlow: Your whole life, in flow." },
};

const button =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent px-7 text-[0.9375rem] font-medium text-accent-text shadow-[0_10px_24px_-12px_rgb(31_72_56_/_0.7)] transition-[transform,background-color] hover:bg-accent-hover active:scale-[0.98]";

const MOMENTS = [
  {
    tag: "Shift vs exam",
    tone: "bg-warning-soft text-warning",
    title: "Your Thursday shift runs until 10. Your Bio exam is Friday at 9.",
    body: "It moves your study block to Wednesday and asks before touching anything.",
    used: [
      ["Exam · Fri 9 AM", "bg-warning-soft"],
      ["Shift · Thu 5 to 10 PM", "bg-info-soft"],
    ],
  },
  {
    tag: "Rent before payday",
    tone: "bg-accent-soft text-accent",
    title: "Checking could hit $0 on Friday.",
    body: "Rent comes out before your next paycheck. It tells you the one thing that fixes it.",
    used: [
      ["$412 available", "bg-accent-soft"],
      ["Rent $950 · Fri", "bg-surface-2"],
    ],
  },
  {
    tag: "Double charge",
    tone: "bg-info-soft text-info",
    title: "You were charged twice for Spotify.",
    body: "It wrote the message to get your $11.99 back. You send it, or you don't.",
    used: [["Spotify × 2 · Monday", "bg-info-soft"]],
  },
];

const TRUST = [
  ["Read-only bank connections.", "It can see, never move, your money."],
  ["Locked to your account.", "Nobody else can see your data."],
  ["Never sold,", "and never used to train AI without your clear permission."],
  ["It asks first", "before sending, spending or deleting anything."],
];

const WHY = [
  ["One job", "A personal assistant, and nothing else. Every feature exists to help you run your life."],
  ["Always connected", "Classes, shifts, money, calendar and health at the same time, so it sees how they affect each other."],
  ["Built by someone living it", "Made by a person with your schedule, who keeps asking what you need."],
];

const INSTAGRAM = "https://www.instagram.com/lifeflowweb";

const FAQS: { q: string; a: string }[] = [
  {
    q: "Do I have to connect my bank or school?",
    a: "No. Add everything yourself, or send your assistant a photo of a syllabus, a work schedule or a bank statement and it adds it for you. Connecting is optional.",
  },
  {
    q: "My school doesn't use Canvas. Can I still use it?",
    a: "Yes. Send screenshots of your assignments, upload your syllabus, or tell your assistant your classes.",
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

const h2 = "font-display text-[2.25rem] leading-[1.02] font-medium tracking-[-0.03em] text-balance sm:text-[3.25rem]";
const eyebrow = "text-xs font-medium tracking-[0.08em] text-muted uppercase";

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
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <BrandLockup markClassName="h-8 w-8" priority />
        <nav className="flex items-center gap-1" aria-label="Account">
          <a
            href="#why"
            className="hidden min-h-11 items-center rounded-full px-4 text-[0.9375rem] text-text-2 transition-colors hover:text-text sm:inline-flex"
          >
            Why LifeFlow
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
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-6 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:gap-14 lg:pb-20">
          <div>
            {inviter && (
              <p className="animate-rise mb-5 inline-flex rounded-full bg-accent-soft px-4 py-2 text-sm font-medium text-text">
                {inviter.firstName} invited you to LifeFlow.
              </p>
            )}
            <p className={`animate-rise ${eyebrow}`}>A personal assistant that sees your whole life</p>
            <h1
              className="animate-rise mt-4 font-display text-[2.9rem] leading-[0.98] font-medium tracking-[-0.045em] text-balance sm:text-[4.5rem] lg:text-[4.9rem]"
              style={{ animationDelay: "60ms" }}
            >
              Every app sees one slice. <em className="text-accent">LifeFlow sees all of it.</em>
            </h1>
            <p className="animate-rise mt-5 max-w-[46ch] text-[1.125rem] leading-relaxed text-text-2" style={{ animationDelay: "120ms" }}>
              Your bank, your classes, your shifts and your calendar, connected at once. Your assistant finds what&apos;s about to clash and fixes it before you
              feel it.
            </p>
            <div className="animate-rise mt-8 flex flex-wrap items-center gap-x-4 gap-y-2" style={{ animationDelay: "180ms" }}>
              <Link href={signupHref} className={button}>
                Get started
              </Link>
              <a href="#moments" className="inline-flex min-h-12 items-center px-2 text-[0.9375rem] font-medium text-text-2 transition-colors hover:text-text">
                See what it does
              </a>
            </div>
            <ul className="animate-rise mt-5 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted" style={{ animationDelay: "240ms" }}>
              {["Set up in two minutes", "Never moves your money", "Built by a student"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="mx-auto w-full max-w-[320px] pb-8 lg:max-w-[330px]">
            <AssistantScene />
          </div>
        </section>

        {/* Real services it connects to */}
        <div className="border-y border-border px-5 py-6 sm:px-8">
          <div className="mx-auto grid max-w-6xl items-center gap-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-10">
            <p className="max-w-[22ch] text-sm leading-snug text-muted">Connects to what you already use</p>
            <ul className="flex flex-wrap items-center gap-x-7 gap-y-3.5 text-[0.9375rem] font-medium text-text-2">
              <li className="flex items-center gap-2.5">
                <CanvasLogo className="h-[22px] w-[22px]" />
                Canvas
              </li>
              <li className="flex items-center gap-2.5">
                <GoogleCalendarLogo className="h-[22px] w-[22px]" />
                Google Calendar
              </li>
              <li className="flex items-center gap-2.5">
                <GmailLogo className="h-[22px] w-[22px]" />
                Gmail
              </li>
              <li className="flex items-center gap-2.5">
                <MicrosoftLogo className="h-[22px] w-[22px]" />
                Outlook and Teams
              </li>
              <li>
                <span className="font-semibold tracking-tight">Plaid</span> for your bank
              </li>
              <li>Apple Health</li>
            </ul>
          </div>
        </div>

        <section id="moments" className="scroll-mt-4 px-5 py-16 sm:px-8 lg:py-20">
          <div className="mx-auto max-w-6xl">
            <p className={eyebrow}>What it does before you ask</p>
            <h2 className={`mt-3 max-w-[18ch] ${h2}`}>It notices the problem while there&apos;s still time to fix it.</h2>
            <p className="mt-4 max-w-[52ch] text-[1.0625rem] text-text-2">
              Three things your assistant does on a normal week. Each one shows the numbers it used.
            </p>
            <ul className="mt-9 grid gap-3.5 md:grid-cols-3">
              {MOMENTS.map((m) => (
                <li key={m.tag} className="flex min-w-0 flex-col gap-2.5 rounded-[26px] bg-surface p-5 shadow-soft">
                  <span className={`self-start rounded-full px-2.5 py-1 text-[0.6875rem] font-medium tracking-[0.06em] uppercase ${m.tone}`}>{m.tag}</span>
                  <h3 className="font-display text-[1.4375rem] leading-[1.12] font-medium tracking-[-0.02em]">{m.title}</h3>
                  <p className="text-[0.9375rem] text-text-2">{m.body}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {m.used.map(([t, bg]) => (
                      <span key={t} className={`rounded-full px-2.5 py-1 text-[0.6875rem] font-medium ${bg}`}>
                        {t}
                      </span>
                    ))}
                  </div>
                  <small className="mt-auto pt-2 text-xs text-muted">Example</small>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="why" className="scroll-mt-4 border-t border-border px-5 py-16 sm:px-8 lg:py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
            <blockquote className="font-display text-[1.75rem] leading-[1.15] font-medium tracking-[-0.03em] text-balance sm:text-[2.5rem]">
              Built by a student solving <em className="text-accent">his own problem</em>, for everyone with a full life.
            </blockquote>
            <div className="space-y-3 text-[1.0625rem] text-text-2">
              <p>Seven classes. Working 30 hours a week. Side projects. Applications. Nothing connected any of it, so I built the assistant I needed.</p>
              <p>
                It has one job: serve you. It isn&apos;t made for research or websites. It&apos;s made to find the dots across your whole week and help you make
                the most of your time.
              </p>
            </div>
          </div>
          <ul className="mx-auto mt-9 grid max-w-6xl gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map(([b, t]) => (
              <li key={b} className="flex items-start gap-2.5 text-sm leading-snug text-text-2">
                <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden>
                  <Check className="h-3 w-3" strokeWidth={3.2} />
                </span>
                <span>
                  <b className="font-semibold text-text">{b}</b> {t}
                </span>
              </li>
            ))}
          </ul>
          <ul className="mx-auto mt-10 grid max-w-6xl gap-7 md:grid-cols-3">
            {WHY.map(([t, b]) => (
              <li key={t} className="border-t-2 border-accent pt-3.5">
                <h3 className="font-display text-[1.5rem] font-medium tracking-[-0.02em]">{t}</h3>
                <p className="mt-1.5 text-[0.96875rem] text-text-2">{b}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="faq" className="scroll-mt-4 border-t border-border px-5 py-16 sm:px-8 lg:py-20">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div>
              <p className={eyebrow}>Questions</p>
              <h2 className={`mt-3 ${h2}`}>Straight answers.</h2>
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

        <section className="px-5 pb-6 sm:px-8">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[36px] bg-hero p-8 text-hero-text sm:p-14">
            <span
              className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255_/_0.16),transparent)]"
              aria-hidden
            />
            <h2 className="relative max-w-[16ch] font-display text-[2.25rem] leading-none font-medium tracking-[-0.035em] text-balance sm:text-[3.5rem]">
              Start your week in order.
            </h2>
            <p className="relative mt-5 max-w-[44ch] opacity-85">Add everything yourself, or connect it later.</p>
            <Link
              href={signupHref}
              className="relative mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-surface px-7 text-[0.9375rem] font-medium text-text transition-transform active:scale-[0.98]"
            >
              Get started
            </Link>
          </div>
          <p className="mx-auto mt-5 max-w-6xl text-xs leading-relaxed text-muted">
            Canvas is a trademark of Instructure, Inc. Google, Google Calendar and Gmail are trademarks of Google LLC. Microsoft, Outlook and Teams are
            trademarks of the Microsoft group of companies. Apple and Apple Health are trademarks of Apple Inc. Plaid is a trademark of Plaid Inc. LifeFlow
            works with these services and is not endorsed by them.
          </p>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <BrandLockup markClassName="h-6 w-6" />
          <nav className="flex flex-wrap gap-x-6" aria-label="Footer">
            <a href="#faq" className="inline-flex min-h-11 items-center hover:text-text">
              FAQ
            </a>
            <Link href="/privacy" className="inline-flex min-h-11 items-center hover:text-text">
              Privacy
            </Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center hover:text-text">
              Terms
            </Link>
            <Link href="/integrity" className="inline-flex min-h-11 items-center hover:text-text">
              Academic integrity
            </Link>
            <Link href="/login" className="inline-flex min-h-11 items-center hover:text-text">
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
