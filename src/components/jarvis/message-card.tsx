"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BellOff, Check, Clock, Loader2, MoreHorizontal, Sparkles, ThumbsDown, ThumbsUp, Undo2, X } from "lucide-react";
import { respondAction } from "@/app/(app)/jarvis/proactive-actions";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { useShell } from "../shell/app-shell";
import { toast } from "../ui/toaster";

export type CardMessage = {
  id: string;
  title: string;
  body: string;
  status: "new" | "done" | "snoozed" | "dismissed" | "muted";
  rating: number | null;
  action: { type: string; label: string; href?: string; prompt?: string; choices?: string[] } | null;
  /** The action changes money: the button says exactly what will happen. */
  money: boolean;
  resultText: string | null;
  undoable: boolean;
  when: string;
  urgent: boolean;
  /** Reviews: the full breakdown. */
  sections?: { heading: string; lines: string[] }[];
};

export function JarvisAvatar({ style, name, className }: { style: "spark" | "orb" | "initial"; name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-accent-text",
        style === "orb" ? "bg-[radial-gradient(circle_at_30%_30%,color-mix(in_srgb,var(--accent)_45%,white),var(--hero)_70%)]" : "bg-accent",
        className ?? "h-9 w-9",
      )}
    >
      {style === "initial" ? (
        <span className="text-sm font-semibold">{name.slice(0, 1).toUpperCase()}</span>
      ) : style === "spark" ? (
        <Sparkles className="h-4 w-4" />
      ) : null}
    </span>
  );
}

/** One thing Jarvis said on his own, with Do it / Snooze / Not now / Don't suggest again and 👍 👎. */
export function JarvisMessageCard({ m, name, avatar, compact }: { m: CardMessage; name: string; avatar: "spark" | "orb" | "initial"; compact?: boolean }) {
  const router = useRouter();
  const { openJarvis } = useShell();
  const [pending, start] = useTransition();
  const [menu, setMenu] = useState(false);
  const [rating, setRating] = useState(m.rating);
  const act = (r: "do" | "snooze" | "dismiss" | "mute" | "up" | "down" | "undo" | "answer", value?: string) =>
    start(async () => {
      if (r === "do" || r === "answer") haptic("success");
      const res = await respondAction(m.id, r, value);
      if (!res?.ok) return void toast(res?.error ?? "Couldn't do that.", { tone: "danger" });
      if (r === "up" || r === "down") setRating(r === "up" ? 1 : -1);
      if (r === "do" && m.action?.type === "open" && m.action.href) return router.push(m.action.href);
      if (r === "do" && m.action?.type === "ask" && m.action.prompt) return openJarvis(m.action.prompt, { send: true });
      if (res.message) toast(res.message);
      router.refresh();
    });
  const open = m.status === "new" || m.status === "snoozed";
  return (
    <article
      data-testid="jarvis-message"
      className={cn("relative rounded-3xl bg-surface p-4 shadow-soft sm:p-5", m.urgent && open && "ring-1 ring-warning/50", !open && "opacity-90")}
    >
      <div className="flex items-start gap-3">
        <JarvisAvatar style={avatar} name={name} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">
            {name} · {m.when}
          </p>
          <h3 className="mt-0.5 text-[15px] font-semibold">{m.title}</h3>
          <p className="mt-1 text-[15px] leading-relaxed text-text-2">{m.body}</p>
          {m.sections && m.sections.length > 0 && (
            <details className="group mt-2 rounded-2xl bg-surface-2 px-3" open={!compact}>
              <summary className="cursor-pointer text-sm font-medium text-accent">Full review</summary>
              <div className="flex flex-col gap-3 pb-3">
                {m.sections.map((sec) => (
                  <div key={sec.heading}>
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">{sec.heading}</p>
                    <ul className="mt-1 flex flex-col gap-0.5 text-sm">
                      {sec.lines.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          )}
          {m.resultText && (
            <p className="mt-2 flex items-start gap-1.5 text-sm text-success">
              <Check className="mt-0.5 h-4 w-4 shrink-0" /> {m.resultText}
            </p>
          )}
          {open && m.action?.choices && (
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Answers">
              {m.action.choices.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={pending}
                  onClick={() => act("answer", c)}
                  className="min-h-11 rounded-full bg-surface-2 px-4 text-sm font-medium hover:bg-surface-3 disabled:opacity-60"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          {open && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!m.action?.choices && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act("do")}
                  className="flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-medium text-accent-text disabled:opacity-60"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {m.action ? m.action.label : "Got it"}
                  {m.money && <span className="sr-only">(changes money; this confirms it)</span>}
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => act("snooze")}
                className="flex min-h-11 items-center gap-1 rounded-full px-3 text-sm text-text-2"
              >
                <Clock className="h-4 w-4" /> Snooze
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => act("dismiss")}
                className="flex min-h-11 items-center rounded-full px-3 text-sm text-text-2"
              >
                Not now
              </button>
            </div>
          )}
          <div className="mt-2 flex items-center gap-1">
            <button
              type="button"
              aria-label="Helpful"
              aria-pressed={rating === 1}
              onClick={() => act("up")}
              className={cn("tap flex items-center justify-center rounded-full", rating === 1 ? "text-accent" : "text-muted")}
            >
              <ThumbsUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Not helpful"
              aria-pressed={rating === -1}
              onClick={() => act("down")}
              className={cn("tap flex items-center justify-center rounded-full", rating === -1 ? "text-danger" : "text-muted")}
            >
              <ThumbsDown className="h-4 w-4" />
            </button>
            {m.undoable && (
              <button
                type="button"
                disabled={pending}
                onClick={() => act("undo")}
                className="ml-1 flex min-h-11 items-center gap-1 rounded-full px-3 text-sm text-text-2"
              >
                <Undo2 className="h-4 w-4" /> Undo
              </button>
            )}
            {open && (
              <div className="relative ml-auto">
                <button
                  type="button"
                  aria-label="More options"
                  aria-expanded={menu}
                  onClick={() => setMenu((v) => !v)}
                  className="tap flex items-center justify-center text-muted"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
                {menu && (
                  <div className="absolute right-0 bottom-full z-10 mb-1 w-64 rounded-2xl bg-surface p-1 shadow-lift">
                    <button
                      type="button"
                      onClick={() => {
                        setMenu(false);
                        act("mute");
                      }}
                      className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm hover:bg-surface-2"
                    >
                      <BellOff className="h-4 w-4" /> Don&apos;t suggest this again
                    </button>
                    <button
                      type="button"
                      onClick={() => setMenu(false)}
                      className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm hover:bg-surface-2"
                    >
                      <X className="h-4 w-4" /> Close
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {compact && (
        <Link href="/jarvis/says" className="mt-1 block text-right text-sm font-medium text-accent">
          Everything {name} said
        </Link>
      )}
    </article>
  );
}
