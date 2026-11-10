import { NightSky } from "@/components/skylings/night-sky";
import { AGE_LINE } from "@/lib/birthday";
import { logout } from "@/app/(auth)/actions";

/**
 * Under 13 (owner, 2026-11-10): the welcome stays locked for this account. One calm line, nothing to retry, nothing
 * else kept about them; signing out is the only way on.
 */
export function AgeBlocked() {
  return (
    <div className="min-h-dvh bg-bg">
      <div className="relative isolate h-[clamp(12rem,30svh,19rem)] overflow-hidden bg-night-ground">
        <div className="absolute inset-x-0 top-0 bottom-8">
          <NightSky stage="strip" />
        </div>
      </div>
      <div className="relative z-10 mx-auto -mt-8 flex w-full max-w-xl flex-col gap-5 rounded-t-[2rem] bg-bg px-6 pt-8 pb-10 md:rounded-[2rem] md:shadow-lift">
        <h1 className="font-display text-[2.125rem] leading-tight font-medium tracking-tight">{AGE_LINE}</h1>
        <p className="text-[0.9375rem] leading-relaxed text-text-2">Thanks for stopping by. We haven&apos;t kept your birthday or anything you typed.</p>
        <form action={logout}>
          <button type="submit" className="lf-sb lf-sb-glass lf-sb-day w-full">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
