"use client";
import { useState, useTransition } from "react";
import { CompanionGlyph } from "@/components/sky/companion-glyph";
import { ASSISTANT_STYLES } from "@/lib/assistant";
import { COMPANIONS, companionOf, type CompanionKey } from "@/lib/companions";
import { cn } from "@/lib/utils";
import { setCompanionAction } from "../actions";

/**
 * Settings › your assistant: who runs on top of your day (the cast, docs/design/companions/cast.md). Picking one saves
 * at once: it takes the companion's name unless you gave it your own, and the companion's tone (changeable below).
 */
export function CompanionPicker({ current }: { current: CompanionKey | null }) {
  const [picked, setPicked] = useState<CompanionKey | null>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const shown = picked ? companionOf(picked) : null;
  const pick = (k: CompanionKey) => {
    const before = picked;
    setPicked(k);
    setError(null);
    start(async () => {
      const r = await setCompanionAction(k);
      if (!r?.ok) {
        setPicked(before);
        setError(r?.error ?? "Couldn't save. Try again.");
      }
    });
  };
  return (
    <section aria-labelledby="companion-h" className="flex flex-col gap-4 rounded-[28px] bg-surface p-5 shadow-soft">
      <div className="flex items-center gap-4">
        <CompanionGlyph companion={picked} pose={pending ? "celebrate" : "idle"} frame={pending ? 1 : 0} className="h-16 w-16" />
        <div className="min-w-0">
          <h2 id="companion-h" className="font-medium">
            {shown ? shown.name : "Your companion"}
          </h2>
          <p className="mt-0.5 text-sm text-text-2" aria-live="polite">
            {shown
              ? `${shown.line} Talks like a ${ASSISTANT_STYLES[shown.tone].label.toLowerCase()}.`
              : "Pick who runs on top of your day. It's your assistant."}
          </p>
        </div>
      </div>
      <div role="radiogroup" aria-label="Your companion" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {COMPANIONS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={picked === c.key}
            disabled={pending}
            onClick={() => pick(c.key)}
            className={cn(
              "flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 transition-all",
              picked === c.key ? "bg-hero text-hero-text shadow-lift" : "bg-surface-2 hover:bg-surface",
            )}
          >
            <CompanionGlyph companion={c.key} className="h-12 w-12" />
            <span className="text-sm font-medium">{c.name}</span>
            <span className={cn("text-xs", picked === c.key ? "text-hero-text" : "text-muted")}>{c.moment}</span>
          </button>
        ))}
      </div>
      {shown && <p className="text-sm text-text-2">Best at: {shown.skill}</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
