"use client";
import { useState, useSyncExternalStore } from "react";
import { MOMENT_ANSWERS, momentThanks, type MomentAnswer, type MomentQuestion } from "@/lib/moment-question";
import { useShell } from "@/components/shell/app-shell";
import { answerMomentAction } from "./actions";

// The question the star claim brought back (ClaimStars sets it once; the card on a phone's middle or a laptop's note reads it).
let current: MomentQuestion | null = null;
const listeners = new Set<() => void>();
export function setMoment(q: MomentQuestion | null) {
  current = q;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * The skyling's one question on a real moment (owner, 2026-11-22; lib/moment-question.ts): "How was the Target shift?"
 * right as its star is claimed. Three taps, "Worth noting" (the chat opens with the moment named; the person decides what
 * is remembered), or "Not now". A skip says nothing about how they feel and is never asked about again.
 */
export function MomentAsk({ className }: { className?: string }) {
  const q = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  const { openJarvis } = useShell();
  const [thanks, setThanks] = useState<string | null>(null);
  if (thanks)
    return (
      <p role="status" className={`text-center text-[0.9375rem] text-text-2 ${className ?? ""}`} data-testid="moment-thanks">
        {thanks}
      </p>
    );
  if (!q) return null;
  const answer = (a: MomentAnswer) => {
    setThanks(momentThanks(a));
    setMoment(null);
    void answerMomentAction(a);
  };
  return (
    <section aria-label={q.ask} className={`flex flex-col items-center gap-2.5 ${className ?? ""}`} data-testid="moment-ask">
      <p className="text-center text-[0.9375rem] font-medium">{q.ask}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {MOMENT_ANSWERS.map((a) => (
          <button key={a} type="button" className="lf-sb lf-sb-glass lf-sb-sm lf-sb-day min-h-11" onClick={() => answer(a)}>
            {a}
          </button>
        ))}
      </div>
      <div className="flex gap-4 text-sm">
        <button
          type="button"
          className="min-h-11 font-medium text-accent underline-offset-4 hover:underline"
          onClick={() => {
            setMoment(null);
            openJarvis(q.note, { send: false });
          }}
        >
          Worth noting
        </button>
        <button type="button" className="min-h-11 text-muted underline-offset-4 hover:underline" onClick={() => setMoment(null)}>
          Not now
        </button>
      </div>
    </section>
  );
}
