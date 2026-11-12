import { after } from "next/server";
import Link from "next/link";
import { ClaimStars } from "./_today/claim-stars";
import { cookies } from "next/headers";
import { TODAY_COOKIE, parseTodayMode } from "@/lib/theme";
import { aiAllowed } from "@/lib/ai-consent";
import { isCompanionChoice } from "@/lib/companions";
import { inAppSetup, SETUP_COOKIE } from "@/lib/setup-mode";
import { canvasConnection } from "@/server/integrations/canvas";
import { microsoftConfig } from "@/server/integrations/microsoft";
import { firstConnection } from "@/server/services/setup-first";
import { SetupToday } from "./_today/setup-today";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { DayClock } from "@/components/day-clock/day-clock";
import { assistantProfile } from "@/lib/assistant";
import { greetingIn } from "@/lib/dates";
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
import { TodayClouds, TodayMiddle, TodayOwner } from "./_today/today-chat";
import { BirthdayCard } from "./_today/birthday-card";
import { EmptyNext } from "./_today/empty-next";
import { ideaClouds } from "@/server/services/idea-clouds";
import { skyInsights } from "@/server/services/sky-insights";
import { getMessage } from "@/server/services/proactive/engine";
import { toCard } from "@/server/services/proactive/present";

/**
 * Today (v3): your time as a clock that opens into the timeline of your week (docs/design/clock/spec.md),
 * and under it the one thing your skyling noticed, plus a way to ask. Everything else lives one tab away.
 */
const BACK_RESULTS = ["connected", "denied", "failed", "missing_scopes", "admin_consent", "not_configured", "use_main_site"];

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ connected?: string; result?: string }> }) {
  const me = await requireUser();
  // A new account sets up right here (owner, 2026-11-12): the same sky, wheel and chat bar, with the skyling guiding it. No money
  // on the sky yet, and none of the day's looks run until setup is done.
  if (me.preferences?.onboarding === "pending" && inAppSetup((await cookies()).get(SETUP_COOKIE)?.value)) {
    const { connected, result } = await searchParams;
    const p = me.preferences ?? {};
    const data = await withCurrentUser(async (scope, user) => {
      const [clock, list, canvas, first] = await series(
        () => dayClockData(scope, user.timezone || "UTC", new Date(), { money: false }),
        () => integrationStatus(scope),
        () => canvasConnection(scope),
        () => firstConnection(scope),
      );
      return { clock, list, canvas, first };
    });
    const on = (provider: string) => (data.list.find((i) => i.provider === provider)?.status ?? "not_connected") !== "not_connected";
    return (
      <SetupToday
        clock={data.clock}
        mode={parseTodayMode((await cookies()).get(TODAY_COOKIE)?.value)}
        userId={me.id}
        aiOk={aiAllowed(me.preferences)}
        saved={{
          companion: isCompanionChoice(p.companion) ? p.companion : null,
          name: p.assistantName ?? "",
          style: p.assistantStyle === "coach" || p.assistantStyle === "direct" ? p.assistantStyle : "friend",
          lifeStage: p.lifeStage ?? null,
          birthDate: p.birthDate ?? "",
          yourName: me.name.split(" ")[0] === "there" ? "" : me.name.split(" ")[0],
        }}
        sources={{
          google: { available: !!googleConfig(), connected: on("google") },
          outlook: { available: !!microsoftConfig(), connected: on("outlook") },
          canvas: { available: true, connected: !!data.canvas },
          bank: { available: !!plaidConfig(), connected: on("plaid") },
          first: data.first,
        }}
        back={(connected === "google" || connected === "outlook") && BACK_RESULTS.includes(result ?? "") ? { provider: connected, result: result! } : null}
      />
    );
  }
  // With the Face ID lock on, nothing about money is said here until Money is unlocked.
  const locked = await moneyLocked(me);
  // The skyling takes its scheduled look (morning, midday, evening) the first time Today opens in each. It runs right
  // after the page is sent, never before it: the morning look can read Gmail and check prices, which took Today ~15 s to
  // appear (owner, 2026-11-11). What it finds shows on the next look; the 10-minute cron runs the same slots anyway.
  if (me.accountKind !== "demo")
    after(() =>
      withUser(me.id, (scope) => runDueSlot(scope, me.timezone, me.preferences)).catch((e) =>
        console.error("proactive slot failed", e instanceof Error ? e.name : e),
      ),
    );
  // Promises whose time has come get their one "Did you?" as soon as the app opens (the 30-minute cron does it when it's closed).
  if (me.accountKind !== "demo")
    await withUser(me.id, (scope) => runProactive({ scope, tz: me.timezone, prefs: me.preferences, trigger: "promise" })).catch((e) =>
      console.error("promise check failed", e instanceof Error ? e.name : e),
    );
  const { clock, sky, review, assistantName, setup, hello, clouds, userId } = await withCurrentUser(async (scope, user) => {
    const tz = user.timezone ?? "UTC";
    // Money (bills due, spent today) joins the clock only while the Money lock is open.
    const clock = await dayClockData(scope, tz, new Date(), { money: !locked });
    const { snapshot } = await getBriefing(scope, user);
    const [integrationList, banks] = await series(
      () => integrationStatus(scope),
      () => listPlaidConnections(scope),
    );
    const setup = [
      googleConfig() && !integrationList.find((i) => i.provider === "google")?.connections.length ? "your calendar" : null,
      plaidConfig() && !banks.length ? "your bank" : null,
    ].filter((x): x is string => !!x);
    // The one thing worth saying (lib/sky-insights, owner 2026-11-12): real trouble first, then a heads-up, then an idea with
    // its own step (Tonight, a free gap, a study block). Money stays quiet while locked; never a money warning, a budget nag
    // or "you have late to-dos" here (owner, 2026-11-11): Money and the line show those.
    const insights = await skyInsights(scope, snapshot, { moneyLocked: locked });
    const name = assistantProfile(user.preferences, user.timezone).name;
    // idea clouds beside the chat bar, from their own data (lib/idea-clouds); a cloud more serious than the note becomes the thought
    const clouds = await ideaClouds(scope, tz, user.preferences, name, new Date(), { note: insights[0] ?? null });
    const sky = clouds[0]?.thought ? null : (insights[0] ?? null);
    // the Sunday review opens in a sheet with the whole look back and ahead
    const reviewRow = sky?.kind === "weekly_review" ? await getMessage(scope, sky.id) : null;
    const review = reviewRow ? toCard(reviewRow, tz, { moneyLocked: locked }) : null;
    return {
      clock,
      sky,
      review,
      assistantName: name,
      clouds,
      userId: user.id,
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
      <TodayOwner userId={userId} />
      <section aria-label="Your day" data-tour="today-page" className="-mx-5 sm:-mx-8 md:mx-0">
        <DayClock data={clock} mode={mode} companion={me.preferences?.companion} clash={!!sky?.id.startsWith("conflict")}>
          {/* a laptop's and a tablet's sky have these under the wheel; a phone has them in the middle (TodayMiddle) */}
          <div className="max-md:hidden">
            {/* accounts made before the birthday was required are asked once, first (owner, 2026-11-10; not a lockout) */}
            {!me.preferences?.birthDate && <BirthdayCard />}
            {/* the same clouds as a phone's (owner, 2026-11-12): one big cloud at a time, the skyling's thought first */}
            {me.preferences?.birthDate && (sky || clouds.length > 0) && (
              <TodayClouds name={assistantName} clouds={clouds} sky={sky} review={review} show={sky ? 2 : 3} />
            )}
            {/* nothing planned yet: one next step, on the first screen (connect what can be connected, else tell the skyling) */}
            {me.preferences?.birthDate &&
              !sky &&
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
          </div>
          {/* a laptop's full sky has the ask bar beside the wheel, under the skyling's line (CSS shows one of the two) */}
          {mode === "full" && (
            <div className="dc-ask">
              <AskBar name={assistantName} chips={false} />
            </div>
          )}
        </DayClock>
      </section>
      {/* a phone (owner, 2026-11-10): the sky on top, the skyling's note and the idea clouds filling the middle (or its
          answer in their place), and the chat bar at the bottom, one screen with nothing to scroll */}
      <div className="dc-middle md:hidden">
        <TodayMiddle
          name={assistantName}
          clouds={clouds}
          sky={me.preferences?.birthDate ? sky : null}
          review={review}
          note={
            !me.preferences?.birthDate || sky
              ? null
              : clock.empty
                ? setup.length > 0
                  ? { text: `Connect ${setup.join(" and ")} to fill your sky`, href: "/settings/integrations" }
                  : { text: `Tell ${assistantName} your week in one message`, fill: "My week: " }
                : null
          }
        >
          {!me.preferences?.birthDate && <BirthdayCard />}
        </TodayMiddle>
      </div>
      {/* the chat bar docked at the bottom of Today, just above the tabs, with the skyling standing on it (owner,
          2026-11-09: "the skyling chat bar at the bottom of the main page ... with the character there") */}
      <div className="dc-dock md:hidden">
        <AskBar name={assistantName} chips={false} answer={false} />
      </div>
      <div className="dc-after-dock mx-auto flex w-full max-w-[640px] flex-col gap-4 max-md:hidden">
        <div className={mode === "full" ? "dc-ask-below max-md:hidden" : "max-md:hidden"}>
          <AskBar name={assistantName} chips={false} />
        </div>
      </div>
    </div>
  );
}
