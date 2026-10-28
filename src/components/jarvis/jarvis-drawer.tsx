"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Maximize2, Plus, Sparkles, X } from "lucide-react";
import { gsap, MOTION, prefersReducedMotion, useGSAP } from "../motion/gsap";
import { JarvisChat } from "./chat";
import type { JarvisAvailability, JarvisModule } from "./types";

const LABEL: Record<JarvisModule, string> = {
  home: "Home",
  finances: "Finances",
  wealth: "Wealth",
  school: "School",
  work: "Work",
  calendar: "Calendar",
  tasks: "Tasks",
  notes: "Notes",
  settings: "Settings",
};

/** Slide-over Jarvis available from every page; scoped to the current module's context. */
export function JarvisDrawer({
  open,
  onClose,
  module,
  availability,
  initialPrompt,
  autoSend,
}: {
  open: boolean;
  onClose: () => void;
  module: JarvisModule;
  availability: JarvisAvailability;
  initialPrompt?: string;
  autoSend?: boolean;
}) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [session, setSession] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Stay mounted while the close animation plays.
  const [mounted, setMounted] = useState(open);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setMounted(true);
  }
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (!mounted || !panel.current || !backdrop.current) return;
      const reduce = prefersReducedMotion();
      if (open) {
        if (reduce) return;
        gsap.fromTo(panel.current, { xPercent: 100 }, { xPercent: 0, duration: 0.5, ease: MOTION.settle });
        gsap.fromTo(backdrop.current, { opacity: 0 }, { opacity: 1, duration: 0.3 });
      } else {
        gsap.to(panel.current, { xPercent: 100, duration: reduce ? 0 : 0.26, ease: "power2.in" });
        gsap.to(backdrop.current, { opacity: 0, duration: reduce ? 0 : 0.26, onComplete: () => setMounted(false) });
      }
    },
    { dependencies: [open, mounted] },
  );

  if (!mounted) return null;
  return (
    <div className={`fixed inset-0 z-50 flex justify-end ${open ? "" : "pointer-events-none"}`} role="dialog" aria-modal="true" aria-label="Jarvis">
      <div ref={backdrop} className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div
        ref={panel}
        className="relative flex h-full w-full max-w-[460px] flex-col border-l border-border bg-bg shadow-2xl md:bg-surface md:backdrop-blur-2xl"
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="font-medium">Jarvis</span>
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">{LABEL[module]} context</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => {
                setConversationId(null);
                setSession((s) => s + 1);
              }}
              className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text"
              title="New conversation"
              aria-label="New conversation"
            >
              <Plus className="h-4 w-4" />
            </button>
            <Link
              href={conversationId ? `/jarvis/${conversationId}` : "/jarvis"}
              onClick={onClose}
              className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text"
              title="Open full screen"
              aria-label="Open full screen"
            >
              <Maximize2 className="h-4 w-4" />
            </Link>
            <button onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Close Jarvis">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <JarvisChat
            key={session}
            compact
            module={module}
            availability={availability}
            initialPrompt={initialPrompt}
            autoSend={session === 0 && autoSend}
            conversationId={conversationId}
            onConversation={(id) => setConversationId(id)}
          />
        </div>
      </div>
    </div>
  );
}
