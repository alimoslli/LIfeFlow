"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { doCloudAction, tapIdeaCloudAction } from "@/app/(app)/jarvis/actions";
import { respondAction } from "@/app/(app)/jarvis/proactive-actions";
import type { IdeaCloud } from "@/lib/idea-clouds";
import { cn } from "@/lib/utils";
import { flyToBar } from "@/components/motion/fly-to-bar";
import { thoughtCloudStyle, weatherCloudStyle, CLOUD_TEXT } from "./cloud-tile";
import "./skylings.css";
import "./thought.css";

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
  lead,
  thought,
  big,
  start = 0,
}: {
  clouds: IdeaCloud[];
  /** The skyling's own thought (Today's note), first in the row and bigger; the clouds float after it. */
  lead?: React.ReactNode;
  /** The skyling's name: a cloud marked `thought` is its thought, first; the others say "<name> noticed". */
  thought?: string;
  /**
   * One big cumulus at a time (owner, 2026-11-12: "one idea on the main page one on the skyling page and they change"): the
   * next drifts in on its own every few seconds, or with a swipe or a dot. `start` picks which one shows first.
   */
  big?: boolean;
  start?: number;
  /** The most to show. */
  show?: number;
  onPick: (ask: string) => void;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, Done>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  // a cloud whose question went into the chat box leaves, and the next flows in (owner, 2026-11-12: "then the other cloud
  // flows in never empty"); once every one is used they all come back
  const [used, setUsed] = useState<string[]>([]);
  const fresh = clouds.slice(0, show).filter((c) => !used.includes(c.key));
  const leadOn = !!lead && !used.includes(LEAD);
  const allUsed = !fresh.length && !leadOn;
  const visible = allUsed ? clouds.slice(0, show) : fresh;
  const showLead = allUsed ? !!lead : leadOn;
  const count = visible.length + (showLead ? 1 : 0);
  const [at, setAt] = useState(() => (count > 1 ? start % count : 0));
  const [held, setHeld] = useState(false);
  const [typing, setTyping] = useState(false);
  // typing to the skyling: the clouds hold still (and dim, thought.css) so they don't get in the way
  useEffect(() => {
    if (!big) return;
    const inBox = (e: FocusEvent) => e.target instanceof Element && !!e.target.closest("[data-cloud-target]");
    const on = (e: FocusEvent) => inBox(e) && setTyping(true);
    const off = (e: FocusEvent) => inBox(e) && setTyping(false);
    // the skyling's own note asks through Today's bar too: its question going in counts as that cloud used
    const usedLead = () => setUsed((u) => (u.includes(LEAD) ? u : [...u, LEAD]));
    document.addEventListener("focusin", on);
    document.addEventListener("focusout", off);
    window.addEventListener(LEAD_USED, usedLead);
    return () => {
      document.removeEventListener("focusin", on);
      document.removeEventListener("focusout", off);
      window.removeEventListener(LEAD_USED, usedLead);
    };
  }, [big]);
  const cur = count ? at % count : 0;
  const swipe = useRef<number | null>(null);
  const step = (by: number) => setAt((a) => (a + by + count) % count);
  // the next idea drifts in on its own, unless they're touching, reading with the keyboard, or just did one (its Undo stays)
  const busyOrDone = !!busy || Object.keys(done).length > 0;
  useEffect(() => {
    if (!big || count < 2 || held || typing || busyOrDone) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (navigator.webdriver && !/[?&]clouds=1/.test(location.search)) return;
    const t = window.setTimeout(() => setAt((a) => (a + 1) % count), CHANGE_MS);
    return () => window.clearTimeout(t);
  }, [big, count, held, typing, busyOrDone, at]);
  if (!clouds.length && !lead) return null;

  async function go(c: IdeaCloud, el?: HTMLElement | null) {
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
    // a question floats down into the chat box and merges into it, then waits there to be sent
    flyToBar(el, () => {
      onPick(c.ask);
      if (big) setUsed((u) => [...u, c.key]);
    });
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

  const stack = big && count > 1;
  const row = (
    <ul
      className={cn("lf-idea-row", big && "lf-idea-big", !stack && className)}
      aria-label="Ideas to try"
      {...(stack && {
        onPointerEnter: () => setHeld(true),
        onPointerLeave: () => setHeld(false),
        onPointerDown: (e: React.PointerEvent) => (swipe.current = e.clientX),
        onPointerUp: (e: React.PointerEvent) => {
          const dx = swipe.current == null ? 0 : e.clientX - swipe.current;
          swipe.current = null;
          if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
        },
        // a keyboard reaching a cloud brings it forward
        onFocus: (e: React.FocusEvent) => {
          setHeld(true);
          const li = (e.target as HTMLElement).closest("li[data-k]");
          if (li) setAt(Number(li.getAttribute("data-k")));
        },
        onBlur: () => setHeld(false),
      })}
    >
      {showLead && (
        <li className="lf-idea-lead" data-k={0} data-on={!stack || cur === 0 ? "" : undefined}>
          {lead}
        </li>
      )}
      {visible.map((c, i) => {
        const d = done[c.key];
        // a finished fix settles into a white cloud: the trouble is handled
        const weather = d ? "tip" : c.weather;
        const t = CLOUD_TEXT[weather];
        // the big cumulus (owner, 2026-11-12): the skyling's thought, or on a phone's Today every cloud; rain under a storm
        const isThought = !!thought && !showLead && i === 0 && !!c.thought;
        const large = big || isThought;
        const storm = weather === "storm";
        const kicker = isThought ? `${thought} thought about this` : c.key.startsWith("insight:") && thought ? `${thought} noticed` : "Try this";
        const cloud = (
          <div
            className={cn("lf-idea-cloud lf-idea-thick", large && "lf-thought-cloud")}
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
            <span
              className="lf-idea-body"
              style={(large ? thoughtCloudStyle(weather, i + (showLead ? 1 : 0)) : weatherCloudStyle(i, weather)) as CSSProperties}
            >
              {storm && !large && <span className="lf-idea-rain" aria-hidden="true" />}
              {c.bolt && !d && !large && (
                <svg className="lf-idea-bolt" viewBox="0 0 8 12" aria-hidden="true" shapeRendering="crispEdges">
                  <path d="M5 0h2v1H6v2h2v2H5v2h1v2H5v2H3V9h1V7H2V5h2V3h1z" fill="currentColor" />
                </svg>
              )}
              <span className="lf-idea-in">
                <b className="lf-idea-head">{c.say}</b>
                {/* a big cloud keeps its front light: the headline and its one button; the why is read out, not shown */}
                {large && !failed[c.key] && !d?.text ? (
                  <span className="sr-only">{c.why}</span>
                ) : (
                  <span className="lf-idea-why" role={failed[c.key] ? "alert" : undefined}>
                    {failed[c.key] || d?.text || c.why}
                  </span>
                )}
                {d ? (
                  d.undone || !d.id ? null : (
                    <button type="button" className="lf-idea-go" disabled={busy === c.key} onClick={() => void undo(c)}>
                      <span className="sr-only">{c.say}: </span>Undo
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className="lf-idea-go"
                    disabled={busy === c.key}
                    onClick={(e) => void go(c, e.currentTarget.closest<HTMLElement>(".lf-idea-cloud"))}
                  >
                    <span className="sr-only">{c.say}: </span>
                    {busy === c.key ? "Working…" : c.cta}
                  </button>
                )}
              </span>
            </span>
            {large && storm && (
              <>
                <span className="lf-thought-rain" aria-hidden="true" />
                {/* lightning only for the worst (lib/insights `bolt`) */}
                {c.bolt && (
                  <svg className="lf-idea-bolt lf-thought-bolt" viewBox="0 0 8 12" aria-hidden="true" shapeRendering="crispEdges">
                    <path d="M5 0h2v1H6v2h2v2H5v2h1v2H5v2H3V9h1V7H2V5h2V3h1z" fill="currentColor" />
                  </svg>
                )}
              </>
            )}
          </div>
        );
        if (large)
          return (
            <li
              key={c.key}
              className="lf-idea-lead"
              data-k={i + (showLead ? 1 : 0)}
              data-on={!stack || cur === i + (showLead ? 1 : 0) ? "" : undefined}
              style={{ "--i": i } as CSSProperties}
            >
              <section
                aria-label={isThought ? (storm ? "Heads up" : "From your skyling") : undefined}
                data-weather={storm ? "storm" : "clear"}
                data-layout="middle"
                className="lf-thought"
              >
                <span className="lf-thought-who">{kicker}</span>
                {cloud}
                {/* the little puffs down to the skyling: only its own thought */}
                {isThought && (
                  <span className="lf-thought-puffs" aria-hidden="true">
                    <i />
                    <i />
                  </span>
                )}
              </section>
            </li>
          );
        return (
          <li key={c.key} className="lf-idea" style={{ "--i": i } as CSSProperties}>
            {cloud}
          </li>
        );
      })}
    </ul>
  );
  if (!stack) return row;
  return (
    <div className={cn("lf-idea-stack w-full min-w-0", className)}>
      {row}
      <div className="lf-idea-dots">
        {Array.from({ length: count }, (_, k) => (
          <button key={k} type="button" aria-label={`Idea ${k + 1} of ${count}`} aria-current={k === cur ? "true" : undefined} onClick={() => setAt(k)}>
            <i />
          </button>
        ))}
      </div>
    </div>
  );
}

/** How long one idea stays before the next drifts in. */
const CHANGE_MS = 9000;
const LEAD = "lead";
/** The skyling's note (the `lead`) put its question in the chat box: it leaves like any used cloud. */
export const LEAD_USED = "lf:cloud-lead-used";
