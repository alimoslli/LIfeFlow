import Link from "next/link";
import { ClaimStars } from "./_today/claim-stars";
import { cookies } from "next/headers";
import { TODAY_COOKIE, parseTodayMode } from "@/lib/theme";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { DayClock } from "@/components/day-clock/day-clock";
import { assistantProfile } from "@/lib/assistant";
import { greetingIn } from "@/lib/dates";
import { lifeAreas } from "@/lib/life";
import { requireUser, withCurrentUser } from "@/server/auth/current-user";
import { moneyLocked } from "@/server/auth/money-lock";
import { withUser } from "@/server/db/with-user";
import { series } from "@/server/db/series";
import { runDueSlot, runProactive } from "@/server/services/proactive/engine";
import { getBriefing } from "@/server/briefing";
import { googleConfig } from "@/server/integrations/google";
import { listPlaidConnections, plaidConfig } from "@/server/integrations/plaid";
import { integrationStatus } from "@/server/services/integrations";
import { dayClockData } from "@/server/services/day-clock";
import { AskBar } from "./_today/day-plan";
import { AssistantLine, type AssistantNote } from "./_today/assistant-line";
import { BirthdayCard } from "./_today/birthday-card";
import { EmptyNext } from "./_today/empty-next";
import { ideaClouds } from "@/server/services/idea-clouds";

/**
 * Today (v3): your time as a clock that opens into the timeline of your week (docs/design/clock/spec.md),
 * and under it the one thing your skyling noticed, plus a way to ask. Everything else lives one tab away.
 */
export default async function TodayPage() {
  const me = await requireUser();
  // With the Face ID lock on, nothing about money is said here until Money is unlocked.
  const locked = await moneyLocked(me);
  // The skyling takes its scheduled look (morning, midday, evening) the first time Today opens in each. Its own
  // transaction, so a failure can't break Today.
  if (me.accountKind !== "demo")
    await withUser(me.id, (scope) => runDueSlot(scope, me.timezone, me.preferences)).catch((e) =>
      console.error("proactive slot failed", e instanceof Error ? e.name : e),
    );
  // Promises whose time has come get their one "Did you?" as soon as the app opens (the 30-minute cron does it when it's closed).
  if (me.accountKind !== "demo")
    await withUser(me.id, (scope) => runProactive({ scope, tz: me.timezone, prefs: me.preferences, trigger: "promise" })).catch((e) =>
      console.error("promise check failed", e instanceof Error ? e.name : e),
    );
  const work = lifeAreas(me.preferences?.lifeStage).work;
  // Calendar, to-dos, goals and milestones are all on the timeline now (owner, 2026-11-08); what stays one tap away
  // is what isn't a thing in time.
  const more = [{ href: "/habits", label: "Health", icon: "health" as const }, ...(work ? [{ href: "/work", label: "Work", icon: "shift" as const }] : [])];
  const { clock, note, assistantName, setup, hello, clouds } = await withCurrentUser(async (scope, user) => {
    const tz = user.timezone ?? "UTC";
    // Money (bills due, spent today) joins the clock only while the Money lock is open.
    const clock = await dayClockData(scope, tz, new Date(), { money: !locked });
    const { briefing } = await getBriefing(scope, user);
    const [integrationList, banks] = await series(
      () => integrationStatus(scope),
      () => listPlaidConnections(scope),
    );
    const setup = [
      googleConfig() && !integrationList.find((i) => i.provider === "google")?.connections.length ? "your calendar" : null,
      plaidConfig() && !banks.length ? "your bank" : null,
    ].filter((x): x is string => !!x);
    // The one thing worth saying: something that needs attention first, then a heads-up. Money stays quiet while locked.
    const insights = briefing.insights.filter((i) => !locked || (i.icon !== "money" && i.icon !== "trend" && i.icon !== "goal"));
    // Late to-dos come last: the timeline and To-dos already carry them; a money or schedule warning comes first.
    const ranked = [...insights.filter((i) => i.id !== "overdue"), ...insights.filter((i) => i.id === "overdue")];
    const top = ranked.find((i) => i.tone === "attention") ?? ranked.find((i) => i.tone === "heads-up") ?? null;
    const note: AssistantNote | null = top
      ? { text: top.text, tone: top.tone, href: top.action?.href, prompt: top.action?.prompt, label: top.action?.label }
      : null;
    return {
      clock,
      note,
      assistantName: assistantProfile(user.preferences, user.timezone).name,
      // idea clouds beside the chat bar, from their own data (lib/idea-clouds)
      clouds: await ideaClouds(scope, tz, user.preferences, assistantProfile(user.preferences, user.timezone).name),
      setup,
      hello: `${greetingIn(tz)}, ${user.name.split(" ")[0]}`,
    };
  });

  const mode = parseTodayMode((await cookies()).get(TODAY_COOKIE)?.value);
  return (
    <div className="dc-today flex flex-col gap-5">
      {/* The clock is the page; the greeting is for screen readers. */}
      <h1 className="sr-only">{hello}</h1>
      {/* what the skyling passed while they were away: a star each, claimed once (owner, 2026-11-10) */}
      <ClaimStars />
      <section aria-label="Your day" data-tour="today-page" className="-mx-5 sm:-mx-8 md:mx-0">
        <DayClock data={clock} mode={mode} companion={me.preferences?.companion}>
          {/* accounts made before the birthday was required are asked once, first (owner, 2026-11-10; not a lockout) */}
          {!me.preferences?.birthDate && <BirthdayCard />}
          {me.preferences?.birthDate && note && <AssistantLine name={assistantName} note={note} />}
          {/* nothing planned yet: one next step, on the first screen (connect what can be connected, else tell the skyling) */}
          {me.preferences?.birthDate &&
            !note &&
            clock.empty &&
            (setup.length > 0 ? (
              <Link href="/settings/integrations" className="flex min-h-16 items-center gap-3 rounded-3xl bg-surface px-5 py-3 shadow-soft">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <PixelIcon name="plug" className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-medium">Fill your clock</span>
                  <span className="block text-sm text-muted">Connect {setup.join(" and ")}, and your classes, shifts and plans appear on it.</span>
                </span>
                <PixelIcon name="arrow" className="h-4 w-4 shrink-0 text-muted" />
              </Link>
            ) : (
              <EmptyNext name={assistantName} />
            ))}
          {/* a laptop's full sky has the ask bar beside the wheel, under the skyling's line (CSS shows one of the two) */}
          {mode === "full" && (
            <div className="dc-ask">
              <AskBar name={assistantName} chips={false} clouds={clouds} />
            </div>
          )}
        </DayClock>
      </section>
      {/* a phone: the chat bar docked at the bottom of Today, just above the tabs, with the skyling in it (owner,
          2026-11-09: "the skyling chat bar at the bottom of the main page ... with the character there") */}
      <div className="dc-dock md:hidden">
        <AskBar name={assistantName} chips={false} clouds={clouds} />
      </div>
      {/* on a phone this starts below the docked chat bar and the tabs, so nothing peeks out behind them (audit B16) */}
      <div className="dc-after-dock mx-auto flex w-full max-w-[640px] flex-col gap-4 max-md:mt-[calc(var(--tabbar-space)+7.5rem)]">
        <div className={mode === "full" ? "dc-ask-below max-md:hidden" : "max-md:hidden"}>
          <AskBar name={assistantName} chips={false} clouds={clouds} />
        </div>
        {/* The rest of the day, one tap away, below the fold so the clock stays the whole first screen. */}
        <nav aria-label="More of your day" className="flex flex-wrap justify-center gap-2 pt-1">
          {more.map(({ href, label, icon }) => (
            <Link key={href} href={href} className="lf-sb lf-sb-app lf-sb-sm">
              <PixelIcon name={icon} className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
