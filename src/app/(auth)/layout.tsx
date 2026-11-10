import Link from "next/link";
import { BrandLockup } from "@/components/brand/brand-mark";
import { NightSky } from "@/components/skylings/night-sky";

/**
 * Sign-up, sign-in and password pages (remade 2026-11-09 with the landing): the skylings' night beside the form on a
 * laptop, above it on a phone, where the form rises over the sky like the morning.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    // on a phone the sky's row is just the sky and the sheet takes the rest: with stretched rows a short page (a bad reset
    // link) left a gap, and the sheet's rounded top no longer rose over the sky
    <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-bg lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:grid-rows-none">
      {/* phone: a stretch of the night with the cast, the form rising over it */}
      <div className="relative isolate h-[clamp(17rem,42svh,24rem)] overflow-hidden bg-night-ground lg:hidden">
        {/* the sky ends where the form's sheet begins, so nobody walks behind it */}
        <div className="absolute inset-x-0 top-0 bottom-8">
          <NightSky stage="strip" />
        </div>
        <Link href="/" className="absolute top-4 left-5 z-10 rounded-full" aria-label="LifeFlow home">
          <BrandLockup markClassName="h-8 w-8" priority light />
        </Link>
      </div>

      <div className="relative z-10 -mt-8 flex flex-col rounded-t-[2rem] bg-bg px-6 pt-8 pb-8 sm:px-10 lg:mt-0 lg:rounded-none lg:pt-10">
        <Link href="/" className="hidden self-start rounded-full lg:inline-flex" aria-label="LifeFlow home">
          <BrandLockup markClassName="h-10 w-10" priority />
        </Link>
        <div className="flex flex-1 items-center">
          <div className="animate-rise mx-auto w-full max-w-sm py-4 lg:py-10">{children}</div>
        </div>
        <p className="text-center text-xs text-muted">
          Your data stays private to your account. ·{" "}
          <Link href="/privacy" className="hover:text-text">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="hover:text-text">
            Terms
          </Link>
        </p>
      </div>

      {/* laptop: the whole night beside the form */}
      <aside className="relative isolate hidden overflow-hidden lg:block" aria-hidden>
        <NightSky stage="aside" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-12">
          <p className="text-[0.75rem] font-semibold tracking-[0.14em] text-star-gold uppercase">The skylings</p>
          <p className="mt-3 max-w-[18ch] font-display text-[2.75rem] leading-[1.02] font-medium tracking-[-0.035em] text-balance text-white">
            Six little ones, keeping your sky in order.
          </p>
          <p className="mt-4 max-w-[38ch] text-[1.0625rem] leading-relaxed text-white/75">Tap the sky. They like visitors.</p>
        </div>
      </aside>
    </div>
  );
}
