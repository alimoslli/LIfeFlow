"use client";
import { AllFive } from "@/components/skylings/all-five";
import { useState, useTransition } from "react";
import { CompanionGlyph } from "@/components/sky/companion-glyph";
import { useSkyling } from "@/components/skylings/use-skyling";
import { ASSISTANT_STYLES } from "@/lib/assistant";
import { COMPANIONS, companionOf, SKY_CHOICE, SKY_CHOICE_LABEL, type CompanionChoice, ownsNight } from "@/lib/companions";
import { cn } from "@/lib/utils";
import { setCompanionAction } from "../actions";

/**
 * Settings › your skyling: who runs on top of your day (the cast, docs/design/companions/cast.md). Picking one saves
 * at once: it takes the skyling's name unless you gave it your own, and the skyling's tone (changeable below). The
 * seventh, "Changes with the sky" (owner, 2026-11-10), shows whoever's moment it is and keeps your name and tone.
 */
export function CompanionPicker({ current, tz }: { current: CompanionChoice | null; tz: string }) {
  const [picked, setPicked] = useState<CompanionChoice | null>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const now = useSkyling(SKY_CHOICE, tz);
  const sky = picked === SKY_CHOICE;
  const shown = picked && !sky ? companionOf(picked) : null;
  const pick = (k: CompanionChoice) => {
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
  const tile = (on: boolean) =>
    cn(
      "flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 transition-all",
      on ? "bg-hero text-hero-text shadow-lift" : "bg-surface-2 hover:bg-surface",
    );
  return (
    <section aria-labelledby="companion-h" className="flex flex-col gap-4 rounded-[28px] bg-surface p-5 shadow-soft">
      <div className="flex items-center gap-4">
        <CompanionGlyph
          companion={sky ? now : picked}
          night={ownsNight(sky ? now : picked)}
          pose={pending ? "celebrate" : "idle"}
          frame={pending ? 1 : 0}
          className="h-16 w-16"
        />
        <div className="min-w-0">
          <h2 id="companion-h" className="font-medium">
            {sky ? SKY_CHOICE_LABEL.name : shown ? shown.name : "Your skyling"}
          </h2>
          <p className="mt-0.5 text-sm text-text-2" aria-live="polite">
            {sky
              ? SKY_CHOICE_LABEL.line
              : shown
                ? `${shown.line} Talks like a ${ASSISTANT_STYLES[shown.tone].label.toLowerCase()}.`
                : "Pick who runs on top of your day. It's your skyling."}
          </p>
        </div>
      </div>
      <div role="radiogroup" aria-label="Your skyling" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {COMPANIONS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={picked === c.key}
            disabled={pending}
            onClick={() => pick(c.key)}
            className={tile(picked === c.key)}
          >
            <CompanionGlyph companion={c.key} night={ownsNight(c.key)} className="h-12 w-12" />
            <span className="text-sm font-medium">{c.name}</span>
            <span className={cn("text-xs", picked === c.key ? "text-hero-text" : "text-muted")}>{c.moment}</span>
          </button>
        ))}
        <button type="button" role="radio" aria-checked={sky} disabled={pending} onClick={() => pick(SKY_CHOICE)} className={tile(sky)}>
          <AllFive />
          <span className="text-center text-sm leading-tight font-medium">{SKY_CHOICE_LABEL.name}</span>
          <span className={cn("text-xs", sky ? "text-hero-text" : "text-muted")}>{SKY_CHOICE_LABEL.moment}</span>
        </button>
      </div>
      {shown && <p className="text-sm text-text-2">Best at: {shown.skill}</p>}
      {sky && <p className="text-sm text-text-2">Same name and voice all day. Only the look changes.</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
