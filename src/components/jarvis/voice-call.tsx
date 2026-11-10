"use client";
import { jsonOf, PlainError, serverWords } from "@/lib/plain-error";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppBusy } from "@/lib/app-busy";
import { AudioLines, Check, Mic, MicOff } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { cn } from "@/lib/utils";
import { nameAtStart } from "@/lib/assistant";
import { gsap, prefersReducedMotion } from "../motion/gsap";
import { statusWord } from "./status";
import type { JarvisModule } from "./types";

/** listening = waiting for you; hearing = you are talking (or it still thinks you are); thinking = working on the answer. */
type Phase = "connecting" | "listening" | "hearing" | "thinking" | "speaking" | "ended" | "error";

/** Realtime errors that are harmless races (an empty commit after Done, a second response request). */
const BENIGN = new Set(["input_audio_buffer_commit_empty", "conversation_already_has_active_response", "response_cancel_not_active"]);

const REALTIME_URL = "https://api.openai.com/v1/realtime/calls";

/** Mic button in the composer: starts talking with the skyling right in this chat. */
export function VoiceButton({
  assistantName,
  disabled,
  className,
  onStart,
}: {
  assistantName: string;
  disabled?: boolean;
  className?: string;
  onStart: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={disabled}
      aria-label={`Talk to ${assistantName}`}
      title={`Talk to ${assistantName}`}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-40",
        className,
      )}
    >
      <AudioLines className="h-[18px] w-[18px]" />
    </button>
  );
}

export type LiveVoiceEvents = {
  /** A finished spoken line, already saved to the conversation. */
  onLine: (role: "user" | "assistant", text: string) => void;
  /** The conversation the call is saved in (the current chat, or a new one). */
  onConversation: (id: string) => void;
  /** A tool started (its name) or the skyling went back to listening (null). */
  onTool: (name: string | null) => void;
  /** Something needs the user's Confirm; shown as a card in the chat. */
  onConfirmation: (actionId: string, summary: string) => void;
  /** The call ended; `error` says why if it failed. */
  onEnd: (error: string | null) => void;
};

/**
 * Talking with the skyling inside the chat (OpenAI Realtime over WebRTC). Takes the
 * composer's place as one slim bar: the logo pulses with the voices, a word says what's
 * happening, plus mute and End. What you both say appears in the chat as messages and
 * is saved to the same conversation, so typing afterwards picks up where you left off.
 */
export function LiveVoice({
  module,
  assistantName,
  conversationId: startConversation,
  ...events
}: { module: JarvisModule; assistantName: string; conversationId: string | null } & LiveVoiceEvents) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("connecting");
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [tool, setTool] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // a call in progress: an app update waits until it's over (components/pwa/app-updater.tsx)
  useAppBusy(true);
  const cb = useRef(events);
  // The latest callbacks, for event handlers that outlive a render.
  useEffect(() => {
    cb.current = { ...events, onTool: (n) => (setTool(n), events.onTool(n)) };
  });

  const orb = useRef<HTMLSpanElement>(null);
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
      cb.current.onEnd(reason ?? null);
    },
    [router],
  );

  useEffect(() => {
    const l = live.current;
    let cancelled = false;
    const send = (event: unknown) => l.dc?.readyState === "open" && l.dc.send(JSON.stringify(event));
    const saveLine = (role: "user" | "assistant", text: string) => {
      if (!text.trim() || !l.conversationId) return;
      cb.current.onLine(role, text);
      void post("/api/jarvis/voice/event", { kind: "transcript", conversationId: l.conversationId, role, text });
    };

    async function runTool(callId: string, name: string, args: string) {
      l.stats.toolCalls++;
      cb.current.onTool(name);
      try {
        const res = await post("/api/jarvis/voice/tool", { conversationId: l.conversationId, callId, name, arguments: args, userText: l.lastUserText });
        const r = await res.json();
        if (!res.ok) throw new Error(r.error ?? "Tool failed");
        if (r.ok) l.mutated = true;
        else if (!r.confirmation) l.stats.toolErrors++;
        if (r.confirmation) {
          l.stats.confirmations++;
          cb.current.onConfirmation(r.confirmation.actionId, r.confirmation.summary);
        }
        return { callId, output: r.output as string };
      } catch (e) {
        l.stats.toolErrors++;
        return { callId, output: JSON.stringify({ ok: false, error: (e as Error).message }) };
      }
    }

    async function onEvent(ev: { type: string; [k: string]: unknown }) {
      switch (ev.type) {
        case "input_audio_buffer.speech_started":
          setNote(null);
          setPhase("hearing");
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
        case "error": {
          const err = (ev.error ?? {}) as { code?: string; type?: string };
          if (err.code && BENIGN.has(err.code)) break;
          console.warn("[voice]", err.type, err.code);
          // Only the error's type and code, never what was said, so the owner sees voice problems on Admin → Errors.
          void post("/api/errors", { message: `Voice: ${err.type ?? "error"} ${err.code ?? ""}`.trim(), route: "/jarvis (voice)" }).catch(() => {});
          setNote("I didn't catch that. Try saying it again.");
          setPhase("listening");
          break;
        }
      }
    }

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new PlainError("This browser can't use the microphone.");
        const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).catch(() => {
          throw new PlainError("Microphone access was blocked. Allow it in your browser settings to talk.");
        });
        if (cancelled) return mic.getTracks().forEach((t) => t.stop());
        l.mic = mic;

        const res = await post("/api/jarvis/voice/session", { module, conversationId: startConversation });
        if (!res.ok) throw new PlainError(await serverWords(res, "Couldn't start the call. Try again in a moment."));
        const s = await jsonOf<{ conversationId: string; clientSecret: string; maxSeconds: number } & Record<string, never>>(res);
        if (!s) throw new Error("bad reply");
        if (cancelled) return;
        l.conversationId = s.conversationId;
        cb.current.onConversation(s.conversationId);

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
        if (!answer.ok) throw new PlainError("The voice service didn't accept the call. Try again in a moment.");
        await pc.setRemoteDescription({ type: "answer", sdp: await answer.text() });
      } catch (e) {
        if (cancelled) return;
        hangUp(e instanceof PlainError ? e.message : "Couldn't start the call. Try again in a moment.");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, hangUp]);

  useEffect(() => {
    live.current.mic?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }, [muted]);

  /** "I'm done talking": for noisy rooms where background sound keeps the turn open. */
  const finishTurn = () => {
    const dc = live.current.dc;
    if (dc?.readyState !== "open") return;
    dc.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    dc.send(JSON.stringify({ type: "response.create" }));
    setPhase("thinking");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hangUp();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hangUp]);

  const label =
    phase === "connecting"
      ? "Connecting…"
      : phase === "thinking"
        ? `${tool ? statusWord(tool) : "Thinking"}…`
        : phase === "speaking"
          ? `${nameAtStart(assistantName)} is talking`
          : muted
            ? "Muted"
            : phase === "hearing"
              ? "Hearing you…"
              : "Your turn, go ahead";
  const sub =
    phase === "connecting"
      ? "Voice"
      : (note ??
        (phase === "hearing" && !muted ? "Pause when you're done, or tap Done" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`));

  return (
    <div
      className="flex items-center gap-3 rounded-[28px] bg-surface p-2 pl-3 shadow-lift ring-1 ring-accent/30"
      role="group"
      aria-label={`Talking with ${assistantName}`}
    >
      <span ref={orb} className={cn("relative h-9 w-9 shrink-0", phase === "connecting" && "animate-pulse")}>
        <span className="lf-orb-glow absolute -inset-1/2 rounded-full" aria-hidden />
        <BrandMark className="relative h-9 w-9" alt="" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9375rem] font-medium" aria-live="polite">
          {label}
        </p>
        <p className="tabular truncate text-xs text-muted">{sub}</p>
      </div>
      {phase === "hearing" && !muted && (
        <button type="button" onClick={finishTurn} aria-label="Done talking" className="lf-sb lf-sb-sun lf-sb-sm">
          <Check className="h-4 w-4" aria-hidden />
          Done
        </button>
      )}
      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        aria-pressed={muted}
        aria-label={muted ? "Unmute" : "Mute"}
        className={cn("flex h-11 w-11 items-center justify-center rounded-full transition-colors", muted ? "bg-text text-bg" : "bg-surface-2 text-text")}
      >
        {muted ? <MicOff className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}
      </button>
      <button
        type="button"
        onClick={() => hangUp()}
        className="flex h-11 items-center rounded-full bg-danger px-4 text-sm font-medium text-white"
        aria-label="End"
      >
        End
      </button>
    </div>
  );
}
