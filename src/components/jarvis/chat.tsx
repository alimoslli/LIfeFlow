"use client";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import Link from "next/link";
import { ASK_EVENT, takeSend, type AskDetail } from "@/lib/ask-handoff";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useAppBusy } from "@/lib/app-busy";
import {
  AlertTriangle,
  Plug,
  CalendarDays,
  GraduationCap,
  Repeat,
  Wallet,
  Brain,
  CircleAlert,
  FileText,
  ImageIcon,
  Loader2,
  Paperclip,
  Square,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { rateRunAction } from "@/app/(app)/jarvis/actions";
import { cn } from "@/lib/utils";
import { isAppPath, viewAtName } from "@/lib/app-routes";
import { jsonOf, PlainError, serverWords } from "@/lib/plain-error";
import { nameAtStart } from "@/lib/assistant";
import { SkylingSprite } from "@/components/skylings/sprite";
import { IdeaClouds } from "@/components/skylings/idea-clouds";
import type { IdeaCloud } from "@/lib/idea-clouds";
import { CLOUD, PixelArt, SkyWindow } from "@/components/skylings/sky-window";
import { cheerSkylings } from "@/components/skylings/night";
import { JarvisStatus, statusWord } from "./status";
import { useShell } from "../shell/app-shell";
import { AiConsentCard } from "./ai-consent-card";
import { Markdown } from "./markdown";
import { LiveVoice, VoiceButton } from "./voice-call";
import { defaultFollowUps, FOLLOW_UPS, STARTERS } from "./suggestions";
import type { JarvisAvailability, JarvisModule, UiAttachment, UiMemorySuggestion, UiMessage, UiTool } from "./types";

type ServerEvent =
  | { type: "conversation"; id: string; title: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; callId: string; name: string; label: string }
  | { type: "tool_end"; callId: string; name: string; ok: boolean; summary: string; viewAt?: string; sources?: { title: string; url: string }[] }
  | { type: "confirmation"; actionId: string; callId: string; toolName: string; summary: string }
  | { type: "memory_proposal"; callId: string; memoryId: string; content: string; replaces?: string }
  | { type: "already"; state: "running" | "finished" }
  | { type: "done"; messageId: string | null; runId?: string | null }
  | { type: "error"; message: string };

const CONNECTION_DROPPED = "The connection dropped. Getting your answer…";
const ANSWER_LOST = "Your message was saved, but the answer didn't come through.";
const MESSAGE_LOST = "Your message didn't go through.";
const POLL_MS = 2000;
/** Longer than the server lets a turn run, so an answer that is still being worked on is waited for. */
const RECOVER_MS = 330_000;
/** If the message never reached the server, there is no point waiting the full time. */
const UNSAVED_MS = 20_000;

type Attempt = { id: string; text: string; attachments: (UiAttachment & { uploading?: boolean; error?: string })[] };

/** A fresh uuid, also where crypto.randomUUID isn't offered (plain http on a local network). */
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

const ACCEPT = "application/pdf,.pdf,image/png,image/jpeg,image/webp,image/gif,text/plain,text/csv,text/markdown,application/json,.md,.csv,.txt";

export function JarvisChat({
  conversationId: initialId,
  initialMessages = [],
  module,
  availability,
  compact,
  initialPrompt,
  autoSend,
  onConversation,
  connect,
  ideas,
  startVoice,
}: {
  conversationId?: string | null;
  initialMessages?: UiMessage[];
  module: JarvisModule;
  availability: JarvisAvailability;
  compact?: boolean;
  initialPrompt?: string;
  /** Send `initialPrompt` immediately on open (used by one-tap actions). */
  autoSend?: boolean;
  onConversation?: (id: string, title: string) => void;
  /** Not connected yet; shown as one "connect me to do more" card on the empty screen. */
  connect?: string[];
  /** Open with the voice bar already on. */
  startVoice?: boolean;
  /** Idea clouds for the empty chat, in place of the starter cards (owner, 2026-11-10; lib/idea-clouds). */
  ideas?: IdeaCloud[];
}) {
  const router = useRouter();
  const { assistantName, aiConsent, tz, skyling } = useShell();
  const canSend = availability.available && aiConsent;
  const [conversationId, setConversationId] = useState(initialId ?? null);
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages);
  const [input, setInput] = useState(initialPrompt ?? "");
  const [busy, setBusy] = useState(false);
  // A reply that changed data refreshes the page. In a new conversation that refresh also moves to /jarvis/<id>, and the
  // page keys this chat by conversation, so it is rebuilt when the refresh lands. Until then nothing can be typed or
  // sent here, or it would be wiped with the old chat.
  const [refreshing, startRefresh] = useTransition();
  const [pending, setPending] = useState<(UiAttachment & { uploading?: boolean; error?: string })[]>([]);
  const [lastTool, setLastTool] = useState<string | null>(null);
  // a reply streaming or a file attached but not sent: an app update waits (components/pwa/app-updater.tsx)
  useAppBusy(busy || pending.length > 0);
  const [talking, setTalking] = useState(!!startVoice && canSend);
  const abortRef = useRef<AbortController | null>(null);
  const attemptRef = useRef<Attempt | null>(null);
  const turnConvRef = useRef<string | null>(null);
  const stoppedRef = useRef(false);
  const takeoverRef = useRef(false);
  const aliveRef = useRef(true);
  const pokeRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && messages.length) el.scrollTo({ top: el.scrollHeight, behavior: messages.length > 2 ? "smooth" : "auto" });
  }, [messages]);

  // Desktop only: on phones focusing opens the keyboard (and hides the tab bar) before the user asks.
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) inputRef.current?.focus();
  }, []);

  // Coming back to the page (unlocking the phone, switching back to the app) is when a dropped answer is looked for at once.
  useEffect(() => {
    aliveRef.current = true;
    const wake = () => {
      if (document.visibilityState !== "hidden") pokeRef.current?.();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("online", wake);
    return () => {
      aliveRef.current = false;
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("online", wake);
    };
  }, []);

  const autoSent = useRef(false);
  useEffect(() => {
    // sent at once only when a button in the app asked to send it (takeSend), never from a link alone
    if (initialPrompt && availability.available && !autoSent.current && (autoSend || takeSend(initialPrompt))) {
      autoSent.current = true;
      void send(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a question from elsewhere on this page (an idea, a heads-up) goes into this chat: typed in the box, or sent
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });
  useEffect(() => {
    const onAsk = (e: Event) => {
      const { prompt, send: now } = (e as CustomEvent<AskDetail>).detail ?? {};
      if (prompt && now && availability.available) void sendRef.current(prompt);
      else if (prompt) setInput(prompt);
      inputRef.current?.focus();
    };
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, [availability.available]);

  const updateAssistant = useCallback((fn: (m: Extract<UiMessage, { role: "assistant" }>) => void) => {
    setMessages((prev) => {
      const next = [...prev];
      const i = next.length - 1;
      if (i < 0 || next[i].role !== "assistant") return prev;
      const copy = { ...(next[i] as Extract<UiMessage, { role: "assistant" }>) };
      copy.tools = [...copy.tools];
      copy.confirmations = [...copy.confirmations];
      copy.memories = [...copy.memories];
      fn(copy);
      next[i] = copy;
      return next;
    });
  }, []);

  /** Where one send stands on the server, by the id the app made for it, with the saved conversation. */
  async function snapshotOf(id: string) {
    const res = await fetch(`/api/jarvis/chat/messages?clientMessageId=${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return jsonOf<{ state: "unknown" | "running" | "finished" | "stalled"; conversationId: string | null; title: string; messages: UiMessage[] }>(res);
  }

  /** Shows the saved conversation (the truth on the server) and refreshes the page's data if the turn changed anything. */
  function adoptSaved(snap: { conversationId: string | null; title: string; messages: UiMessage[] }) {
    setMessages(snap.messages);
    if (!conversationId && snap.conversationId) {
      setConversationId(snap.conversationId);
      onConversation?.(snap.conversationId, snap.title);
      if (!compact) window.history.replaceState(null, "", `/jarvis/${snap.conversationId}`);
    }
    const last = snap.messages.at(-1);
    if (last?.role === "assistant" && last.tools.some((t) => t.status === "ok")) startRefresh(() => router.refresh());
  }

  /**
   * The connection dropped (a phone locking, the app in the background, a network blip). The server keeps the turn running
   * and saves it, so ask for the saved answer until it is there; coming back to the page asks at once.
   */
  async function recover(attempt: Attempt) {
    const notice = (n: { kind: "recovering" | "lost"; text: string } | undefined) => updateAssistant((a) => void ((a.notice = n), (a.error = undefined)));
    notice({ kind: "recovering", text: CONNECTION_DROPPED });
    const began = Date.now();
    let saved = false;
    while (!stoppedRef.current && aliveRef.current && Date.now() - began < RECOVER_MS) {
      try {
        const snap = await snapshotOf(attempt.id);
        if (snap) {
          saved = snap.state !== "unknown";
          if (snap.state === "finished") {
            adoptSaved(snap);
            return;
          }
          // Saved but the server stopped working on it: no point waiting.
          if (snap.state === "stalled") break;
        }
      } catch {
        /* offline for now; keep trying */
      }
      if (!saved && Date.now() - began > UNSAVED_MS) break;
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, POLL_MS);
        pokeRef.current = () => (clearTimeout(t), resolve());
      });
    }
    pokeRef.current = null;
    if (stoppedRef.current) return void updateAssistant((a) => void ((a.notice = undefined), (a.error = "Stopped.")));
    notice({ kind: "lost", text: saved ? ANSWER_LOST : MESSAGE_LOST });
  }

  function tryAgain() {
    const attempt = attemptRef.current;
    if (!attempt || busy || refreshing) return;
    // Drop the failed attempt's two bubbles. The same id goes to the server again, which never runs a send twice:
    // if it already has the answer you get that answer, if it is still working you wait for it.
    setMessages((m) => m.slice(0, -2));
    void send(attempt.text, attempt);
  }

  function stop() {
    stoppedRef.current = true;
    const conv = turnConvRef.current;
    if (conv)
      void fetch("/api/jarvis/chat/stop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientMessageId: conv }),
      }).catch(() => undefined);
    abortRef.current?.abort();
    pokeRef.current?.();
  }

  async function send(text: string, again?: Attempt) {
    const message = text.trim();
    const ready = again ? again.attachments : pending.filter((p) => !p.uploading && !p.error);
    if ((!message && !ready.length) || busy || refreshing || !availability.available) return;
    setInput("");
    setPending([]);
    setBusy(true);
    setLastTool(null);
    stoppedRef.current = false;
    takeoverRef.current = false;
    // Every send has an id of its own: it finds the answer again after a drop, makes a retry safe and is what Stop points at.
    const id = again?.id ?? newId();
    const attempt: Attempt = { id, text: message, attachments: ready };
    attemptRef.current = attempt;
    turnConvRef.current = id;
    const userMsg: UiMessage = { id: `u-${Date.now()}`, role: "user", text: message, attachments: ready };
    setMessages((m) => [...m, userMsg, { id: `a-${Date.now()}`, role: "assistant", text: "", tools: [], confirmations: [], memories: [], streaming: true }]);
    const controller = new AbortController();
    abortRef.current = controller;
    let mutated = false;
    let finished = false;
    let plain: string | null = null;
    // Coming back to a page whose stream went quiet: if the server already has the answer, take it and drop the dead stream.
    pokeRef.current = () => {
      void snapshotOf(id)
        .then((snap) => {
          if (snap?.state === "finished") {
            takeoverRef.current = true;
            controller.abort();
          }
        })
        .catch(() => undefined);
    };
    try {
      const res = await fetch("/api/jarvis/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId,
          clientMessageId: id,
          message,
          module,
          attachmentIds: ready.map((a) => a.id),
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        // Only messages the server wrote for people are shown; anything else is treated as a dropped connection.
        if (res.status === 401) plain = "Please sign in again to keep going.";
        else if ([402, 403, 429, 503].includes(res.status)) {
          const words = await serverWords(res, "");
          if (words) plain = words;
        }
        if (plain) throw new PlainError(plain);
        throw new Error("dropped");
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
          const ev = JSON.parse(line) as ServerEvent;
          switch (ev.type) {
            case "conversation":
              if (!conversationId) {
                setConversationId(ev.id);
                onConversation?.(ev.id, ev.title);
                if (!compact) window.history.replaceState(null, "", `/jarvis/${ev.id}`);
              }
              break;
            case "already":
              // The server had this send already (a retry): it fetches the saved answer instead of running again.
              break;
            case "text":
              updateAssistant((a) => void (a.text += ev.delta));
              break;
            case "tool_start":
              setLastTool(ev.name);
              // Anything said before a tool is narration ("Let me check…"); only the final answer stays.
              updateAssistant((a) => {
                a.text = "";
                a.tools.push({ callId: ev.callId, name: ev.name, label: ev.label, status: "running" });
              });
              break;
            case "tool_end":
              if (ev.ok) mutated = true;
              updateAssistant((a) => {
                const t = a.tools.findIndex((x) => x.callId === ev.callId);
                if (t >= 0) a.tools[t] = { ...a.tools[t], status: ev.ok ? "ok" : "error", summary: ev.summary, viewAt: ev.viewAt, sources: ev.sources };
              });
              break;
            case "confirmation":
              updateAssistant((a) => {
                a.tools = a.tools.filter((x) => x.callId !== ev.callId);
                a.confirmations.push({ actionId: ev.actionId, summary: ev.summary, status: "pending" });
              });
              break;
            case "memory_proposal":
              updateAssistant((a) => void a.memories.push({ memoryId: ev.memoryId, content: ev.content, replaces: ev.replaces, status: "proposed" }));
              break;
            case "error":
              updateAssistant((a) => void (a.error = ev.message));
              break;
            case "done":
              finished = true;
              updateAssistant((a) => void (a.runId = ev.runId ?? null));
              break;
          }
        }
      }
      // The stream ended without its last event: the answer may still be coming, so go and get it.
      if (!finished) await recover(attempt);
    } catch (e) {
      if (e instanceof PlainError) updateAssistant((a) => void (a.error = e.message));
      else if (stoppedRef.current) updateAssistant((a) => void (a.error = "Stopped."));
      else if (!finished || takeoverRef.current) await recover(attempt);
    } finally {
      pokeRef.current = null;
      updateAssistant((a) => void (a.streaming = false));
      setBusy(false);
      abortRef.current = null;
      if (mutated) {
        // their skyling hops: something got done
        cheerSkylings();
        startRefresh(() => router.refresh());
      }
    }
  }

  async function decide(actionId: string, decision: "confirm" | "cancel") {
    setMessages((prev) =>
      prev.map((m) =>
        m.role === "assistant"
          ? { ...m, confirmations: m.confirmations.map((c) => (c.actionId === actionId ? { ...c, status: "pending", resultText: "Working…" } : c)) }
          : m,
      ),
    );
    type Outcome = { status?: "executed" | "cancelled" | "failed" | "expired" | "pending" | "running"; message?: string; error?: string };
    const post = await fetch(`/api/jarvis/actions/${actionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    }).catch(() => null);
    let data: Outcome = (await jsonOf<Outcome>(post)) ?? {};
    const refusal = post && !post.ok ? await serverWords(post, "") : "";
    if (!post) {
      // The answer was lost on the way back, but the action may well have run: look at where it stands.
      for (let i = 0; i < 5 && !data.status; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const now = await fetch(`/api/jarvis/actions/${actionId}`, { cache: "no-store" }).catch(() => null);
        const seen = now?.ok ? await jsonOf<Outcome>(now) : null;
        if (seen?.status && seen.status !== "pending" && seen.status !== "running") data = seen;
        else if (seen?.status === "pending") {
          // It did not run: the buttons come back.
          setMessages((prev) =>
            prev.map((m) =>
              m.role === "assistant"
                ? { ...m, confirmations: m.confirmations.map((c) => (c.actionId === actionId ? { ...c, status: "pending", resultText: undefined } : c)) }
                : m,
            ),
          );
          return;
        }
      }
    }
    const fallback = data.status ? undefined : "Couldn't check whether that went through. Reload to see where it stands.";
    setMessages((prev) =>
      prev.map((m) =>
        m.role === "assistant"
          ? {
              ...m,
              confirmations: m.confirmations.map((c) =>
                c.actionId === actionId
                  ? {
                      ...c,
                      status: data.status === "pending" || data.status === "running" || !data.status ? "failed" : data.status,
                      resultText: refusal || (post?.ok ? data.message : undefined) || fallback || "That didn't go through. Try again.",
                    }
                  : c,
              ),
            }
          : m,
      ),
    );
    if (data.status === "executed") {
      cheerSkylings();
      startRefresh(() => router.refresh());
    }
  }

  async function decideMemory(memoryId: string, decision: "keep" | "dismiss") {
    const patch = (fn: (m: UiMemorySuggestion) => UiMemorySuggestion) =>
      setMessages((prev) =>
        prev.map((m) =>
          m.role === "assistant" && m.memories.some((x) => x.memoryId === memoryId)
            ? { ...m, memories: m.memories.map((x) => (x.memoryId === memoryId ? fn(x) : x)) }
            : m,
        ),
      );
    patch((x) => ({ ...x, status: decision === "keep" ? "saved" : "dismissed", error: undefined })); // optimistic
    const res = await fetch(`/api/jarvis/memories/${memoryId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    }).catch(() => null);
    if (!res?.ok) {
      const words = await serverWords(res, "Couldn't save your choice. Try again.");
      patch((x) => ({ ...x, status: "proposed", error: words }));
    }
  }

  async function upload(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files).slice(0, 5)) {
      const tempId = `tmp-${file.name}-${Date.now()}`;
      setPending((p) => [...p, { id: tempId, filename: file.name, mimeType: file.type, uploading: true }]);
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/api/attachments", { method: "POST", body: fd });
        if (!res.ok) throw new PlainError(await serverWords(res, "Couldn't upload that file. Try again."));
        const data = await jsonOf<{ id: string; filename: string; mimeType: string }>(res);
        if (!data) throw new Error("bad reply");
        setPending((p) => p.map((x) => (x.id === tempId ? { id: data.id, filename: data.filename, mimeType: data.mimeType } : x)));
      } catch (e) {
        setPending((p) =>
          p.map((x) =>
            x.id === tempId
              ? {
                  ...x,
                  uploading: false,
                  error: e instanceof PlainError ? e.message : "Couldn't upload. Check your connection and try again.",
                }
              : x,
          ),
        );
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  const empty = messages.length === 0;
  const lastQuestion = [...messages].reverse().find((m) => m.role === "user");
  const followUps =
    busy || refreshing || empty || messages.at(-1)?.role !== "assistant"
      ? undefined
      : ((lastTool && FOLLOW_UPS[lastTool]) ?? defaultFollowUps(module, lastQuestion?.text));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} data-chat-scroll className={cn("min-h-0 flex-1 overflow-y-auto", compact ? "px-4" : "px-4 sm:px-8")} aria-live="polite">
        <div className={cn("mx-auto flex w-full flex-col gap-5 py-6", !compact && "max-w-3xl")}>
          {!availability.available && (
            <div className="flex gap-3 rounded-2xl bg-warning-soft p-4 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">{nameAtStart(assistantName)} isn&apos;t available right now.</p>
                <p className="mt-1 opacity-90">Everything else in LifeFlow works as usual.</p>
              </div>
            </div>
          )}
          {empty && (
            <div className="animate-rise flex flex-col items-center text-center">
              {/* their skyling in its corner of the real sky, saying the catchphrase with its name beside it (owner, 2026-11-10:
                  "Let's clear your sky."; never put into the prompt as a script). Tap it and it hops. */}
              <SkyWindow tz={tz} className={cn("w-full rounded-[2rem] text-left", compact ? "h-36" : "h-44 sm:h-52")}>
                <div className="absolute bottom-0 left-[4%] flex flex-col items-center sm:left-[10%]">
                  <SkylingSprite
                    companion={skyling}
                    className={cn("relative z-10 -mb-2 cursor-pointer", compact ? "h-16 w-16" : "h-20 w-20 sm:h-24 sm:w-24")}
                  />
                  <PixelArt art={CLOUD} className={cn("-mb-1", compact ? "w-24" : "w-28 sm:w-40")} />
                </div>
                <div className="lf-speech absolute top-1/2 right-4 left-[38%] -translate-y-[38%] px-3.5 py-3 sm:right-[8%] sm:left-[40%] sm:px-5 sm:py-4">
                  <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-dawn-3 uppercase">{assistantName}</p>
                  <h2
                    className={cn(
                      "mt-0.5 font-display leading-[1.1] font-medium tracking-tight",
                      compact ? "text-[1.25rem]" : "text-[1.4375rem] sm:text-[2rem]",
                    )}
                  >
                    Let&apos;s clear your sky.
                  </h2>
                </div>
              </SkyWindow>
              {!aiConsent ? (
                <AiConsentCard name={assistantName} />
              ) : ideas?.length ? (
                // the skyling's speech bubble and these clouds are the whole surface: a tap fills the box, never sends
                <IdeaClouds
                  clouds={ideas}
                  show={3}
                  onPick={(ask) => {
                    setInput(ask);
                    inputRef.current?.focus();
                  }}
                  className="mt-5 justify-center"
                />
              ) : (
                <div className="-mx-4 mt-4 flex w-[calc(100%+2rem)] snap-x scroll-px-4 gap-2.5 overflow-x-auto px-4 pt-1 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:w-full sm:grid-cols-4 sm:overflow-visible sm:px-0">
                  {starterCards(module).map(({ icon: Icon, title, prompt }) => (
                    <button
                      key={title}
                      onClick={() => (prompt.endsWith("…") ? (setInput(prompt.replace("…", "")), inputRef.current?.focus()) : send(prompt))}
                      disabled={!canSend}
                      className="lf-hop flex min-h-[86px] w-[42%] min-w-[150px] shrink-0 snap-start flex-col items-start justify-between gap-2.5 rounded-[1.375rem] bg-surface p-3.5 text-left shadow-soft ring-1 ring-border/60 hover:shadow-lift disabled:opacity-50 sm:w-auto sm:min-w-0"
                    >
                      <span className="lf-chip-night h-9 w-9 rounded-[0.75rem]">
                        <Icon className="h-4 w-4" strokeWidth={2.2} />
                      </span>
                      <span className="text-[0.9375rem] leading-snug font-medium text-text">{title}</span>
                    </button>
                  ))}
                </div>
              )}
              {aiConsent && connect && connect.length > 0 && (
                <Link
                  href="/settings/integrations"
                  className="lf-hop mt-3 flex w-full items-center gap-3 rounded-[1.25rem] bg-surface-2/70 px-4 py-3 text-left hover:bg-surface-2"
                >
                  <span className="lf-chip-night h-8 w-8 shrink-0 rounded-[0.625rem]">
                    <Plug className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-[0.875rem] leading-snug text-text-2">
                    <span className="font-medium text-text">Connect me to do more.</span> Add {listOf(connect)} so I can plan around your real life.
                  </span>
                </Link>
              )}
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <UserBubble key={m.id} m={m} />
            ) : (
              <AssistantBubble key={m.id} m={m} last={i === messages.length - 1} onDecide={decide} onMemory={decideMemory} onRetry={tryAgain} />
            ),
          )}
          {!aiConsent && !empty && <AiConsentCard name={assistantName} />}
          {followUps && aiConsent && (
            <div className="flex flex-wrap gap-2">
              {followUps.map((f) => (
                <button
                  key={f}
                  onClick={() => send(f)}
                  className="lf-hop min-h-11 rounded-[0.9375rem] bg-surface px-4 py-2 text-[0.875rem] font-medium text-text-2 shadow-soft ring-1 ring-border/60 hover:text-text"
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={cn("bg-gradient-to-t from-bg via-bg to-bg/0 pt-4 pb-3 md:bg-none", compact ? "px-4" : "px-4 sm:px-8")}>
        <div className={cn("mx-auto", !compact && "max-w-3xl")}>
          {pending.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {pending.map((p) => (
                <span
                  key={p.id}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs shadow-soft",
                    p.error ? "bg-danger-soft text-danger" : "bg-surface text-text-2",
                  )}
                >
                  {p.uploading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : p.mimeType.startsWith("image/") ? (
                    <ImageIcon className="h-3 w-3" />
                  ) : (
                    <FileText className="h-3 w-3" />
                  )}
                  <span className="max-w-40 truncate">{p.filename}</span>
                  {p.error && <span>· {p.error}</span>}
                  <button onClick={() => setPending((x) => x.filter((y) => y.id !== p.id))} aria-label={`Remove ${p.filename}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {talking ? (
            <LiveVoice
              module={module}
              assistantName={assistantName}
              conversationId={conversationId}
              onConversation={(id) => {
                if (conversationId) return;
                setConversationId(id);
                onConversation?.(id, `Talking with ${assistantName}`);
                if (!compact) window.history.replaceState(null, "", `/jarvis/${id}`);
              }}
              onLine={(role, text) =>
                setMessages((m) => [
                  ...m,
                  role === "user"
                    ? { id: `v-${Date.now()}`, role: "user", text, attachments: [] }
                    : { id: `v-${Date.now()}`, role: "assistant", text, tools: [], confirmations: [], memories: [] },
                ])
              }
              onTool={() => undefined}
              onConfirmation={(actionId, summary) =>
                setMessages((m) => [
                  ...m,
                  { id: `c-${actionId}`, role: "assistant", text: "", tools: [], confirmations: [{ actionId, summary, status: "pending" }], memories: [] },
                ])
              }
              onEnd={(error) => {
                setTalking(false);
                if (error)
                  setMessages((m) => [...m, { id: `e-${Date.now()}`, role: "assistant", text: "", tools: [], confirmations: [], memories: [], error }]);
              }}
            />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="lf-composer flex items-end gap-1 rounded-[1.5rem] bg-surface p-2 shadow-lift ring-1 ring-border/70 transition-shadow focus-within:ring-2 focus-within:ring-dawn-2/60"
            >
              <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => upload(e.target.files)} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-40"
                aria-label="Attach a file or screenshot"
                title="Attach a screenshot, syllabus or text file"
                disabled={!canSend}
              >
                <Paperclip className="h-[18px] w-[18px]" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                onPaste={(e) => {
                  if (e.clipboardData.files.length) {
                    e.preventDefault();
                    upload(e.clipboardData.files);
                  }
                }}
                rows={1}
                placeholder={
                  !availability.available
                    ? `${nameAtStart(assistantName)} isn't available right now`
                    : aiConsent
                      ? `Message ${assistantName}…`
                      : `Allow ${assistantName} to start`
                }
                disabled={!canSend}
                readOnly={refreshing}
                aria-busy={refreshing || undefined}
                aria-label={`Message ${assistantName}`}
                className="max-h-48 min-h-11 flex-1 resize-none bg-transparent px-1.5 py-2.5 text-[1rem] leading-6 placeholder:text-muted [field-sizing:content]"
              />
              {!busy && <VoiceButton assistantName={assistantName} disabled={!canSend || refreshing} onStart={() => setTalking(true)} />}
              {busy ? (
                <button type="button" onClick={stop} className="lf-chip-night h-11 w-11 shrink-0 rounded-[0.875rem]" aria-label="Stop">
                  <Square className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canSend || refreshing || (!input.trim() && !pending.some((p) => !p.uploading && !p.error))}
                  className="lf-send flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.875rem]"
                  aria-label="Send"
                >
                  <PixelIcon name="send" className="h-[18px] w-[18px]" />
                </button>
              )}
            </form>
          )}
          <p className="lf-chat-note mt-2 text-center text-[0.6875rem] text-muted/80">
            {nameAtStart(assistantName)} tells you everything it changes. Deletions always ask first.
          </p>
        </div>
      </div>
    </div>
  );
}

function UserBubble({ m }: { m: Extract<UiMessage, { role: "user" }> }) {
  return (
    <div className="animate-fade-in flex justify-end">
      <div className="lf-bubble-me max-w-[85%] rounded-[1.375rem] rounded-br-[0.375rem] px-4 py-3 text-[1rem] leading-relaxed whitespace-pre-wrap">
        {m.text}
        {m.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m.attachments.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-0.5 text-xs">
                {a.mimeType.startsWith("image/") ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                {a.filename}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AssistantBubble({
  m,
  last,
  onDecide,
  onMemory,
  onRetry,
}: {
  m: Extract<UiMessage, { role: "assistant" }>;
  /** The newest reply's skyling stays awake (blinks, hops when something gets done); older ones are still pictures. */
  last?: boolean;
  onRetry: () => void;
  onDecide: (id: string, d: "confirm" | "cancel") => void;
  onMemory: (memoryId: string, d: "keep" | "dismiss") => void;
}) {
  const { skyling } = useShell();
  const working = m.streaming && !m.text;
  const runningTool = [...m.tools].reverse().find((t) => t.status === "running")?.name;
  return (
    <div className="animate-fade-in flex gap-3">
      {/* their skyling, walking while it works */}
      <span className="lf-chip-night mt-0.5 h-9 w-9 shrink-0 overflow-hidden rounded-[0.75rem]">
        <SkylingSprite companion={skyling} busy={!!m.streaming} still={!m.streaming && !last} className="h-8 w-8 translate-y-[3px]" />
      </span>
      <div className="min-w-0 flex-1 space-y-2.5">
        {working && <JarvisStatus word={statusWord(runningTool)} />}
        {m.text && <Markdown text={m.text} />}
        <SourceList tools={m.tools} />
        <OpenLinks tools={m.tools} />
        {m.notice && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-text-2" role="status">
            {m.notice.kind === "recovering" && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
            <span className="min-w-0 flex-1">{m.notice.text}</span>
            {m.notice.kind === "lost" && (
              <button type="button" onClick={onRetry} className="lf-sb lf-sb-sun lf-sb-sm">
                Try again
              </button>
            )}
          </div>
        )}
        {!m.streaming && m.runId && m.text && <RateAnswer runId={m.runId} initial={m.rating ?? null} />}
        {m.confirmations.map((c) => (
          <div key={c.actionId} className="rounded-2xl bg-surface p-4 shadow-soft">
            <p className="text-[0.9375rem] font-medium">{c.summary.split("\n")[0]}</p>
            {c.summary.includes("\n") && (
              <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-surface-2 p-3 text-[0.8125rem] text-text-2">
                {c.summary.slice(c.summary.indexOf("\n")).trim()}
              </p>
            )}
            {c.status === "pending" && !c.resultText ? (
              <div className="mt-3 flex gap-2">
                <button onClick={() => onDecide(c.actionId, "confirm")} className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-white">
                  Confirm
                </button>
                <button onClick={() => onDecide(c.actionId, "cancel")} className="lf-sb lf-sb-app lf-sb-sm">
                  Cancel
                </button>
              </div>
            ) : (
              <p className={cn("mt-1.5 text-[0.8125rem]", c.status === "executed" ? "text-success" : c.status === "pending" ? "text-muted" : "text-text-2")}>
                {c.status === "executed"
                  ? "✓ Done"
                  : c.status === "cancelled"
                    ? "Cancelled. Nothing changed"
                    : c.status === "expired"
                      ? "Expired. Nothing changed"
                      : c.resultText}
              </p>
            )}
          </div>
        ))}
        {m.memories.map((s) => (
          <MemoryCard key={s.memoryId} s={s} onDecide={onMemory} />
        ))}
        {m.error && (
          <div className="flex gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {m.error}
          </div>
        )}
      </div>
    </div>
  );
}

function MemoryCard({ s, onDecide }: { s: UiMemorySuggestion; onDecide: (memoryId: string, d: "keep" | "dismiss") => void }) {
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-soft" aria-label="Memory suggestion">
      <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-accent">
        <Brain className="h-3.5 w-3.5" /> {s.replaces ? "Update what I remember?" : "Remember this for next time?"}
      </p>
      {s.replaces && <p className="mt-2 text-sm text-muted line-through">{s.replaces}</p>}
      <p className="mt-1 text-[0.9375rem]">{s.content}</p>
      {s.status === "proposed" ? (
        <>
          <div className="mt-3 flex gap-2">
            <button onClick={() => onDecide(s.memoryId, "keep")} className="lf-sb lf-sb-sun lf-sb-sm">
              Keep
            </button>
            <button onClick={() => onDecide(s.memoryId, "dismiss")} className="lf-sb lf-sb-app lf-sb-sm">
              Not now
            </button>
          </div>
          {s.error && <p className="mt-2 text-[0.8125rem] text-danger">{s.error}</p>}
        </>
      ) : (
        <p className={cn("mt-2 text-[0.8125rem]", s.status === "saved" ? "text-success" : "text-muted")}>
          {s.status === "saved" ? "✓ Saved to memory" : s.status === "dismissed" ? "Not saved" : "Removed from memory"}
          {" · "}
          <Link href="/jarvis/memory" className="underline-offset-2 hover:underline">
            Manage memory
          </Link>
        </p>
      )}
    </div>
  );
}

/** "Open Work": where a change can be seen, as a real link (tools return the place as viewAt). */
function OpenLinks({ tools }: { tools: UiTool[] }) {
  const seen = new Set<string>();
  const places = tools.flatMap((t) => (t.status === "ok" && t.viewAt && isAppPath(t.viewAt) && !seen.has(t.viewAt) && !!seen.add(t.viewAt) ? [t.viewAt] : []));
  if (!places.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {places.slice(0, 3).map((href) => (
        <Link key={href} href={href} className="lf-sb lf-sb-app lf-sb-sm">
          Open {viewAtName(href)}
        </Link>
      ))}
    </div>
  );
}

/** Every page a web search read for this answer, as small links under it. */
function SourceList({ tools }: { tools: UiTool[] }) {
  const seen = new Set<string>();
  const sources = tools.flatMap((t) => t.sources ?? []).filter((s) => !seen.has(s.url) && !!seen.add(s.url));
  if (!sources.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Sources">
      <span className="text-xs text-muted">Sources</span>
      {sources.slice(0, 8).map((s) => {
        let host = s.url;
        try {
          host = new URL(s.url).hostname.replace(/^www\./, "");
        } catch {}
        return (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={s.title}
            className="lf-sb lf-sb-app lf-sb-xs max-w-[14rem] truncate lf-touch"
          >
            {host}
          </a>
        );
      })}
    </div>
  );
}

/** 👍 / 👎 on an answer. Logged on the run (and its skills) so weak answers can be found and fixed. */
function RateAnswer({ runId, initial }: { runId: string; initial: 1 | -1 | null }) {
  const [rating, setRating] = useState(initial);
  const rate = (r: 1 | -1) => {
    const next = rating === r ? null : r;
    setRating(next);
    void rateRunAction(runId, next);
  };
  return (
    <div className="flex items-center gap-1 text-muted">
      <button
        type="button"
        aria-label="Good answer"
        aria-pressed={rating === 1}
        onClick={() => rate(1)}
        className={cn("tap flex items-center justify-center rounded-full", rating === 1 && "text-accent")}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Bad answer"
        aria-pressed={rating === -1}
        onClick={() => rate(-1)}
        className={cn("tap flex items-center justify-center rounded-full", rating === -1 && "text-danger")}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const ICONS = [CalendarDays, GraduationCap, Wallet, Repeat];
/** Four starting points; the home screen gets ones that show what Jarvis can do across your life. */
function starterCards(module: JarvisModule) {
  if (module === "home")
    return [
      { icon: CalendarDays, title: "Plan my day", prompt: "What do I need to get done today? Plan it around my classes and shifts." },
      { icon: GraduationCap, title: "What's due this week?", prompt: "What's due this week, and what should I start first?" },
      { icon: Wallet, title: "Where's my money going?", prompt: "Where is my money going this month?" },
      { icon: Repeat, title: "Find my subscriptions", prompt: "What subscriptions am I paying for?" },
    ];
  return STARTERS[module].slice(0, 4).map((prompt, i) => ({ icon: ICONS[i % ICONS.length], title: prompt, prompt }));
}

const listOf = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
