"use client";
import Link from "next/link";
import { isChatPage } from "@/lib/app-routes";
import { showStop } from "@/lib/today-stop";
import { SkylingIcon } from "@/components/skylings/sprite";
import { useShell } from "@/components/shell/app-shell";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { MomentAsk } from "./moment-ask";

export type AssistantNote = {
  id?: string;
  text: string;
  tone: "attention" | "heads-up" | "good";
  href?: string;
  prompt?: string;
  label?: string;
  /** the focus screen for the work the note names ("Start it", owner 2026-11-22, the ADHD helps) */
  start?: string;
};

/**
 * Under the clock: the one thing the skyling noticed by joining the dots (an exam and tonight's study,
 * a shift and a class too close), with its one next step. Nothing to say means nothing shown.
 */
export function AssistantLine({ name, note, brief, work }: { name: string; note: AssistantNote | null; brief?: string | null; work?: string | null }) {
  const { openJarvis } = useShell();
  if (!note) return null;
  const body = (
    <>
      {/* their own skyling says it, not the LifeFlow mark */}
      <SkylingIcon className="mt-0.5 h-8 w-8 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-muted">{name}</span>
        <span className="mt-0.5 block text-[0.9375rem] leading-snug">{note.text}</span>
        {work && (
          <span className="mt-1 block text-sm text-text-2" data-testid="work-today">
            {work}
          </span>
        )}
        {brief && (
          <span className="mt-1 block text-sm text-text-2" data-testid="morning-brief">
            <span className="font-medium">Morning brief:</span> {brief}
          </span>
        )}
        {note.label && <span className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-accent">{note.label}</span>}
      </span>
      <PixelIcon name="arrow" className="mt-1 h-4 w-4 shrink-0 text-muted" aria-hidden />
    </>
  );
  const cls = "flex w-full items-start gap-3 rounded-[24px] bg-surface px-4 py-3.5 text-left shadow-soft ring-1 ring-border/60 transition-colors";
  return (
    <section aria-label={note.tone === "attention" ? "Heads up" : "From your skyling"}>
      {note.href ? (
        <Link
          href={note.href}
          prefetch={isChatPage(note.href) ? false : undefined}
          className={cls}
          data-testid="assistant-line"
          onClick={(e) => {
            // on Today the note opens its own stop on the line instead of leaving the page
            if (showStop(note.href)) e.preventDefault();
          }}
        >
          {body}
        </Link>
      ) : (
        <button type="button" className={cls} data-testid="assistant-line" onClick={() => openJarvis(note.prompt ?? note.text, { send: !!note.prompt })}>
          {body}
        </button>
      )}
      {note.start && <StartIt href={note.start} className="mt-2.5 ml-[3.75rem]" />}
      <MomentAsk className="mt-3" />
    </section>
  );
}

/**
 * "Start it" (owner, 2026-11-22, the ADHD helps, item 1): getting going is the hard part, so the note's work opens a calm
 * focus screen with one small first step and a short timer. Its own button beside the note, never inside its link.
 */
export function StartIt({ href, className }: { href: string; className?: string }) {
  return (
    <Link href={href} className={`lf-sb lf-sb-sun lf-sb-sm min-h-11 ${className ?? ""}`} data-testid="start-it">
      <PixelIcon name="play" className="h-4 w-4" aria-hidden /> Start it
    </Link>
  );
}
