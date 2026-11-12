"use client";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { doCloudAction, tapIdeaCloudAction } from "@/app/(app)/jarvis/actions";
import { respondAction } from "@/app/(app)/jarvis/proactive-actions";
import type { IdeaCloud } from "@/lib/idea-clouds";
import { cn } from "@/lib/utils";
import { weatherCloudStyle, CLOUD_TEXT } from "./cloud-tile";
import "./skylings.css";

/** What a tapped fix did: the words, and the message id Undo needs. */
type Done = { text: string; id?: string; undone?: boolean };

/**
 * Insight clouds (owner, 2026-11-12; lib/insight-clouds.ts says what, lib/idea-clouds.ts types them): pixel clouds with a short
 * headline, one line of why and one button. The weather says how serious it is: white a tip, grey a heads-up, dark with
 * rain real trouble (a flicker of lightning only for the worst). The button fills the chat bar (`onPick`, never sent for
 * them), opens a page, or does the one fix and shows what changed with Undo. They sit in one row you can swipe, so a tall
 * cloud never pushes the page. Rain and lightning are CSS, behind the words, and still under reduced motion.
 */
export function IdeaClouds({
  clouds,
  show = 3,
  onPick,
  className,
}: {
  clouds: IdeaCloud[];
  /** The most to show. */
  show?: number;
  onPick: (ask: string) => void;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, Done>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  if (!clouds.length) return null;
  const visible = clouds.slice(0, show);

  async function go(c: IdeaCloud) {
    // counts the tap (which cloud, never the message), so a feature they've tried shows less
    void tapIdeaCloudAction(c.key).catch(() => {});
    if (c.act?.type === "open") return router.push(c.act.href);
    if (c.act?.type === "do") {
      setBusy(c.key);
      setFailed((f) => ({ ...f, [c.key]: "" }));
      const r = await doCloudAction(c.act.ref).catch(() => null);
      setBusy(null);
      if (r?.ok) {
        setDone((d) => ({ ...d, [c.key]: { text: r.message ?? "Done.", id: r.undo } }));
        router.refresh();
      } else setFailed((f) => ({ ...f, [c.key]: r?.error ?? "That didn't work. Try again." }));
      return;
    }
    onPick(c.ask);
  }

  async function undo(c: IdeaCloud) {
    const d = done[c.key];
    if (!d?.id) return;
    setBusy(c.key);
    const r = await respondAction(d.id, "undo").catch(() => null);
    setBusy(null);
    if (r?.ok) {
      setDone((x) => ({ ...x, [c.key]: { text: "Undone.", undone: true } }));
      router.refresh();
    } else setFailed((f) => ({ ...f, [c.key]: r?.error ?? "That didn't work. Try again." }));
  }

  return (
    <ul className={cn("lf-idea-row", className)} aria-label="Ideas to try">
      {visible.map((c, i) => {
        const d = done[c.key];
        // a finished fix settles into a white cloud: the trouble is handled
        const weather = d ? "tip" : c.weather;
        const t = CLOUD_TEXT[weather];
        return (
          <li key={c.key} className="lf-idea" style={{ "--i": i } as CSSProperties}>
            <div
              className="lf-idea-cloud lf-idea-thick"
              data-weather={weather}
              data-bolt={c.bolt && !d ? "true" : undefined}
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
              <span className="lf-idea-body" style={weatherCloudStyle(i, weather) as CSSProperties}>
                {weather === "storm" && <span className="lf-idea-rain" aria-hidden="true" />}
                {c.bolt && !d && (
                  <svg className="lf-idea-bolt" viewBox="0 0 8 12" aria-hidden="true" shapeRendering="crispEdges">
                    <path d="M5 0h2v1H6v2h2v2H5v2h1v2H5v2H3V9h1V7H2V5h2V3h1z" fill="currentColor" />
                  </svg>
                )}
                <span className="lf-idea-in">
                  <b className="lf-idea-head">{c.say}</b>
                  <span className="lf-idea-why" role={failed[c.key] ? "alert" : undefined}>
                    {failed[c.key] || d?.text || c.why}
                  </span>
                  {d ? (
                    d.undone || !d.id ? null : (
                      <button type="button" className="lf-idea-go" disabled={busy === c.key} onClick={() => void undo(c)}>
                        <span className="sr-only">{c.say}: </span>Undo
                      </button>
                    )
                  ) : (
                    <button type="button" className="lf-idea-go" disabled={busy === c.key} onClick={() => void go(c)}>
                      <span className="sr-only">{c.say}: </span>
                      {busy === c.key ? "Working…" : c.cta}
                    </button>
                  )}
                </span>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
