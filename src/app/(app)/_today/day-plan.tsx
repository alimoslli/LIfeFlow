"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { SkylingSprite } from "@/components/skylings/sprite";
import { IdeaClouds } from "@/components/skylings/idea-clouds";
import type { IdeaCloud } from "@/lib/idea-clouds";
import { useShell } from "@/components/shell/app-shell";

const CHIPS = [
  ["Plan my day", "Plan my day: look at my schedule, deadlines, to-dos and shifts for today and give me a simple order to do things in."],
  ["Review my spending", "Review my spending this month against my budgets and tell me the one change that would help most."],
  ["Help me study", "Help me study: what's due soonest, and block study time for it in my free time."],
] as const;

/** Today's quick actions: each one asks Jarvis and sends right away. */
export function QuickChips() {
  const { openJarvis } = useShell();
  return (
    <div className="flex flex-wrap gap-2">
      {CHIPS.map(([label, prompt]) => (
        <button key={label} type="button" onClick={() => openJarvis(prompt, { send: true })} className="lf-sb lf-sb-app lf-sb-sm max-w-full">
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Today's chat bar: type here and it goes on in the chat, or tap the waves to talk. An idea cloud fills this box (owner,
 * 2026-11-10: "in the same chat, the same area", no side panel). Above it stands the skyling with its name, so it's clear
 * who you're talking to: small, on the bar's edge, not over the sky.
 */
export function AskBar({ name, chips = true, clouds = [] }: { name: string; chips?: boolean; clouds?: IdeaCloud[] }) {
  const { openJarvis, skyling } = useShell();
  const router = useRouter();
  const [text, setText] = useState("");
  const box = useRef<HTMLInputElement>(null);
  const typed = text.trim();
  return (
    <div className="flex flex-col gap-3">
      <div className="@container relative pt-12">
        <div className="absolute inset-x-0 top-12 z-10 flex -translate-y-full items-end justify-between gap-2 pr-1 pl-4">
          {/* the skyling stands on the bar's top edge with its name beside it; tap it and it hops. The row's bottom is the
              bar's top edge whatever is in it, so a taller cloud grows upward, never onto the bar */}
          <div className="flex shrink-0 items-end gap-1.5" data-testid="ask-skyling">
            <SkylingSprite companion={skyling} className="-mb-1.5 h-9 w-9 cursor-pointer" />
            <span className="lf-chip-night mb-1 rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold">{name}</span>
          </div>
          {/* idea clouds: things to tell or ask it, from their own data; a tap puts it in the chat bar, never sends it */}
          <IdeaClouds
            clouds={clouds}
            show={2}
            onPick={(ask) => {
              setText(ask);
              box.current?.focus();
            }}
            // a second cloud only when the bar is wide enough for both on one line (a laptop's bar is beside the wheel, so
            // the screen's width says nothing; owner, 2026-11-10: nothing lies over anything)
            className="mb-1 min-w-0 flex-nowrap justify-end [&>li:nth-child(n+2)]:hidden @2xl:[&>li:nth-child(n+2)]:block"
          />
        </div>
        <form
          data-tour="skyling"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed) openJarvis(typed, { send: true });
            else router.push("/jarvis?voice=1");
          }}
          className="flex min-h-14 w-full items-center gap-3 rounded-[1.5rem] bg-surface py-2 pr-2 pl-5 shadow-lift ring-1 ring-border/70 focus-within:ring-2 focus-within:ring-accent"
        >
          <input
            ref={box}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            enterKeyHint="send"
            aria-label={`Message ${name}`}
            placeholder={`Message ${name}…`}
            className="min-w-0 flex-1 bg-transparent text-[1rem] outline-none placeholder:text-muted"
          />
          <button
            type="submit"
            aria-label={typed ? "Send" : `Talk to ${name}`}
            className="lf-send flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.875rem]"
          >
            {typed ? <PixelIcon name="send" className="h-[18px] w-[18px]" /> : <PixelIcon name="voice" className="h-[18px] w-[18px]" />}
          </button>
        </form>
      </div>
      {chips && <QuickChips />}
    </div>
  );
}
