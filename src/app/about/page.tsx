import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BrandLockup } from "@/components/brand/brand-mark";
import { CloseButton } from "@/app/(legal)/close-button";

export const metadata: Metadata = {
  title: "About",
  description: "What LifeFlow is and the people behind it.",
};

const PEOPLE = [
  { name: "Ali Moslli", role: "CEO & Developer", photo: "/about/ali-moslli.webp" },
  { name: "Tyler Kardy", role: "CMO", photo: "/about/tyler-kardy.webp" },
];

/** One section of the page: a bar with its name, then what it says (owner, 2026-11-18: laid out like the first about page). */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`about-${title}`} className="overflow-hidden rounded-3xl bg-surface shadow-soft">
      <h2 id={`about-${title}`} className="bg-hero px-5 py-2.5 text-[0.9375rem] font-semibold text-hero-text">
        {title}
      </h2>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

/**
 * About LifeFlow (owner, 2026-11-18: "a simple about for lifeflow and the ppl behind it"): the project in two lines and
 * the people with their roles, in the app's look. Public, linked from the landing page's footer.
 */
export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-20 sm:px-10">
      <header className="mb-10 flex items-center justify-between gap-4">
        <Link href="/">
          <BrandLockup markClassName="h-9 w-9" />
        </Link>
        <CloseButton />
      </header>

      <h1 className="mb-8 text-center font-display text-[2rem] leading-[1.15] font-medium tracking-tight sm:text-[2.5rem]">
        <span className="text-muted">[</span> About LifeFlow <span className="text-muted">]</span>
      </h1>

      <div className="flex flex-col gap-5">
        <Section title="The Project">
          <p className="text-[1.0625rem] leading-relaxed">
            LifeFlow puts your classes, work, money and plans on one sky, so the small decisions are easy before they happen.
          </p>
          <p className="mt-3 text-[1.0625rem] leading-relaxed text-muted">
            It started in 2026 with two students who kept losing track of classes, shifts and money across five different apps.
          </p>
        </Section>

        <Section title="The People">
          <ul className="lf-rows flex flex-col gap-2">
            {PEOPLE.map((p) => (
              <li key={p.name} className="flex items-center gap-4 rounded-2xl py-2">
                <Image src={p.photo} alt={p.name} width={160} height={160} className="h-20 w-20 shrink-0 rounded-2xl object-cover" />
                <div className="min-w-0">
                  <p className="text-[1.0625rem] font-semibold text-accent">{p.name}</p>
                  <p className="text-[0.9375rem] text-muted">{p.role}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <footer className="mt-10 flex flex-col items-center gap-3 text-sm text-muted">
        <nav className="flex flex-wrap justify-center gap-x-5" aria-label="About">
          <Link href="/" className="inline-flex min-h-11 items-center hover:text-text">
            Home
          </Link>
          <Link href="/privacy" className="inline-flex min-h-11 items-center hover:text-text">
            Privacy
          </Link>
          <Link href="/terms" className="inline-flex min-h-11 items-center hover:text-text">
            Terms
          </Link>
        </nav>
        <p>A Moslli production · LifeFlow © 2026</p>
      </footer>
    </div>
  );
}
