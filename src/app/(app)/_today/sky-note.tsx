"use client";
import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { SkyInsight } from "@/lib/sky-insights";
import { haptic } from "@/lib/haptics";
import { CLOUD_TEXT, thoughtCloudStyle, type CloudWeather } from "@/components/skylings/cloud-tile";
import "@/components/skylings/skylings.css";
import "@/components/skylings/thought.css";
import { cheerSkylings } from "@/components/skylings/night";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { useShell } from "@/components/shell/app-shell";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toaster";
import { JarvisMessageCard, type CardMessage } from "@/components/jarvis/message-card";
import { respondAction } from "@/app/(app)/jarvis/proactive-actions";
import type { ActionState } from "@/server/actions";
import { blockTimeAction, unblockTimeAction } from "./actions";

/** How long a step just taken stays in view with its Undo before the next note shows. */
const UNDO_MS = 8000;

/**
 * Today's one note from the sky (lib/sky-insights; owner, 2026-11-12): the skyling's own thought, as a big pixel cloud in
 * the weather of what it noticed, with why and its one step done right there (Block it, with Undo; a message's Do it; a
 * question for the skyling). The Sunday review opens in a sheet with the whole look back and ahead.
 */
export function SkyNote({
  insight: current,
  name,
  review,
  layout,
  onAsk,
}: {
  insight: SkyInsight;
  name: string;
  /** The Sunday review as its card, for the sheet. */
  review?: CardMessage | null;
  layout: "card" | "middle";
  /** How a question reaches the skyling here (Today's bar on a phone); without it, the chat opens and sends it. */
  onAsk?: (prompt: string) => void;
}) {
  const router = useRouter();
  const { openJarvis } = useShell();
  const ask = onAsk ?? ((prompt: string) => openJarvis(prompt, { send: true }));
  const [pending, start] = useTransition();
  // what was just done stays in view with its Undo for a few seconds, even after the refresh brings the next note
  const [done, setDone] = useState<{ insight: SkyInsight; text: string; undo: () => Promise<ActionState> } | null>(null);
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setDone(null), UNDO_MS);
    return () => window.clearTimeout(t);
  }, [done]);
  const insight = done?.insight ?? current;
  const [sheet, setSheet] = useState(false);
  const a = insight.action;
  const storm = insight.weather === "storm";

  const act = () =>
    start(async () => {
      if (!a) return;
      if (a.type === "ask") return ask(a.prompt);
      if (a.type === "open") return router.push(a.href);
      haptic("success");
      if (a.type === "block") {
        const r = await blockTimeAction(a.block);
        if (!r?.ok) return void toast(r?.error ?? "That didn't save. Try again.", { tone: "danger" });
        const id = r.undo!;
        cheerSkylings();
        setDone({ insight, text: r.message ?? "Blocked.", undo: () => unblockTimeAction(id) });
        return router.refresh();
      }
      const r = await respondAction(a.messageId, "do");
      if (!r?.ok) return void toast(r?.error ?? "Couldn't do that.", { tone: "danger" });
      if (a.href) return router.push(a.href);
      if (a.prompt) return ask(a.prompt);
      cheerSkylings();
      setDone({ insight, text: r.message ?? "Done.", undo: () => respondAction(a.messageId, "undo") });
      router.refresh();
    });
  const undo = () =>
    start(async () => {
      if (!done) return;
      const r = await done.undo();
      if (!r?.ok) return void toast(r?.error ?? "Couldn't undo that.", { tone: "danger" });
      setDone(null);
      toast(r.message ?? "Undone.");
      router.refresh();
    });

  const openSheet = review && insight.kind === "weekly_review" ? () => setSheet(true) : null;
  const weather = done ? "tip" : WEATHER[insight.weather];
  const t = CLOUD_TEXT[weather];
  const step = done ? (
    <>
      <span className="lf-idea-why lf-thought-done" role="status">
        <PixelIcon name="check" className="mr-1 inline h-4 w-4 align-[-3px]" />
        {done.text}
      </span>
      <button type="button" disabled={pending} onClick={undo} className="lf-idea-go">
        <span className="sr-only">{insight.headline}: </span>Undo
      </button>
    </>
  ) : openSheet ? (
    <button type="button" onClick={openSheet} className="lf-idea-go">
      See your week
    </button>
  ) : a ? (
    <button type="button" disabled={pending} onClick={act} className="lf-idea-go">
      <span className="sr-only">{insight.headline}: </span>
      {pending ? <Loader2 className="inline h-4 w-4 animate-spin" /> : a.label}
    </button>
  ) : null;

  const sheetEl = review && (
    <Sheet open={sheet} onClose={() => setSheet(false)} title="Your week" label="Your week in review">
      <JarvisMessageCard m={review} name={name} />
    </Sheet>
  );

  // the skyling's own thought (owner, 2026-11-12: "a bigger cloud showing it as skylings insight"): a big pixel cloud in the
  // weather of what it noticed, with little puffs down to the skyling on the bar; real trouble is a storm cloud with rain
  // falling from under it and a flicker of lightning (owner: "a darker cloud looking like a storm")
  return (
    <section aria-label={storm ? "Heads up" : "From your skyling"} data-weather={insight.weather} data-layout={layout} className="lf-thought">
      <span className="lf-thought-who">{name} thought about this</span>
      <div
        className="lf-idea-cloud lf-idea-thick lf-thought-cloud"
        data-weather={weather}
        data-bolt={storm && !done ? "true" : undefined}
        style={
          {
            "--t-text": t.text,
            "--t-muted": t.muted,
            "--t-btn": t.buttonBg,
            "--t-btn-text": t.buttonText,
            "--t-btn-line": t.buttonOutline,
          } as CSSProperties
        }
      >
        <span className="lf-idea-body" style={thoughtCloudStyle(weather) as CSSProperties}>
          <span className="lf-idea-in">
            <b className="lf-idea-head" data-testid="assistant-line">
              {insight.headline}
            </b>
            {!done && insight.why && <span className="sr-only">{insight.why}</span>}
            {step}
          </span>
        </span>
        {storm && !done && (
          <>
            <span className="lf-thought-rain" aria-hidden="true" />
            <svg className="lf-idea-bolt lf-thought-bolt" viewBox="0 0 8 12" aria-hidden="true" shapeRendering="crispEdges">
              <path d="M5 0h2v1H6v2h2v2H5v2h1v2H5v2H3V9h1V7H2V5h2V3h1z" fill="currentColor" />
            </svg>
          </>
        )}
      </div>
      <span className="lf-thought-puffs" aria-hidden="true">
        <i />
        <i />
      </span>
      {sheetEl}
    </section>
  );
}

/** Our weather words to the clouds' (lib/sky-insights to components/skylings/cloud-tile). */
const WEATHER: Record<SkyInsight["weather"], CloudWeather> = { clear: "tip", grey: "heads-up", storm: "storm" };
