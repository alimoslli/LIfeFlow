"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AudioLines, Check, CircleAlert, Loader2, Mic, MicOff, PhoneOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { gsap, prefersReducedMotion } from "../motion/gsap";
import type { JarvisModule } from "./types";

type Phase = "connecting" | "listening" | "thinking" | "speaking" | "ended" | "error";
type Line = { id: string; role: "user" | "assistant"; text: string };
type ToolChip = { callId: string; label: string; ok?: boolean; summary?: string; viewAt?: string };
type Confirm = { actionId: string; summary: string; status: "pending" | "done" | "cancelled" | "failed" };

const REALTIME_URL = "https://api.openai.com/v1/realtime/calls";

/** Mic button that starts a live voice conversation with the assistant. */
export function VoiceButton({
  module,
  assistantName,
  disabled,
  className,
}: {
  module: JarvisModule;
  assistantName: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label={`Talk to ${assistantName}`}
        title={`Talk to ${assistantName}`}
        className={cn("tap flex items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40", className)}
      >
        <AudioLines className="h-4 w-4" />
      </button>
      {open && createPortal(<VoiceCall module={module} assistantName={assistantName} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function VoiceCall({ module, assistantName, onClose }: { module: JarvisModule; assistantName: string; onClose: () => void }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [tools, setTools] = useState<ToolChip[]>([]);
  const [confirms, setConfirms] = useState<Confirm[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const orb = useRef<HTMLDivElement>(null);
  const live = useRef({
    pc: null as RTCPeerConnection | null,
    dc: null as RTCDataChannel | null,
    mic: null as MediaStream | null,
    audio: null as HTMLAudioElement | null,
    ctx: null as AudioContext | null,
    raf: 0,
    timer: 0,
    started: 0,
    conversationId: "",
    lastUserText: "",
    pending: [] as Promise<{ callId: string; output: string }>[],
    stats: { responses: 0, toolCalls: 0, toolErrors: 0, confirmations: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, usage: false },
    ended: false,
    mutated: false,
  });

  const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  const hangUp = useCallback(
    (reason?: string) => {
      const l = live.current;
      if (l.ended) return;
      l.ended = true;
      cancelAnimationFrame(l.raf);
      clearInterval(l.timer);
      l.dc?.close();
      l.pc?.close();
      l.mic?.getTracks().forEach((t) => t.stop());
      if (l.audio) l.audio.srcObject = null;
      void l.ctx?.close();
      if (l.conversationId) {
        const s = l.stats;
        void post("/api/jarvis/voice/event", {
          kind: "end",
          conversationId: l.conversationId,
          stats: {
            durationMs: l.started ? Math.round(performance.now() - l.started) : 0,
            responses: s.responses,
            toolCalls: s.toolCalls,
            toolErrors: s.toolErrors,
            confirmations: s.confirmations,
            ...(s.usage && { inputTokens: s.inputTokens, outputTokens: s.outputTokens, cachedInputTokens: s.cachedInputTokens }),
            ...(reason && { error: reason.slice(0, 200) }),
          },
        });
      }
      if (l.mutated) router.refresh();
      setPhase(reason ? "error" : "ended");
    },
    [router],
  );

  useEffect(() => {
    const l = live.current;
    let cancelled = false;
    const send = (event: unknown) => l.dc?.readyState === "open" && l.dc.send(JSON.stringify(event));
    const saveLine = (role: "user" | "assistant", text: string) => {
      if (!text.trim() || !l.conversationId) return;
      setLines((x) => [...x.slice(-5), { id: `${role}-${Date.now()}`, role, text }]);
      void post("/api/jarvis/voice/event", { kind: "transcript", conversationId: l.conversationId, role, text });
    };

    async function runTool(callId: string, name: string, args: string) {
      l.stats.toolCalls++;
      setTools((x) => [...x.slice(-3), { callId, label: name.replace(/_/g, " ") }]);
      try {
        const res = await post("/api/jarvis/voice/tool", { conversationId: l.conversationId, callId, name, arguments: args, userText: l.lastUserText });
        const r = await res.json();
        if (!res.ok) throw new Error(r.error ?? "Tool failed");
        if (r.ok) l.mutated = true;
        else if (!r.confirmation) l.stats.toolErrors++;
        setTools((x) => x.map((t) => (t.callId === callId ? { ...t, label: r.label, ok: r.ok || !!r.confirmation, summary: r.summary, viewAt: r.viewAt } : t)));
        if (r.confirmation) {
          l.stats.confirmations++;
          setConfirms((x) => [...x, { actionId: r.confirmation.actionId, summary: r.confirmation.summary, status: "pending" }]);
        }
        return { callId, output: r.output as string };
      } catch (e) {
        l.stats.toolErrors++;
        setTools((x) => x.map((t) => (t.callId === callId ? { ...t, ok: false, summary: "Failed" } : t)));
        return { callId, output: JSON.stringify({ ok: false, error: (e as Error).message }) };
      }
    }

    async function onEvent(ev: { type: string; [k: string]: unknown }) {
      switch (ev.type) {
        case "input_audio_buffer.speech_started":
          setPhase("listening");
          break;
        case "input_audio_buffer.speech_stopped":
          setPhase("thinking");
          break;
        case "conversation.item.input_audio_transcription.completed":
          l.lastUserText = String(ev.transcript ?? "");
          saveLine("user", l.lastUserText);
          break;
        case "response.output_audio_transcript.delta":
          setPhase("speaking");
          break;
        case "response.output_audio_transcript.done":
          saveLine("assistant", String(ev.transcript ?? ""));
          break;
        case "response.function_call_arguments.done":
          setPhase("thinking");
          l.pending.push(runTool(String(ev.call_id), String(ev.name), String(ev.arguments ?? "{}")));
          break;
        case "response.done": {
          l.stats.responses++;
          const usage = (ev.response as { usage?: { input_tokens?: number; output_tokens?: number; input_token_details?: { cached_tokens?: number } } })?.usage;
          if (usage?.input_tokens != null) {
            l.stats.usage = true;
            l.stats.inputTokens += usage.input_tokens;
            l.stats.outputTokens += usage.output_tokens ?? 0;
            l.stats.cachedInputTokens += usage.input_token_details?.cached_tokens ?? 0;
          }
          if (l.pending.length) {
            const results = await Promise.all(l.pending.splice(0));
            for (const r of results) send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: r.callId, output: r.output } });
            send({ type: "response.create" });
          } else setPhase("listening");
          break;
        }
        case "error":
          console.warn("[voice]", ev);
          break;
      }
    }

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser can't use the microphone.");
        const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).catch(() => {
          throw new Error("Microphone access was blocked. Allow it in your browser settings to talk.");
        });
        if (cancelled) return mic.getTracks().forEach((t) => t.stop());
        l.mic = mic;

        const res = await post("/api/jarvis/voice/session", { module });
        const s = await res.json();
        if (!res.ok) throw new Error(s.error ?? "Couldn't start the call.");
        if (cancelled) return;
        l.conversationId = s.conversationId;
        setConversationId(s.conversationId);

        const pc = new RTCPeerConnection();
        l.pc = pc;
        const audio = new Audio();
        audio.autoplay = true;
        l.audio = audio;
        pc.ontrack = (e) => {
          audio.srcObject = e.streams[0];
          animateOrb(e.streams[0], mic);
        };
        pc.addTrack(mic.getTracks()[0], mic);
        const dc = pc.createDataChannel("oai-events");
        l.dc = dc;
        dc.onmessage = (m) => {
          try {
            void onEvent(JSON.parse(m.data));
          } catch {}
        };
        dc.onopen = () => {
          l.started = performance.now();
          setPhase("listening");
          l.timer = window.setInterval(() => {
            const secs = Math.round((performance.now() - l.started) / 1000);
            setSeconds(secs);
            if (secs >= s.maxSeconds) hangUp();
          }, 1000);
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed") hangUp("The connection dropped.");
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const answer = await fetch(REALTIME_URL, {
          method: "POST",
          body: offer.sdp,
          headers: { Authorization: `Bearer ${s.clientSecret}`, "Content-Type": "application/sdp" },
        });
        if (!answer.ok) throw new Error("The voice service didn't accept the call. Try again in a moment.");
        await pc.setRemoteDescription({ type: "answer", sdp: await answer.text() });
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message || "Couldn't start the call.");
        hangUp((e as Error).message || "start failed");
      }
    })();

    function animateOrb(remote: MediaStream, local: MediaStream) {
      if (!orb.current || prefersReducedMotion()) return;
      const ctx = new AudioContext();
      l.ctx = ctx;
      const meter = (stream: MediaStream) => {
        const a = ctx.createAnalyser();
        a.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(a);
        const buf = new Uint8Array(a.frequencyBinCount);
        return () => (a.getByteFrequencyData(buf), buf.reduce((x, y) => x + y, 0) / buf.length / 255);
      };
      const them = meter(remote);
      const me = meter(local);
      const setScale = gsap.quickTo(orb.current, "scale", { duration: 0.18, ease: "power2.out" });
      const tick = () => {
        setScale(1 + Math.min(0.35, Math.max(them(), me() * 0.6) * 1.6));
        l.raf = requestAnimationFrame(tick);
      };
      tick();
    }

    return () => {
      cancelled = true;
      hangUp();
    };
  }, [module, hangUp]);

  useEffect(() => {
    live.current.mic?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }, [muted]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (hangUp(), onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hangUp, onClose]);

  async function decide(actionId: string, decision: "confirm" | "cancel") {
    const res = await post(`/api/jarvis/actions/${actionId}`, { decision });
    const data = (await res.json().catch(() => ({}))) as { status?: string };
    if (data.status === "executed") live.current.mutated = true;
    setConfirms((x) =>
      x.map((c) =>
        c.actionId === actionId ? { ...c, status: data.status === "executed" ? "done" : data.status === "cancelled" ? "cancelled" : "failed" } : c,
      ),
    );
  }

  const status: Record<Phase, string> = {
    connecting: "Connecting…",
    listening: muted ? "Muted" : "Listening",
    thinking: "Thinking…",
    speaking: `${assistantName} is talking`,
    ended: "Call ended",
    error: "Couldn't connect",
  };
  const done = phase === "ended" || phase === "error";

  return (
    <div className="lf-glass fixed inset-0 z-[80] flex flex-col" role="dialog" aria-modal="true" aria-label={`Voice call with ${assistantName}`}>
      <div className="lf-scene" aria-hidden />
      <div className="absolute inset-0 bg-bg/40 backdrop-blur-2xl" aria-hidden />
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <span className="tabular text-sm text-muted">
            {phase === "connecting" ? "" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
          </span>
          <button onClick={() => (hangUp(), onClose())} className="rounded-full p-2 text-muted hover:text-text" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-8">
          <div className="relative flex h-44 w-44 items-center justify-center">
            <div
              ref={orb}
              className={cn(
                "h-36 w-36 rounded-full bg-hero shadow-lift",
                phase === "connecting" && "animate-pulse",
                phase === "thinking" && "lf-orb-think",
                done && "opacity-40",
              )}
              style={{
                backgroundImage: "radial-gradient(circle at 32% 28%, rgb(255 255 255 / 0.45), transparent 45%), linear-gradient(155deg, #4f8f7b, #1f4338)",
              }}
            />
          </div>
          <div className="text-center">
            <p className="font-display text-[28px] font-medium">{assistantName}</p>
            <p className="mt-1 text-sm text-muted" aria-live="polite">
              {status[phase]}
            </p>
          </div>
          {error && <p className="max-w-xs text-center text-sm text-danger">{error}</p>}
        </div>

        <div className="flex max-h-[38dvh] flex-col gap-2 overflow-y-auto pb-4" aria-live="polite">
          {lines.map((l) => (
            <p
              key={l.id}
              className={cn("text-[15px]", l.role === "user" ? "self-end rounded-2xl rounded-br-md bg-hero px-3.5 py-2 text-hero-text" : "text-text")}
            >
              {l.text}
            </p>
          ))}
          {tools.map((t) => (
            <span key={t.callId} className="flex w-fit items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-[13px] shadow-soft">
              {t.ok == null ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : t.ok ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <CircleAlert className="h-3.5 w-3.5 text-danger" />
              )}
              <span className="text-text-2">{t.label}</span>
              {t.summary && <span className="text-muted">· {t.summary}</span>}
              {t.viewAt && t.ok && (
                <Link href={t.viewAt} onClick={() => (hangUp(), onClose())} className="text-accent">
                  View
                </Link>
              )}
            </span>
          ))}
          {confirms.map((c) => (
            <div key={c.actionId} className="rounded-2xl bg-surface p-4 shadow-soft">
              <p className="text-[15px] font-medium">{c.summary}</p>
              {c.status === "pending" ? (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => decide(c.actionId, "confirm")} className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-white">
                    Confirm
                  </button>
                  <button onClick={() => decide(c.actionId, "cancel")} className="rounded-full bg-surface-2 px-4 py-2 text-sm">
                    Cancel
                  </button>
                </div>
              ) : (
                <p className="mt-1 text-[13px] text-muted">
                  {c.status === "done" ? "✓ Done" : c.status === "cancelled" ? "Cancelled. Nothing changed" : "Couldn't complete it"}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-6">
          {done ? (
            <>
              {conversationId && (
                <Link href={`/jarvis/${conversationId}`} onClick={onClose} className="rounded-full bg-surface px-5 py-3 text-sm font-medium shadow-soft">
                  View transcript
                </Link>
              )}
              <button onClick={onClose} className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-text">
                Done
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setMuted((m) => !m)}
                aria-pressed={muted}
                aria-label={muted ? "Unmute" : "Mute"}
                className={cn("flex h-14 w-14 items-center justify-center rounded-full shadow-soft", muted ? "bg-text text-bg" : "bg-surface text-text")}
              >
                {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              <button
                onClick={() => hangUp()}
                aria-label="End call"
                className="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-white shadow-lift"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
