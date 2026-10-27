"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowUp, Check, CircleAlert, FileText, ImageIcon, Loader2, Paperclip, Sparkles, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";
import { FOLLOW_UPS, STARTERS } from "./suggestions";
import type { JarvisAvailability, JarvisModule, UiAttachment, UiMessage } from "./types";

type ServerEvent =
  | { type: "conversation"; id: string; title: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; callId: string; name: string; label: string }
  | { type: "tool_end"; callId: string; name: string; ok: boolean; summary: string; viewAt?: string }
  | { type: "confirmation"; actionId: string; callId: string; toolName: string; summary: string }
  | { type: "done"; messageId: string | null }
  | { type: "error"; message: string };

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,text/plain,text/csv,text/markdown,application/json,.md,.csv,.txt";

export function JarvisChat({
  conversationId: initialId,
  initialMessages = [],
  module,
  availability,
  compact,
  initialPrompt,
  onConversation,
}: {
  conversationId?: string | null;
  initialMessages?: UiMessage[];
  module: JarvisModule;
  availability: JarvisAvailability;
  compact?: boolean;
  initialPrompt?: string;
  onConversation?: (id: string, title: string) => void;
}) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState(initialId ?? null);
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages);
  const [input, setInput] = useState(initialPrompt ?? "");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<(UiAttachment & { uploading?: boolean; error?: string })[]>([]);
  const [lastTool, setLastTool] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: messages.length > 2 ? "smooth" : "auto" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const updateAssistant = useCallback((fn: (m: Extract<UiMessage, { role: "assistant" }>) => void) => {
    setMessages((prev) => {
      const next = [...prev];
      const i = next.length - 1;
      if (i < 0 || next[i].role !== "assistant") return prev;
      const copy = { ...(next[i] as Extract<UiMessage, { role: "assistant" }>) };
      copy.tools = [...copy.tools];
      copy.confirmations = [...copy.confirmations];
      fn(copy);
      next[i] = copy;
      return next;
    });
  }, []);

  async function send(text: string) {
    const message = text.trim();
    const ready = pending.filter((p) => !p.uploading && !p.error);
    if ((!message && !ready.length) || busy || !availability.available) return;
    setInput("");
    setPending([]);
    setBusy(true);
    setLastTool(null);
    const userMsg: UiMessage = { id: `u-${Date.now()}`, role: "user", text: message, attachments: ready };
    setMessages((m) => [...m, userMsg, { id: `a-${Date.now()}`, role: "assistant", text: "", tools: [], confirmations: [], streaming: true }]);
    const controller = new AbortController();
    abortRef.current = controller;
    let mutated = false;
    try {
      const res = await fetch("/api/jarvis/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, message, module, attachmentIds: ready.map((a) => a.id) }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
        throw new Error(err.error ?? `Request failed (${res.status})`);
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
            case "text":
              updateAssistant((a) => void (a.text += ev.delta));
              break;
            case "tool_start":
              setLastTool(ev.name);
              updateAssistant((a) => void a.tools.push({ callId: ev.callId, name: ev.name, label: ev.label, status: "running" }));
              break;
            case "tool_end":
              if (ev.ok) mutated = true;
              updateAssistant((a) => {
                const t = a.tools.findIndex((x) => x.callId === ev.callId);
                if (t >= 0) a.tools[t] = { ...a.tools[t], status: ev.ok ? "ok" : "error", summary: ev.summary, viewAt: ev.viewAt };
              });
              break;
            case "confirmation":
              updateAssistant((a) => {
                a.tools = a.tools.filter((x) => x.callId !== ev.callId);
                a.confirmations.push({ actionId: ev.actionId, summary: ev.summary, status: "pending" });
              });
              break;
            case "error":
              updateAssistant((a) => void (a.error = ev.message));
              break;
            case "done":
              break;
          }
        }
      }
    } catch (e) {
      const aborted = (e as Error).name === "AbortError";
      updateAssistant((a) => void (a.error = aborted ? "Stopped." : (e as Error).message || "Network error"));
    } finally {
      updateAssistant((a) => void (a.streaming = false));
      setBusy(false);
      abortRef.current = null;
      if (mutated) router.refresh();
    }
  }

  async function decide(actionId: string, decision: "confirm" | "cancel") {
    setMessages((prev) =>
      prev.map((m) => (m.role === "assistant" ? { ...m, confirmations: m.confirmations.map((c) => (c.actionId === actionId ? { ...c, status: "pending", resultText: "Working…" } : c)) } : m)),
    );
    const res = await fetch(`/api/jarvis/actions/${actionId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
    const data = (await res.json().catch(() => ({}))) as { status?: "executed" | "cancelled" | "failed" | "expired"; message?: string; error?: string };
    setMessages((prev) =>
      prev.map((m) =>
        m.role === "assistant"
          ? { ...m, confirmations: m.confirmations.map((c) => (c.actionId === actionId ? { ...c, status: data.status ?? "failed", resultText: data.message ?? data.error } : c)) }
          : m,
      ),
    );
    if (data.status === "executed") router.refresh();
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
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        setPending((p) => p.map((x) => (x.id === tempId ? { id: data.id, filename: data.filename, mimeType: data.mimeType } : x)));
      } catch (e) {
        setPending((p) => p.map((x) => (x.id === tempId ? { ...x, uploading: false, error: (e as Error).message } : x)));
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  const empty = messages.length === 0;
  const followUps = !busy && lastTool ? FOLLOW_UPS[lastTool] : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className={cn("min-h-0 flex-1 overflow-y-auto", compact ? "px-4" : "px-4 sm:px-8")} aria-live="polite">
        <div className={cn("mx-auto flex w-full flex-col gap-5 py-6", !compact && "max-w-3xl")}>
          {!availability.available && (
            <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Jarvis isn&apos;t connected to an AI model yet.</p>
                <p className="mt-1 opacity-90">{availability.reason} See README → “Configure Jarvis”. Everything else in BudgetFlow works without it.</p>
              </div>
            </div>
          )}
          {empty && (
            <div className="animate-fade-in pt-6">
              <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Sparkles className="h-5 w-5" />
              </div>
              <h2 className="mt-3 font-display text-2xl font-medium">How can I help?</h2>
              <p className="mt-1 text-sm text-muted">I can read and update your tasks, schedule, courses, work and finances — and I&apos;ll show you exactly what I changed.</p>
              <div className="mt-5 flex flex-col gap-2">
                {STARTERS[module].map((s) => (
                  <button
                    key={s}
                    onClick={() => (s.endsWith("…") ? (setInput(s.replace("…", "")), inputRef.current?.focus()) : send(s))}
                    disabled={!availability.available}
                    className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-left text-sm text-text-2 transition-colors hover:border-border-strong hover:text-text disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (m.role === "user" ? <UserBubble key={m.id} m={m} /> : <AssistantBubble key={m.id} m={m} onDecide={decide} />))}
          {followUps && (
            <div className="flex flex-wrap gap-2">
              {followUps.map((f) => (
                <button key={f} onClick={() => send(f)} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-2 hover:border-accent hover:text-accent">
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={cn("border-t border-border bg-bg/95 pt-3 pb-3 backdrop-blur", compact ? "px-4" : "px-4 sm:px-8")}>
        <div className={cn("mx-auto", !compact && "max-w-3xl")}>
          {pending.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {pending.map((p) => (
                <span key={p.id} className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs", p.error ? "border-danger/40 text-danger" : "border-border bg-surface text-text-2")}>
                  {p.uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : p.mimeType.startsWith("image/") ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                  <span className="max-w-40 truncate">{p.filename}</span>
                  {p.error && <span>· {p.error}</span>}
                  <button onClick={() => setPending((x) => x.filter((y) => y.id !== p.id))} aria-label={`Remove ${p.filename}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-soft focus-within:border-accent"
          >
            <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => upload(e.target.files)} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
              aria-label="Attach a file or screenshot"
              title="Attach a screenshot, syllabus or text file"
              disabled={!availability.available}
            >
              <Paperclip className="h-4 w-4" />
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
              placeholder={availability.available ? "Ask Jarvis anything, or paste assignment details…" : "Jarvis is not configured"}
              disabled={!availability.available}
              aria-label="Message Jarvis"
              className="max-h-48 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] placeholder:text-muted focus:outline-none focus-visible:outline-none [field-sizing:content]"
            />
            {busy ? (
              <button type="button" onClick={() => abortRef.current?.abort()} className="rounded-xl bg-surface-3 p-2.5 text-text" aria-label="Stop">
                <Square className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!availability.available || (!input.trim() && !pending.some((p) => !p.uploading && !p.error))}
                className="rounded-xl bg-accent p-2.5 text-accent-text transition-opacity disabled:opacity-30"
                aria-label="Send"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </form>
          <p className="mt-1.5 text-center text-[11px] text-muted">Jarvis can make mistakes. It always shows what it changed; deletions need your confirmation.</p>
        </div>
      </div>
    </div>
  );
}

function UserBubble({ m }: { m: Extract<UiMessage, { role: "user" }> }) {
  return (
    <div className="animate-fade-in flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-surface-3 px-4 py-2.5 text-[14.5px] whitespace-pre-wrap text-text">
        {m.text}
        {m.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m.attachments.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-xs text-text-2">
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

function AssistantBubble({ m, onDecide }: { m: Extract<UiMessage, { role: "assistant" }>; onDecide: (id: string, d: "confirm" | "cancel") => void }) {
  const thinking = m.streaming && !m.text && m.tools.every((t) => t.status !== "running");
  return (
    <div className="animate-fade-in flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        {m.tools.length > 0 && (
          <ul className="flex flex-col gap-1">
            {m.tools.map((t) => (
              <li key={t.callId} className="flex items-center gap-2 text-[13px]">
                {t.status === "running" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
                ) : t.status === "ok" ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <CircleAlert className="h-3.5 w-3.5 text-danger" />
                )}
                <span className="text-text-2">{t.label}</span>
                {t.summary && t.summary !== "Done" && <span className={cn("truncate", t.status === "error" ? "text-danger" : "text-muted")}>— {t.summary}</span>}
                {t.viewAt && t.status === "ok" && (
                  <Link href={t.viewAt} className="shrink-0 text-accent hover:underline">
                    View
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        {thinking && (
          <div className="flex items-center gap-1.5 py-1 text-muted" aria-label="Jarvis is thinking">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
          </div>
        )}
        {m.text && <Markdown text={m.text} />}
        {m.confirmations.map((c) => (
          <div key={c.actionId} className="rounded-xl border border-border bg-surface p-3.5">
            <p className="text-sm font-medium">{c.summary}</p>
            {c.status === "pending" && !c.resultText ? (
              <div className="mt-3 flex gap-2">
                <button onClick={() => onDecide(c.actionId, "confirm")} className="rounded-lg bg-danger px-3 py-1.5 text-[13px] font-medium text-white">
                  Confirm
                </button>
                <button onClick={() => onDecide(c.actionId, "cancel")} className="rounded-lg border border-border px-3 py-1.5 text-[13px]">
                  Cancel
                </button>
              </div>
            ) : (
              <p className={cn("mt-1.5 text-[13px]", c.status === "executed" ? "text-success" : c.status === "pending" ? "text-muted" : "text-text-2")}>
                {c.status === "executed" ? "✓ Done" : c.status === "cancelled" ? "Cancelled — nothing changed" : c.status === "expired" ? "Expired — nothing changed" : c.resultText}
              </p>
            )}
          </div>
        ))}
        {m.error && (
          <div className="flex gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {m.error}
          </div>
        )}
      </div>
    </div>
  );
}
