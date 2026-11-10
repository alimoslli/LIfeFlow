"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { tapIdeaCloudAction } from "@/app/(app)/jarvis/actions";
import { prefersReducedMotion } from "@/components/motion/gsap";
import type { IdeaCloud } from "@/lib/idea-clouds";
import { cn } from "@/lib/utils";
import { cloudStyle } from "./cloud-tile";
import "./skylings.css";

const SWAP_MS = 9_000;

/**
 * Idea clouds (owner, 2026-11-10; lib/idea-clouds.ts picks them): a few little pixel clouds (cloud-tile.ts) near the chat bar, each one thing to
 * tell or ask the skyling. They pop in softly and drift, and now and then a new one takes one's place; still under
 * reduced motion. Tapping one puts its sentence in the chat bar (`onPick`), ready to send, never sent for them.
 */
export function IdeaClouds({
  clouds,
  show = 3,
  onPick,
  className,
}: {
  clouds: IdeaCloud[];
  /** How many at once (2 or 3). */
  show?: number;
  onPick: (ask: string) => void;
  className?: string;
}) {
  const [first, setFirst] = useState(0);
  useEffect(() => {
    if (clouds.length <= show || prefersReducedMotion()) return;
    const id = window.setInterval(() => setFirst((f) => (f + 1) % clouds.length), SWAP_MS);
    return () => window.clearInterval(id);
  }, [clouds.length, show]);
  if (!clouds.length) return null;
  const visible = Array.from({ length: Math.min(show, clouds.length) }, (_, i) => clouds[(first + i) % clouds.length]);
  return (
    <ul className={cn("flex flex-wrap gap-2", className)} aria-label="Ideas to try">
      {visible.map((c, i) => (
        <li key={c.key} className="lf-idea max-w-full" style={{ "--i": i } as CSSProperties}>
          <button
            type="button"
            className="lf-idea-cloud"
            onClick={() => {
              // counts the tap (which cloud, never the message), so a feature they've tried shows less
              void tapIdeaCloudAction(c.key).catch(() => {});
              onPick(c.ask);
            }}
          >
            <span className="lf-idea-body" style={cloudStyle((first + i) % clouds.length) as CSSProperties}>
              <b>{c.say}</b>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
