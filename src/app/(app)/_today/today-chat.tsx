"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { setAiConsentAction } from "@/app/(app)/settings/actions";
import { undoChatToolsAction } from "@/app/(app)/jarvis/actions";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { cheerSkylings } from "@/components/skylings/night";
import { OFFER_REPLIES, offersToAct, UNDOABLE_TOOLS } from "@/components/jarvis/suggestions";
import { AI_CONSENT_NEEDED } from "@/lib/ai-consent";
import { isNarration } from "@/lib/narration";
import { cn } from "@/lib/utils";
import { IdeaClouds } from "@/components/skylings/idea-clouds";
import type { IdeaCloud } from "@/lib/idea-clouds";

/**
 * The skyling answers right on Today (owner, 2026-11-10: "there's no different page for the assistant. You just type it
 * below the timeline ... we want to see it being added to the timeline"). The bar under the sky sends through the same
 * chat (/api/jarvis/chat: its limits, AI permission and saved conversation), the answer streams into a card under the bar,
 * and what it saves lands on the sky at once. "Open the chat" keeps the whole conversation one tap away.
 */
type Tool = { callId: string; name: string; label: string; status: "running" | "ok" | "error"; summary?: string };
type Confirm = { actionId: string; summary: string; status: "pending" | "working" | "done" | "cancelled" | "failed"; result?: string };
export type TodayReply = {
  question: string;
  text: string;
  kept: boolean;
  tools: Tool[];
  confirmations: Confirm[];
  streaming: boolean;
  error?: string;
  /** AI isn't allowed yet: the card asks first, with the chat's own words. */
  askAi?: boolean;
  /** "Not now" on an offer, or Undo done: the chips go. */
  settled?: boolean;
  undoNote?: string;
};
type State = { reply: TodayReply | null; conversationId: string | null; busy: boolean };

let state: State = { reply: null, conversationId: null, busy: false };
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
const patch = (fn: (r: TodayReply) => void) => {
  if (!state.reply) return;
  const r: TodayReply = { ...state.reply, tools: [...state.reply.tools], confirmations: [...state.reply.confirmations] };
  fn(r);
  set({ reply: r });
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const SERVER: State = { reply: null, conversationId: null, busy: false };
export const useTodayChat = () =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER,
  );

const plainWords = async (res: Response) => ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "";

/** Sends one message and streams the answer into the card. `refresh` redraws Today (the sky shows what was saved). */
export async function askOnToday(message: string, refresh: () => void) {
  const text = message.trim();
  if (!text || state.busy) return;
  const conversationId = state.conversationId;
  set({ busy: true, reply: { question: text, text: "", kept: false, tools: [], confirmations: [], streaming: true } });
  let saved = false;
  try {
    const res = await fetch("/api/jarvis/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId, clientMessageId: crypto.randomUUID(), message: text, module: "home" }),
    });
    if (!res.ok || !res.body) {
      const words = [402, 403, 429, 503].includes(res.status) ? await plainWords(res) : "";
      if (words === AI_CONSENT_NEEDED) return patch((r) => void (r.askAi = true));
      return patch((r) => void (r.error = res.status === 401 ? "Please sign in again to keep going." : words || "That didn't go through. Try again."));
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line) as {
          type: string;
          id?: string;
          delta?: string;
          callId?: string;
          name?: string;
          label?: string;
          ok?: boolean;
          summary?: string;
          actionId?: string;
          message?: string;
        };
        if (ev.type === "conversation" && ev.id) set({ conversationId: ev.id });
        else if (ev.type === "text")
          patch((r) => {
            if (r.kept) {
              r.text = `${r.text.trimEnd()}\n\n`;
              r.kept = false;
            }
            r.text += ev.delta ?? "";
          });
        else if (ev.type === "tool_start")
          patch((r) => {
            if (isNarration(r.text)) r.text = "";
            else if (r.text.trim()) r.kept = true;
            r.tools.push({ callId: ev.callId!, name: ev.name!, label: ev.label ?? "", status: "running" });
          });
        else if (ev.type === "tool_end") {
          patch((r) => {
            const i = r.tools.findIndex((t) => t.callId === ev.callId);
            if (i >= 0) r.tools[i] = { ...r.tools[i], status: ev.ok ? "ok" : "error", summary: ev.summary };
          });
          // what was saved lands on the sky at once
          if (ev.ok) {
            saved = true;
            refresh();
          }
        } else if (ev.type === "confirmation")
          patch((r) => {
            r.tools = r.tools.filter((t) => t.callId !== ev.callId);
            r.confirmations.push({ actionId: ev.actionId!, summary: ev.summary ?? "", status: "pending" });
          });
        else if (ev.type === "error") patch((r) => void (r.error = ev.message ?? "Something went wrong. Try again."));
      }
    }
  } catch {
    patch((r) => void (r.error = r.error ?? "The connection dropped. Open the chat to see the answer."));
  } finally {
    patch((r) => void (r.streaming = false));
    set({ busy: false });
    if (saved) cheerSkylings();
  }
}

async function decide(actionId: string, decision: "confirm" | "cancel", refresh: () => void) {
  const mark = (status: Confirm["status"], result?: string) =>
    patch((r) => void (r.confirmations = r.confirmations.map((c) => (c.actionId === actionId ? { ...c, status, result } : c))));
  mark("working");
  const res = await fetch(`/api/jarvis/actions/${actionId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision }),
  }).catch(() => null);
  const data = ((await res?.json().catch(() => null)) ?? {}) as { status?: string; message?: string; error?: string };
  if (!res?.ok) return mark("pending", data.error ?? "That didn't go through. Try again.");
  if (data.status === "executed") {
    mark("done", data.message ?? "Done.");
    refresh();
  } else mark(data.status === "cancelled" ? "cancelled" : "failed", data.message ?? (decision === "cancel" ? "Left as it was." : "That didn't work."));
}

async function undoLast(callIds: string[], refresh: () => void) {
  if (!state.conversationId) return;
  const r = await undoChatToolsAction(state.conversationId, callIds).catch(() => null);
  if (!r?.ok) return patch((x) => void (x.error = r?.error ?? "Couldn't undo that. Try again."));
  patch((x) => {
    x.settled = true;
    x.undoNote = r.message ?? "Took that back.";
  });
  refresh();
}

/** Under the bar: the answer, what was saved, its buttons, and the way into the whole chat. */
export function TodayReplyCard({ name, refresh, fill = false }: { name: string; refresh: () => void; fill?: boolean }) {
  const { reply, conversationId, busy } = useTodayChat();
  if (!reply) return null;
  const saved = reply.tools.filter((t) => t.status === "ok");
  const undoable = reply.settled ? [] : saved.filter((t) => (UNDOABLE_TOOLS as readonly string[]).includes(t.name)).map((t) => t.callId);
  const offer = !reply.streaming && !reply.settled && !reply.confirmations.some((c) => c.status === "pending") && offersToAct(reply.text);
  return (
    <section
      aria-label={`${name}'s answer`}
      data-testid="today-reply"
      className={cn(
        "lf-reply flex flex-col rounded-[1.25rem] bg-surface px-4 py-3 shadow-soft ring-1 ring-border/60",
        // in the middle of a phone's Today the card keeps the middle's height and the answer scrolls inside it
        fill && "h-full overflow-y-auto overscroll-contain py-2",
      )}
    >
      <div className="flex items-center gap-3">
        {/* what you asked, unless it's in the middle of Today, where there's no room to say it twice */}
        {fill ? <span className="flex-1" /> : <p className="min-w-0 flex-1 truncate text-xs text-muted">You: {reply.question}</p>}
        {conversationId && (
          <Link href={`/jarvis/${conversationId}`} className="shrink-0 text-sm font-medium text-accent">
            Open the chat
          </Link>
        )}
        <button
          type="button"
          onClick={() => set({ reply: null })}
          aria-label="Close the answer"
          className="tap -my-3 -mr-3 flex shrink-0 items-center justify-center text-muted hover:text-text"
        >
          <PixelIcon name="close" className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0">
        {saved.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-1" aria-label="Saved">
            {saved.map((t) => (
              <li key={t.callId} className="flex items-start gap-2 text-sm font-medium">
                <PixelIcon name="check" className="mt-0.5 h-4 w-4" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{t.summary || t.label}</span>
              </li>
            ))}
          </ul>
        )}
        {reply.text ? (
          <p className="mt-1.5 line-clamp-6 text-[0.9375rem] leading-snug whitespace-pre-line [overflow-wrap:anywhere]">{reply.text}</p>
        ) : (
          reply.streaming && (
            <p className="mt-1.5 text-sm text-muted" role="status">
              {reply.tools.some((t) => t.status === "running") ? reply.tools.find((t) => t.status === "running")!.label || "Saving…" : `${name} is thinking…`}
            </p>
          )
        )}
        {reply.undoNote && <p className="mt-1.5 text-sm text-text-2">{reply.undoNote}</p>}
        {reply.confirmations.map((c) => (
          <div key={c.actionId} className="mt-2 rounded-xl bg-surface-2 px-3 py-2">
            <p className="text-sm whitespace-pre-line">{c.summary}</p>
            {c.status === "pending" ? (
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => void decide(c.actionId, "confirm", refresh)} className="lf-sb lf-sb-sun lf-sb-sm">
                  Confirm
                </button>
                <button type="button" onClick={() => void decide(c.actionId, "cancel", refresh)} className="lf-sb lf-sb-app lf-sb-sm">
                  Cancel
                </button>
              </div>
            ) : (
              <p className="mt-1 text-sm text-text-2">{c.status === "working" ? "Working…" : c.result}</p>
            )}
            {c.status === "pending" && c.result && <p className="mt-1 text-sm text-danger">{c.result}</p>}
          </div>
        ))}
        {reply.askAi && (
          <div className="mt-2">
            <p className="text-sm text-text-2">
              To answer, {name} sends your message and the parts of your LifeFlow data it needs to OpenAI, our AI provider. They don&apos;t use it to train
              their models. You can turn this off anytime in Settings.
            </p>
            <button
              type="button"
              onClick={async () => {
                await setAiConsentAction(true);
                await askOnToday(reply.question, refresh);
              }}
              className="lf-sb lf-sb-sun lf-sb-sm mt-2"
            >
              Allow and send
            </button>
          </div>
        )}
        {reply.error && (
          <p role="alert" className="mt-1.5 text-sm text-danger [overflow-wrap:anywhere]">
            {reply.error}
          </p>
        )}
      </div>
      {(offer || undoable.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {offer &&
            OFFER_REPLIES.map((o) => (
              <button
                key={o}
                type="button"
                disabled={busy}
                onClick={() => (o === "Do it" ? void askOnToday(o, refresh) : patch((r) => void (r.settled = true)))}
                className={o === "Do it" ? "lf-sb lf-sb-sun lf-sb-sm" : "lf-sb lf-sb-app lf-sb-sm"}
              >
                {o}
              </button>
            ))}
          {undoable.length > 0 && (
            <button type="button" onClick={() => void undoLast(undoable, refresh)} className="lf-sb lf-sb-app lf-sb-sm">
              <PixelIcon name="undo" className="h-4 w-4" /> Undo
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** A cloud (or the skyling's note) puts its words in the chat bar under it, ready to send (day-plan.tsx AskBar). */
export const FILL_BAR = "lf:fill-bar";
const fillBar = (ask: string) => window.dispatchEvent(new CustomEvent(FILL_BAR, { detail: ask }));

/**
 * The middle of a phone's Today, between the sky and the chat bar (owner, 2026-11-10: "the chat at the bottom and the
 * extras with the clouds etc in the middle filling up the middle smoothly"): the skyling's one note and the idea clouds,
 * or, once you've asked something, the answer in their place. It keeps one height (day-clock.css .dc-middle), so the sky
 * never jumps. The one chat that keeps going starts from `conversationId`.
 */
export function TodayMiddle({
  name,
  clouds,
  note,
  conversationId,
  children,
}: {
  name: string;
  clouds: IdeaCloud[];
  /** The skyling's one note: a link, a question it sends, or words it puts in the bar. */
  note: { text: string; href?: string; prompt?: string; fill?: string } | null;
  conversationId: string | null;
  /** Something that must come first (the birthday question). */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const { reply } = useTodayChat();
  useEffect(() => {
    if (conversationId && !state.conversationId) set({ conversationId });
  }, [conversationId]);
  const refresh = () => router.refresh();
  if (reply) return <TodayReplyCard name={name} refresh={refresh} fill />;
  if (children) return <div className="h-full overflow-y-auto">{children}</div>;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 overflow-hidden px-1">
      {note && (
        <button
          type="button"
          data-testid="assistant-line"
          onClick={() => (note.href ? router.push(note.href) : note.prompt ? void askOnToday(note.prompt, refresh) : fillBar(note.fill ?? note.text))}
          className="line-clamp-2 max-w-[22rem] text-center text-[0.9375rem] leading-snug font-medium text-text"
        >
          {note.text}
        </button>
      )}
      <IdeaClouds clouds={clouds} show={note ? 2 : 3} onPick={fillBar} className="justify-center" />
    </div>
  );
}
