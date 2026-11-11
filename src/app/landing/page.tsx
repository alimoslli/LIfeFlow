import type { Metadata } from "next";
import { ownsNight } from "@/lib/companions";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { BrandLockup } from "@/components/brand/brand-mark";
import { CanvasLogo, GmailLogo, GoogleCalendarLogo, MicrosoftLogo } from "@/components/landing/logos";
import { CompanionGlyph } from "@/components/sky/companion-glyph";
import { CastCards } from "@/components/skylings/cast-cards";
import { NightSky } from "@/components/skylings/night-sky";
import { SkyLink } from "@/components/skylings/sky-button";
import type { CompanionKey } from "@/lib/companions";
import { getDb } from "@/server/db/client";
import { inviterFor } from "@/server/services/invites";

/**
 * The front page for anyone who isn't signed in (signed-in visitors never see it, see proxy.ts). Remade 2026-11-09 at the
 * owner's word: the page is one night turning into morning. It opens on the skylings. night (all five, together), meets the
 * cast, shows what a skyling does before you ask, and the sun comes up over the trust and the questions.
 */
export const metadata: Metadata = {
  title: { absolute: "LifeFlow: Your whole life, in flow." },
};

/** Three things a skyling does on a normal week, each said by the one whose gift it is. Every number is an example. */
const MOMENTS: { who: CompanionKey; name: string; tag: string; says: string; used: string[] }[] = [
  {
    who: "star",
    name: "Twinkle",
    tag: "Shift vs exam",
    says: "Your Thursday shift runs until 10, and Bio is Friday at 9. I moved your study block to Wednesday. Okay?",
    used: ["Exam · Fri 9 AM", "Shift · Thu 5 to 10 PM"],
  },
  {
    who: "goldie",
    name: "Goldie",
    tag: "Rent before payday",
    says: "Rent comes out Friday, before your next paycheck, so checking could hit $0. One small move fixes it. Want to see it?",
    used: ["$412 available", "Rent $950 · Fri"],
  },
  {
    who: "ray",
    name: "Ray",
    tag: "Double charge",
    says: "Spotify charged you twice on Monday. I wrote the message to get your $11.99 back. You send it, or you don't.",
    used: ["Spotify × 2 · Monday"],
  },
];

const TRUST = [
  ["Read-only bank connections.", "It can see, never move, your money."],
  ["Locked to your account.", "Nobody else can see your data."],
  ["Never sold,", "and never used to train AI without your clear permission."],
  ["It asks first", "before sending, spending or deleting anything."],
];

const WHY = [
  ["One job", "Your life, connected, and nothing else. Every feature exists to help you run your week."],
  ["Always connected", "Classes, shifts, money, calendar and health at the same time, so it sees how they affect each other."],
  ["Built by someone living it", "Made by a person with your schedule, who keeps asking what you need."],
];

const INSTAGRAM = "https://www.instagram.com/lifeflowweb";

const FAQS: { q: string; a: string }[] = [
  {
    q: "Do I have to connect my bank or school?",
    a: "No. Add everything yourself, or send your skyling a photo of a syllabus, a work schedule or a bank statement and it adds it for you. Connecting is optional.",
  },
  {
    q: "My school doesn't use Canvas. Can I still use it?",
    a: "Yes. Send screenshots of your assignments, upload your syllabus, or tell your skyling your classes.",
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
    q: "Will the skyling do my homework?",
    a: "No. It helps you plan, study and understand, but it never writes or solves graded work for you.",
  },
  {
    q: "What is a skyling, exactly?",
    a: "A little character that lives on top of your day. It reads what your connections show, notices what's about to clash and helps you fix it. It runs on AI, and it always asks before it changes anything.",
  },
  {
    q: "Is there an iPhone app?",
    a: "The App Store app is on the way. Today you can open LifeFlow in Safari and add it to your Home Screen, and it works like an app.",
  },
];

const h2 = "font-display text-[2.375rem] leading-[1.02] font-medium tracking-[-0.035em] text-balance sm:text-[3.5rem]";
const kicker = "text-[0.75rem] font-semibold tracking-[0.14em] uppercase";

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

/** Pixel hills for the sunrise, stepped like the skylings' world. */
function PixelHills({ className, fill }: { className?: string; /** a fill-* class */ fill: string }) {
  const steps = Array.from({ length: 61 }, (_, i) => {
    const x = i * 2;
    const y = Math.round(18 + 7 * Math.sin(i / 6.5) + 3 * Math.sin(i / 2.3 + 1));
    return `${x},${y} ${x + 2},${y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 120 40" preserveAspectRatio="none" shapeRendering="crispEdges" className={className} aria-hidden>
      <polygon points={`0,40 ${steps} 122,40`} className={fill} />
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
    <div className="min-h-dvh overflow-x-clip bg-night-0 text-white">
      {/* ---------- The night: all five skylings, together ---------- */}
      <section className="relative isolate flex flex-col lg:min-h-[max(100svh,720px)]">
        {/* laptop: the whole section is the sky; phone: still stars over the words, the live sky under them */}
        <NightSky stage="hero" className="max-lg:hidden" />
        <div className="lf-stars pointer-events-none absolute inset-0 lg:hidden" aria-hidden />
        <div
          className="pointer-events-none absolute inset-y-0 left-0 hidden w-[62%] bg-gradient-to-r from-night-0/85 via-night-0/45 to-transparent lg:block"
          aria-hidden
        />
        <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <BrandLockup markClassName="h-8 w-8" priority light />
          <nav className="flex items-center gap-1.5" aria-label="Account">
            <a href="#skylings" className="lf-sb-link hidden px-3 text-[0.9375rem] text-white/75 hover:text-white lg:inline-flex">
              Meet the skylings
            </a>
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center rounded-full px-3 text-[0.9375rem] text-white/80 transition-colors hover:text-white"
            >
              Sign in
            </Link>
            <SkyLink href={signupHref} size="sm" chip={false} cheer>
              Get started
            </SkyLink>
          </nav>
        </header>

        <div className="pointer-events-none relative z-10 mx-auto w-full max-w-6xl flex-1 px-5 pt-4 sm:px-8 lg:flex lg:items-center lg:pt-0 lg:pb-24">
          <div className="pointer-events-auto flex flex-col lg:max-w-[33rem]">
            {inviter && (
              <p className="animate-rise mb-5 inline-flex self-start rounded-full bg-white/10 px-4 py-2 text-sm font-medium ring-1 ring-white/20 backdrop-blur">
                {inviter.firstName} invited you to LifeFlow.
              </p>
            )}
            <p className={`animate-rise ${kicker} text-star-gold`}>Your whole life, on one sky</p>
            <h1
              className="animate-rise mt-3 font-display text-[2.5rem] leading-[0.98] font-medium tracking-[-0.045em] text-balance sm:text-[4.25rem] lg:mt-4 lg:text-[4.6rem]"
              style={{ animationDelay: "60ms" }}
            >
              Every app sees one slice. <em className="bg-gradient-to-r from-dawn-cream to-dawn-2 bg-clip-text text-transparent">LifeFlow sees all of it.</em>
            </h1>
            <p
              className="animate-rise mt-5 max-w-[44ch] text-[1.0625rem] leading-relaxed text-white/80 max-lg:order-5 sm:text-[1.125rem]"
              style={{ animationDelay: "120ms" }}
            >
              Your classes, shifts, money and calendar, connected at last. And a little skyling who lives on your sky, spots what&apos;s about to clash and
              fixes it before you feel it.
            </p>
            <div className="animate-rise mt-6 flex flex-wrap items-center gap-3 max-lg:order-3 lg:mt-7" style={{ animationDelay: "180ms" }}>
              <SkyLink href={signupHref} cheer>
                Meet your skyling
              </SkyLink>
              <a href="#moments" className="lf-sb lf-sb-glass max-lg:hidden">
                See what it does
              </a>
            </div>
            {/* phone: the cast's own stretch of live sky, right under the button */}
            <div className="relative -mx-5 mt-6 h-[max(22rem,50svh)] max-lg:order-4 sm:-mx-8 lg:hidden">
              <NightSky stage="full" className="[mask-image:linear-gradient(to_bottom,transparent,black_18%,black_88%,transparent)]" />
              <p
                className="pointer-events-none absolute inset-x-0 bottom-3 text-center font-mono text-[0.6875rem] tracking-[0.2em] text-white/45 uppercase"
                aria-hidden
              >
                ✦ Tap the sky ✦
              </p>
            </div>
            <a href="#moments" className="lf-sb-link mt-4 self-start text-[0.9375rem] text-white/85 max-lg:order-6 lg:hidden">
              See what it does
            </a>
            <ul
              className="animate-rise mt-6 flex flex-wrap gap-x-4 gap-y-1.5 pb-10 text-sm text-white/65 max-lg:order-7 lg:pb-0"
              style={{ animationDelay: "240ms" }}
            >
              {["Set up in two minutes", "Never moves your money", "Made by a student"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 bg-star-gold" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p
          className="pointer-events-none relative z-10 hidden pb-5 text-center font-mono text-[0.6875rem] tracking-[0.2em] text-white/45 uppercase lg:block"
          aria-hidden
        >
          ✦ Tap the sky ✦
        </p>
      </section>

      {/* ---------- Meet the cast ---------- */}
      <section id="skylings" className="relative scroll-mt-4 bg-gradient-to-b from-night-4 via-night-3 to-night-2 px-5 py-20 sm:px-8 lg:py-28">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)] lg:gap-14">
          <div className="lg:sticky lg:top-16 lg:self-start">
            <p className={`${kicker} text-star-gold`}>The skylings</p>
            <h2 className={`mt-3 ${h2}`}>Five little ones. One of them is yours.</h2>
            <p className="mt-5 max-w-[40ch] text-[1.0625rem] leading-relaxed text-white/75">
              Each skyling is named for a moment of the sky and helps in its own way. Pick one, give it a name, and it lives on top of your day: awake with the
              sun, asleep with you.
            </p>
            <div className="mt-7">
              <SkyLink href={signupHref} skyling="dawn" cheer>
                Pick yours
              </SkyLink>
            </div>
          </div>
          <CastCards />
        </div>
      </section>

      {/* ---------- What a skyling does before you ask ---------- */}
      <section id="moments" className="scroll-mt-4 bg-night-2 px-5 py-20 sm:px-8 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <p className={`${kicker} text-night-link`}>What it does before you ask</p>
          <h2 className={`mt-3 max-w-[18ch] ${h2}`}>It notices the problem while there&apos;s still time to fix it.</h2>
          <p className="mt-5 max-w-[52ch] text-[1.0625rem] text-white/75">Three things skylings do on a normal week. Each one shows the numbers it used.</p>
          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {MOMENTS.map((m) => (
              <li key={m.tag} className="flex min-w-0 flex-col rounded-[1.75rem] bg-white/[0.06] p-5 ring-1 ring-white/12 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/[0.07] ring-1 ring-white/10">
                    <CompanionGlyph companion={m.who} night={ownsNight(m.who)} className="lf-pixel h-12 w-12" />
                  </span>
                  <div>
                    <p className="font-display text-[1.1875rem] leading-none font-medium">{m.name}</p>
                    <p className="mt-1 text-[0.6875rem] font-semibold tracking-[0.1em] text-star-gold uppercase">{m.tag}</p>
                  </div>
                </div>
                <p className="relative mt-4 rounded-2xl rounded-tl-md bg-white px-4 py-3.5 text-[1rem] leading-snug text-ink-night">{m.says}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {m.used.map((t) => (
                    <span key={t} className="rounded-full bg-white/10 px-2.5 py-1 text-[0.6875rem] font-medium text-white/85">
                      {t}
                    </span>
                  ))}
                </div>
                <small className="mt-auto pt-4 text-xs text-white/45">Example</small>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- What it connects to ---------- */}
      <div className="bg-night-2 px-5 pb-16 sm:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-4 rounded-[1.75rem] bg-white/[0.04] p-6 ring-1 ring-white/10 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-10">
          <p className="max-w-[22ch] text-sm leading-snug text-white/60">Connects to what you already use</p>
          <ul className="flex flex-wrap items-center gap-x-7 gap-y-3.5 text-[0.9375rem] font-medium text-white/85">
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

      {/* ---------- Sunrise: Ray comes up over the hills ---------- */}
      <div className="lf-sunrise relative h-56 overflow-hidden sm:h-72" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-b from-night-2 via-dawn-glow to-dawn-sand" />
        <div className="lf-sun-up absolute bottom-6 left-1/2 w-28 -translate-x-1/2 sm:w-36">
          <span className="absolute inset-[-60%] rounded-full bg-[radial-gradient(closest-side,rgb(255_236_170_/_0.9),transparent)]" />
          <CompanionGlyph companion="ray" pose="celebrate" frame={2} className="lf-pixel relative h-auto w-full" />
        </div>
        <PixelHills className="absolute inset-x-0 bottom-0 h-20 w-full sm:h-24" fill="fill-morning" />
      </div>

      {/* ---------- Morning: why, trust, questions ---------- */}
      <div className="bg-morning text-ink-night">
        <section id="why" className="scroll-mt-4 px-5 pt-10 pb-16 sm:px-8 lg:pb-24">
          <div className="mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
            <blockquote className="font-display text-[1.875rem] leading-[1.12] font-medium tracking-[-0.03em] text-balance sm:text-[2.625rem]">
              Built by a student solving <em className="text-ember">his own problem</em>, for everyone with a full life.
            </blockquote>
            <div className="space-y-3 text-[1.0625rem] leading-relaxed text-ink-night/75">
              <p>Seven classes. Working 30 hours a week. Side projects. Applications. Nothing connected any of it, so I built the one thing I needed.</p>
              <p>
                It has one job: serve you. It isn&apos;t made for research or websites. It&apos;s made to find the dots across your whole week and help you make
                the most of your time.
              </p>
            </div>
          </div>
          <ul className="mx-auto mt-10 grid max-w-6xl gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map(([b, t]) => (
              <li key={b} className="flex items-start gap-2.5 text-sm leading-snug text-ink-night/75">
                <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md bg-ink-night text-star-gold" aria-hidden>
                  <Check className="h-3 w-3" strokeWidth={3.2} />
                </span>
                <span>
                  <b className="font-semibold text-ink-night">{b}</b> {t}
                </span>
              </li>
            ))}
          </ul>
          <ul className="mx-auto mt-12 grid max-w-6xl gap-7 md:grid-cols-3">
            {WHY.map(([t, b]) => (
              <li key={t} className="border-t-2 border-dawn-3 pt-3.5">
                <h3 className="font-display text-[1.5rem] font-medium tracking-[-0.02em]">{t}</h3>
                <p className="mt-1.5 text-[0.96875rem] text-ink-night/70">{b}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="faq" className="scroll-mt-4 border-t border-ink-night/10 px-5 py-16 sm:px-8 lg:py-24">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div>
              <p className={`${kicker} text-ember`}>Questions</p>
              <h2 className={`mt-3 ${h2}`}>Straight answers.</h2>
              <p className="mt-4 max-w-sm text-[1.0625rem] leading-relaxed text-ink-night/70">
                Something else? Message us on{" "}
                <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" className="font-medium text-morning-link underline underline-offset-4">
                  Instagram @lifeflowweb
                </a>
                .
              </p>
            </div>
            <div className="divide-y divide-ink-night/10 border-y border-ink-night/10">
              {FAQS.map((f) => (
                <details key={f.q} className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-4 text-[1.0625rem] font-medium [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <ChevronDown className="h-5 w-5 shrink-0 text-ink-night/45 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="pb-5 text-[1rem] leading-relaxed text-ink-night/75">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- The last ask: back to the night, where they're waiting ---------- */}
        <section className="px-5 pb-6 sm:px-8">
          <div className="relative isolate mx-auto min-h-[36rem] max-w-6xl overflow-hidden rounded-[2.25rem] text-white lg:min-h-[28rem]">
            <NightSky stage="band" />
            <div className="pointer-events-none relative z-10 p-8 sm:p-14">
              <h2 className="max-w-[14ch] font-display text-[2.5rem] leading-none font-medium tracking-[-0.04em] text-balance sm:text-[3.75rem]">
                They&apos;re ready when you are.
              </h2>
              <p className="mt-4 max-w-[40ch] text-white/80">Two minutes to set up. Add everything yourself, or connect it later.</p>
              <div className="pointer-events-auto mt-7">
                <SkyLink href={signupHref} skyling="goldie" cheer>
                  Get started
                </SkyLink>
              </div>
            </div>
          </div>
          <p className="mx-auto mt-5 max-w-6xl text-xs leading-relaxed text-ink-night/55">
            Canvas is a trademark of Instructure, Inc. Google, Google Calendar and Gmail are trademarks of Google LLC. Microsoft, Outlook and Teams are
            trademarks of the Microsoft group of companies. Apple and Apple Health are trademarks of Apple Inc. Plaid is a trademark of Plaid Inc. LifeFlow
            works with these services and is not endorsed by them.
          </p>
        </section>

        <footer className="border-t border-ink-night/10">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8 text-sm text-ink-night/60 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <BrandLockup markClassName="h-6 w-6" />
            <nav className="flex flex-wrap gap-x-6" aria-label="Footer">
              <a href="#faq" className="inline-flex min-h-11 items-center hover:text-ink-night">
                FAQ
              </a>
              <Link href="/privacy" className="inline-flex min-h-11 items-center hover:text-ink-night">
                Privacy
              </Link>
              <Link href="/terms" className="inline-flex min-h-11 items-center hover:text-ink-night">
                Terms
              </Link>
              <Link href="/integrity" className="inline-flex min-h-11 items-center hover:text-ink-night">
                Academic integrity
              </Link>
              <Link href="/login" className="inline-flex min-h-11 items-center hover:text-ink-night">
                Sign in
              </Link>
            </nav>
            <div className="flex items-center gap-4">
              <a
                href={INSTAGRAM}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LifeFlow on Instagram (@lifeflowweb)"
                className="inline-flex min-h-11 items-center gap-2 hover:text-ink-night"
              >
                <InstagramIcon className="h-5 w-5" />
                @lifeflowweb
              </a>
              <p>© 2026 LifeFlow</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
