"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { SkyInsight } from "@/lib/sky-insights";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { SkylingIcon } from "@/components/skylings/sprite";
import { cheerSkylings } from "@/components/skylings/night";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { useShell } from "@/components/shell/app-shell";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toaster";
import { JarvisMessageCard, type CardMessage } from "@/components/jarvis/message-card";
import { respondAction } from "@/app/(app)/jarvis/proactive-actions";
import type { ActionState } from "@/server/actions";
import { blockTimeAction, unblockTimeAction } from "./actions";

/**
 * Today's one note from the sky (lib/sky-insights; owner, 2026-11-12): what it noticed, why, and its one step done right
 * here (Block it, with Undo; a message's Do it; a question for the skyling). A storm (real trouble) wears the warning
 * ring. The Sunday review opens in a sheet with the whole look back and ahead.
 */
export function SkyNote({
  insight,
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
  const [done, setDone] = useState<{ text: string; undo: () => Promise<ActionState> } | null>(null);
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
        setDone({ text: r.message ?? "Blocked.", undo: () => unblockTimeAction(id) });
        return router.refresh();
      }
      const r = await respondAction(a.messageId, "do");
      if (!r?.ok) return void toast(r?.error ?? "Couldn't do that.", { tone: "danger" });
      if (a.href) return router.push(a.href);
      if (a.prompt) return ask(a.prompt);
      cheerSkylings();
      setDone({ text: r.message ?? "Done.", undo: () => respondAction(a.messageId, "undo") });
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
  const words = (
    <>
      <span className="font-medium text-text">{insight.headline}</span>
      {insight.why && <span className="text-text-2"> · {insight.why}</span>}
    </>
  );
  const step = done ? (
    <p className="flex flex-wrap items-center justify-center gap-x-2 text-sm text-success" role="status">
      <PixelIcon name="check" className="h-4 w-4 shrink-0" />
      {done.text}
      <button type="button" disabled={pending} onClick={undo} className="flex min-h-11 items-center gap-1 px-1 font-medium text-accent">
        <PixelIcon name="undo" className="h-4 w-4" /> Undo
      </button>
    </p>
  ) : a && !openSheet ? (
    <button type="button" disabled={pending} onClick={act} className="lf-sb lf-sb-sun lf-sb-sm">
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {a.label}
    </button>
  ) : openSheet ? (
    <button type="button" onClick={openSheet} className="lf-sb lf-sb-sun lf-sb-sm">
      See your week
    </button>
  ) : null;

  const sheetEl = review && (
    <Sheet open={sheet} onClose={() => setSheet(false)} title="Your week" label="Your week in review">
      <JarvisMessageCard m={review} name={name} />
    </Sheet>
  );
  const label = storm ? "Heads up" : "From your skyling";

  if (layout === "middle")
    return (
      <section aria-label={label} data-weather={insight.weather} className="flex w-full flex-col items-center gap-1.5">
        <p
          data-testid="assistant-line"
          className={cn(
            "line-clamp-2 max-w-[22rem] text-center text-[0.9375rem] leading-snug",
            storm && "rounded-2xl bg-danger-soft px-3 py-1 ring-1 ring-danger/40",
          )}
        >
          {words}
        </p>
        {step}
        {sheetEl}
      </section>
    );
  return (
    <section aria-label={label} data-weather={insight.weather}>
      <div
        data-testid="assistant-line"
        className={cn(
          "flex w-full items-start gap-3 rounded-[24px] bg-surface px-4 py-3.5 text-left shadow-soft ring-1 ring-border/60",
          storm && "bg-danger-soft ring-danger/40",
        )}
      >
        <SkylingIcon className="mt-0.5 h-8 w-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-muted">{name}</span>
          <p className="mt-0.5 text-[0.9375rem] leading-snug">{words}</p>
          {step && <div className="mt-2 flex [&>p]:justify-start">{step}</div>}
        </div>
      </div>
      {sheetEl}
    </section>
  );
}
