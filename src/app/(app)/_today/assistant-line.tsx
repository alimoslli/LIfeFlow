"use client";
import Link from "next/link";
import { SkylingIcon } from "@/components/skylings/sprite";
import { useShell } from "@/components/shell/app-shell";
import { PixelIcon } from "@/components/pixel/pixel-icon";

export type AssistantNote = { id?: string; text: string; tone: "attention" | "heads-up" | "good"; href?: string; prompt?: string; label?: string };

/**
 * Under the clock: the one thing the skyling noticed by joining the dots (an exam and tonight's study,
 * a shift and a class too close), with its one next step. Nothing to say means nothing shown.
 */
export function AssistantLine({ name, note }: { name: string; note: AssistantNote | null }) {
  const { openJarvis } = useShell();
  if (!note) return null;
  const body = (
    <>
      {/* their own skyling says it, not the LifeFlow mark */}
      <SkylingIcon className="mt-0.5 h-8 w-8 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-muted">{name}</span>
        <span className="mt-0.5 block text-[0.9375rem] leading-snug">{note.text}</span>
        {note.label && <span className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-accent">{note.label}</span>}
      </span>
      <PixelIcon name="arrow" className="mt-1 h-4 w-4 shrink-0 text-muted" aria-hidden />
    </>
  );
  const cls = "flex w-full items-start gap-3 rounded-[24px] bg-surface px-4 py-3.5 text-left shadow-soft ring-1 ring-border/60 transition-colors";
  return (
    <section aria-label={note.tone === "attention" ? "Heads up" : "From your skyling"}>
      {note.href ? (
        <Link href={note.href} className={cls} data-testid="assistant-line">
          {body}
        </Link>
      ) : (
        <button type="button" className={cls} data-testid="assistant-line" onClick={() => openJarvis(note.prompt ?? note.text, { send: !!note.prompt })}>
          {body}
        </button>
      )}
    </section>
  );
}
