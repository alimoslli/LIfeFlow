import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BrandLockup } from "@/components/brand/brand-mark";
import { PixelHills } from "@/components/landing/pixel-hills";
import { CompanionGlyph } from "@/components/sky/companion-glyph";
import { NightSky } from "@/components/skylings/night-sky";
import { SkyLink } from "@/components/skylings/sky-button";

export const metadata: Metadata = {
  title: "About",
  description: "Built by two students, for everyone with a full life.",
};

const PEOPLE = [
  { name: "Ali Moslli", role: "CEO & Developer", photo: "/about/ali-moslli.webp" },
  { name: "Tyler Kardy", role: "CMO", photo: "/about/tyler-kardy.webp" },
];

const h2 = "font-display text-[2.375rem] leading-[1.1] font-medium tracking-[-0.035em] text-balance sm:text-[3.5rem]";

/**
 * About LifeFlow (owner, 2026-11-18: "a simple about for lifeflow and the ppl behind it", then "like the landing page"):
 * the landing page's own story, short. The night with the skylings and why it exists, Ray coming up over the hills, the
 * people in the morning, and back to the night for the last ask. Public, linked from the landing page's footer.
 */
export default function AboutPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-night-0 text-white">
      {/* ---------- The night: why it exists ---------- */}
      <section className="relative isolate">
        {/* a phone keeps only still stars behind the words, so nothing crosses them (the landing page does the same) */}
        <NightSky stage="band" className="[mask-image:linear-gradient(to_bottom,black_55%,transparent)] max-md:hidden" />
        <div className="lf-stars pointer-events-none absolute inset-0 md:hidden" aria-hidden />
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-full bg-gradient-to-r from-night-0/90 via-night-0/55 to-transparent lg:w-[70%]"
          aria-hidden
        />
        <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" aria-label="LifeFlow home">
            <BrandLockup markClassName="h-8 w-8" priority light />
          </Link>
          <nav className="flex items-center gap-1.5" aria-label="Account">
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center rounded-full px-3 text-[0.9375rem] text-white/80 transition-colors hover:text-white"
            >
              Sign in
            </Link>
            <SkyLink href="/signup" size="sm" chip={false} cheer>
              Get started
            </SkyLink>
          </nav>
        </header>

        <div className="pointer-events-none relative z-10 mx-auto max-w-6xl px-5 pt-10 pb-24 sm:px-8 sm:pt-16 lg:pt-24 lg:pb-36">
          <div className="max-w-[36rem]">
            <h1 className="animate-rise font-display text-[2.75rem] leading-[1.1] font-medium tracking-[-0.045em] text-balance sm:text-[4.25rem]">
              Seven classes. Thirty hours of work.{" "}
              <em className="lf-clip-text bg-gradient-to-r from-dawn-cream to-dawn-2 bg-clip-text text-transparent">Nothing connected it.</em>
            </h1>
            <p className="animate-rise mt-6 max-w-[46ch] text-[1.0625rem] leading-relaxed text-white/80 sm:text-[1.1875rem]" style={{ animationDelay: "80ms" }}>
              LifeFlow is built by two students. It started with Ali: seven classes a semester, 30 hours a week at a retail job, and side projects and transfer
              applications at the same time. Every app saw one slice of it, and none of them talked to each other.
            </p>
            <p
              className="animate-rise mt-4 max-w-[46ch] text-[1.0625rem] leading-relaxed text-white/80 sm:text-[1.1875rem]"
              style={{ animationDelay: "140ms" }}
            >
              So he built the one thing he needed. Now Ali and Tyler are building it for everyone with a full life, from what the people using it ask for.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Sunrise: Ray comes up over the hills ---------- */}
      <div className="lf-sunrise relative h-48 overflow-hidden sm:h-64" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-b from-night-0 via-dawn-glow to-dawn-sand" />
        <div className="lf-sun-up absolute bottom-6 left-1/2 w-24 -translate-x-1/2 sm:w-32">
          <span className="absolute inset-[-60%] rounded-full bg-[radial-gradient(closest-side,rgb(255_236_170_/_0.9),transparent)]" />
          <CompanionGlyph companion="ray" pose="celebrate" frame={2} className="lf-pixel relative h-auto w-full" />
        </div>
        <PixelHills className="absolute inset-x-0 bottom-0 h-20 w-full sm:h-24" fill="fill-morning" />
      </div>

      {/* ---------- Morning: the people ---------- */}
      <div className="bg-morning text-ink-night">
        <section aria-labelledby="people" className="px-5 pt-8 pb-20 sm:px-8 lg:pb-28">
          <div className="mx-auto max-w-4xl">
            <h2 id="people" className={`text-center ${h2}`}>
              The people behind it.
            </h2>
            <ul className="mt-12 grid gap-6 sm:grid-cols-2 sm:gap-8">
              {PEOPLE.map((p, i) => (
                <li key={p.name} className="animate-rise" style={{ animationDelay: `${i * 90}ms` }}>
                  <figure className="overflow-hidden rounded-[2rem] bg-white shadow-[0_24px_60px_-28px_rgb(16_32_64/0.45)] ring-1 ring-ink-night/5">
                    <Image
                      src={p.photo}
                      alt={`${p.name}, ${p.role}`}
                      width={720}
                      height={900}
                      sizes="(min-width: 640px) 26rem, 100vw"
                      className="aspect-[4/5] w-full object-cover"
                    />
                    <figcaption className="px-6 py-5">
                      <p className="font-display text-[1.75rem] leading-[1.15] font-medium tracking-[-0.02em]">{p.name}</p>
                      <p className="mt-1.5 text-[0.75rem] font-semibold tracking-[0.12em] text-ember uppercase">{p.role}</p>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- The last ask: back to the night ---------- */}
        <section className="px-5 pb-6 sm:px-8">
          <div className="relative isolate mx-auto min-h-[26rem] max-w-6xl overflow-hidden rounded-[2.25rem] text-white">
            <NightSky stage="band" />
            <div className="pointer-events-none relative z-10 p-8 sm:p-14">
              <h2 className="max-w-[14ch] font-display text-[2.5rem] leading-[1.1] font-medium tracking-[-0.04em] text-balance sm:text-[3.5rem]">
                Come see your sky.
              </h2>
              <p className="mt-4 max-w-[40ch] text-white/80">Set up in minutes. Add everything yourself, or connect it later.</p>
              <div className="pointer-events-auto mt-7">
                <SkyLink href="/signup" skyling="goldie" cheer>
                  Get started
                </SkyLink>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-ink-night/10">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8 text-sm text-ink-night/75 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <BrandLockup markClassName="h-6 w-6" />
            <nav className="flex flex-wrap gap-x-6" aria-label="Footer">
              <Link href="/" className="inline-flex min-h-11 items-center hover:text-ink-night">
                Home
              </Link>
              <Link href="/privacy" className="inline-flex min-h-11 items-center hover:text-ink-night">
                Privacy
              </Link>
              <Link href="/terms" className="inline-flex min-h-11 items-center hover:text-ink-night">
                Terms
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}
