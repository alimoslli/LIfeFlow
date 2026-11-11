import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLockup } from "@/components/brand/brand-mark";
import { SignOutButton } from "@/components/pwa/sign-out-button";
import { CompanionGlyph } from "@/components/sky/companion-glyph";
import { COMPANION_KEYS, companionOf, ownsNight } from "@/lib/companions";
import { isAdminEmail } from "@/server/auth/admin";
import { getAccountUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { inviteCodeFor } from "@/server/services/invites";
import { canUseApp, waitlistPage } from "@/server/services/waitlist";
import { ConfirmEmail } from "./confirm-email";
import { InviteShare } from "../../(app)/settings/invite/invite-share";
import "./waitlist.css";

export const metadata: Metadata = { title: "Your place in line" };

const DEFAULT_LAUNCH = "We're aiming for the App Store in January 2027. That date may still move.";
const kicker = "text-[0.75rem] font-semibold tracking-[0.14em] uppercase";
const glass = "relative overflow-hidden rounded-[1.75rem] bg-white/[0.06] p-5 ring-1 ring-white/12 backdrop-blur-md sm:p-6";
const h2 = "font-display text-[1.75rem] leading-[1.05] font-medium tracking-[-0.03em]";

/**
 * The waitlist page (owner, 2026-11-11; docs/backlog/2026-11-11-audit-and-waitlist.md), on the skylings' night like the
 * landing page: your real place, a little line of skylings walking to the gate with yours in it, your invite link, the
 * front of the line (anonymous) and the rules in plain words. Admins can open `?preview=1` to see what someone waiting
 * sees; there, their own place is marked as an example.
 */
export default async function WaitlistPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const user = await getAccountUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const db = getDb();
  const w = await waitlistPage(db, user.id);
  const admin = isAdminEmail(user.email);
  const preview = admin && sp.preview === "1";
  const firstName = user.name.split(" ")[0];
  // While the switch is off everyone can use the app, so the line shows only in the owner's preview.
  // Someone let in before confirming their email still sees the card, or their friend's invite would never count.
  if (!preview && canUseApp(user, w.waitlistOn)) {
    const confirm = !w.emailVerified && <ConfirmEmail invited={w.invited} className={`${glass} wl-ticket`} />;
    return <YoureIn name={firstName} admin={admin} confirm={confirm} />;
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
  // Production always uses the site's own address (APP_URL), never whatever host a request names.
  const origin = process.env.APP_URL?.trim().replace(/\/$/, "") || (process.env.VERCEL_ENV === "production" ? "https://lifeflowweb.com" : `${proto}://${host}`);
  const link = `${origin}/?invite=${await inviteCodeFor(db, user.id)}`;
  // In the owner's preview the counts are real; only the admin's own place is an example (they hold none), shown as the last place.
  const place = w.place ?? (preview ? Math.max(w.waiting, 1) : null);
  const waiting = w.waiting;
  const mine = companionOf(user.preferences?.companion);
  const meInFront = w.front.some((r) => r.me);

  return (
    <div className="min-h-dvh overflow-x-clip bg-night-0 text-white">
      <section className="relative isolate">
        <div className="lf-stars pointer-events-none absolute inset-0" aria-hidden />
        <div className="wl-glow pointer-events-none absolute inset-x-0 top-[14rem] h-[22rem]" aria-hidden />
        <header className="relative z-10 mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-5">
          <BrandLockup markClassName="h-8 w-8" light priority />
          <SignOutButton className="lf-sb lf-sb-glass lf-sb-sm" />
        </header>

        <div className="relative z-10 mx-auto w-full max-w-2xl px-5 pt-4">
          {preview && (
            <p role="status" className="mb-5 rounded-2xl bg-white/10 px-4 py-3 text-sm text-white/85 ring-1 ring-white/15">
              Preview: this is what someone waiting sees. Your place here is an example; the other numbers are real.
            </p>
          )}
          <p className={`animate-rise ${kicker} text-star-gold`}>You&apos;re on the list</p>
          <h1 className="animate-rise mt-3 font-display text-[2.75rem] leading-[0.98] font-medium tracking-[-0.045em] text-balance sm:text-[4rem]">
            {place ? (
              <>
                You&apos;re{" "}
                <em className="bg-gradient-to-r from-dawn-cream to-dawn-2 bg-clip-text text-transparent" data-testid="wl-place">
                  #{place}
                </em>{" "}
                in line.
              </>
            ) : (
              <>You&apos;re in line.</>
            )}
          </h1>
          <p className="animate-rise mt-4 max-w-[40ch] text-[1.0625rem] leading-relaxed text-white/80" style={{ animationDelay: "80ms" }}>
            {waiting === 1 ? "1 person is waiting" : `${waiting} people are waiting`}. We&apos;re letting people in a few at a time while we finish your sky.
          </p>
        </div>

        <Queue place={place} waiting={waiting} mine={mine.key} name={mine.name} />
      </section>

      <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-4 px-5 pt-6 pb-16">
        {!w.emailVerified && !preview && <ConfirmEmail invited={w.invited} className={`${glass} wl-ticket`} />}

        <section className={glass} aria-labelledby="wl-front">
          <h2 id="wl-front" className={h2}>
            The front of the line
          </h2>
          <p className="mt-1 text-sm text-white/65">Names stay private. Everyone waits under a skyling name.</p>
          {w.front.length === 0 ? (
            <p className="mt-4 text-sm text-white/60">Nobody is waiting yet.</p>
          ) : (
            <ol role="list" className="mt-4 flex flex-col gap-1">
              {w.front.map((r) => (
                <li
                  key={r.place}
                  className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 text-[0.9375rem] ${r.me ? "bg-star-gold/15 ring-1 ring-star-gold/50" : ""}`}
                >
                  <span className="tabular w-8 shrink-0 text-white/55">#{r.place}</span>
                  <CompanionGlyph
                    companion={r.me ? mine.key : r.companion}
                    night={ownsNight(r.me ? mine.key : r.companion)}
                    className="lf-pixel h-8 w-8 shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  {r.me && <span className={`${kicker} text-star-gold`}>You</span>}
                </li>
              ))}
            </ol>
          )}
          {!meInFront && place && (
            <>
              <p className="mt-3 text-center text-white/35" aria-hidden>
                · · ·
              </p>
              <p className="mt-1 flex min-h-12 items-center gap-3 rounded-2xl bg-star-gold/15 px-3 text-[0.9375rem] ring-1 ring-star-gold/50">
                <span className="tabular w-8 shrink-0 text-white/70">#{place}</span>
                <CompanionGlyph companion={mine.key} night={ownsNight(mine.key)} className="lf-pixel h-8 w-8 shrink-0" />
                <span className="min-w-0 flex-1">You{preview ? " (example)" : ""}</span>
              </p>
            </>
          )}
        </section>

        <section className={glass} aria-labelledby="wl-how">
          <h2 id="wl-how" className={h2}>
            How the line works
          </h2>
          <ol role="list" className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { who: "dawn", title: "Your spot", text: "Your place starts from when you signed up." },
              {
                who: "ray",
                title: "Friends move you",
                text: "Each friend who confirms their email puts you ahead of the person just above. A friend counts once, and first place stays first.",
              },
              { who: "moon", title: "A few at a time", text: "We let people in in small groups. Other people's friends and each group can change your place." },
            ].map((s, i) => (
              <li key={s.title} className="flex gap-3 rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10 sm:flex-col">
                <CompanionGlyph companion={s.who} night={ownsNight(s.who)} className="lf-pixel h-10 w-10 shrink-0" />
                <div>
                  <p className="font-medium">
                    <span className="tabular text-star-gold">{i + 1}.</span> {s.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-white/70">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[0.9375rem] text-white/80">When it&apos;s your turn, you get the whole app. A free trial and a student offer are planned.</p>
        </section>

        <section className={`${glass} wl-ticket`} aria-labelledby="wl-move">
          <p className={`${kicker} text-star-gold`}>Skip ahead</p>
          <h2 id="wl-move" className={`${h2} mt-2`}>
            Bring a friend, move up a spot.
          </h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-white/75">
            Each friend who joins with your link and confirms their email moves you ahead one place.
          </p>
          <InviteShare link={link} firstName={firstName} dark />
          <ul role="list" className="mt-4 flex flex-col gap-1 text-sm text-white/70">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 bg-star-gold" aria-hidden />
              Friends counted:{" "}
              <span className="tabular font-medium text-white" data-testid="wl-friends">
                {w.friends}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 bg-white/40" aria-hidden />
              Waiting to confirm their email:{" "}
              <span className="tabular font-medium text-white" data-testid="wl-pending">
                {w.pending}
              </span>
            </li>
          </ul>
        </section>

        <p className={`${kicker} mt-2 text-center leading-relaxed text-star-gold/90`}>{w.launchNote ?? DEFAULT_LAUNCH}</p>

        <nav className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm" aria-label="Your account">
          {[
            ["/settings/profile", "Account"],
            ["/settings/security", "Security"],
            ["/settings/data", "Privacy and your data"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="inline-flex min-h-11 items-center text-white/60 underline-offset-4 hover:text-white hover:underline">
              {label}
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}

/**
 * The line as a little scene: skylings walking toward a glowing gate, yours with a gold "You" pin. Only as many as are
 * really ahead of and behind you (at most four and three). Decorative; the heading says the place in words.
 */
function Queue({ place, waiting, mine, name }: { place: number | null; waiting: number; mine: string; name: string }) {
  const ahead = place ? Math.min(place - 1, 4) : 0;
  const behind = place ? Math.min(Math.max(waiting - place, 0), 3) : 0;
  const others = COMPANION_KEYS.filter((k) => k !== mine);
  const pick = (i: number) => others[i % others.length];
  return (
    <div className="relative z-10 mx-auto mt-6 w-full max-w-2xl px-5" aria-hidden>
      <div className="wl-scene relative h-44 overflow-hidden rounded-[2rem] ring-1 ring-white/10">
        <div className="lf-stars absolute inset-0 opacity-60" />
        <div className="wl-gate absolute right-4 bottom-9">
          <span className="wl-gate-sign font-mono text-[0.625rem] tracking-[0.18em] uppercase">Opening soon</span>
          <span className="wl-gate-arch" />
        </div>
        <div className="wl-bridge absolute inset-x-0 bottom-0 h-9" />
        <ul className="absolute right-28 bottom-8 left-3 flex flex-row-reverse items-end justify-start gap-1.5 sm:right-32 sm:gap-3">
          {Array.from({ length: ahead }, (_, i) => (
            <li key={`a${i}`} className="wl-walker" style={{ animationDelay: `${i * 0.35}s` }}>
              <CompanionGlyph companion={pick(i)} night={ownsNight(pick(i))} className="lf-pixel h-9 w-9 opacity-75 sm:h-11 sm:w-11" />
            </li>
          ))}
          {place && (
            <li className="wl-walker wl-me relative" style={{ animationDelay: "0.2s" }}>
              <span className="wl-pin absolute -top-6 left-1/2 -translate-x-1/2 rounded-full bg-star-gold px-2 py-0.5 text-[0.625rem] font-bold tracking-[0.12em] text-night-0 uppercase">
                You
              </span>
              <CompanionGlyph companion={mine} night={ownsNight(mine)} className="lf-pixel h-12 w-12 sm:h-14 sm:w-14" />
            </li>
          )}
          {Array.from({ length: behind }, (_, i) => (
            <li key={`b${i}`} className="wl-walker" style={{ animationDelay: `${0.5 + i * 0.3}s` }}>
              <CompanionGlyph companion={pick(i + 2)} night={ownsNight(pick(i + 2))} className="lf-pixel h-8 w-8 opacity-45 sm:h-10 sm:w-10" />
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-2 text-center text-xs text-white/55">{name} is holding your spot.</p>
    </div>
  );
}

function YoureIn({ name, admin, confirm }: { name: string; admin: boolean; confirm: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-night-0 text-white">
      <div className="lf-stars pointer-events-none fixed inset-0" aria-hidden />
      <main className="relative mx-auto flex w-full max-w-xl flex-col gap-4 px-5 pt-16 pb-16">
        <p className={`${kicker} text-star-gold`}>No line for you</p>
        <h1 className="font-display text-[2.5rem] leading-none font-medium tracking-[-0.04em]">You&apos;re in, {name}</h1>
        <p className="text-[1.0625rem] text-white/80">You don&apos;t need to wait. Your sky is ready.</p>
        {confirm}
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href="/" className="lf-sb lf-sb-sun lf-sb-sm">
            Open my day
          </Link>
          {admin && (
            <Link href="/waitlist?preview=1" className="lf-sb lf-sb-glass lf-sb-sm">
              See what people waiting see
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
