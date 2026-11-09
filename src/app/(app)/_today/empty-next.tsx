"use client";
import { ArrowRight, MessageCircle } from "lucide-react";
import { useShell } from "@/components/shell/app-shell";

/**
 * A new account's empty sky always has one next step (A-to-Z audit B17): tell the skyling the week in a sentence, and
 * the classes and shifts land on the sky. Shown only while nothing is planned.
 */
export function EmptyNext({ name }: { name: string }) {
  const { openJarvis } = useShell();
  return (
    <button
      type="button"
      onClick={() => openJarvis("My week: ", { send: false })}
      className="flex min-h-16 w-full items-center gap-3 rounded-3xl bg-surface px-5 py-3 text-left shadow-soft ring-1 ring-border/60"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <MessageCircle className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-medium">Fill your week</span>
        <span className="block text-sm text-muted">Tell {name} your classes and shifts in a sentence. They land on your sky.</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
    </button>
  );
}
