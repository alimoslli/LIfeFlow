"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Maximize2, Plus, Sparkles, X } from "lucide-react";
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
export function JarvisDrawer({ open, onClose, module, availability, initialPrompt, autoSend }: { open: boolean; onClose: () => void; module: JarvisModule; availability: JarvisAvailability; initialPrompt?: string; autoSend?: boolean }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [session, setSession] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Jarvis">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="animate-slide-in relative flex h-full w-full max-w-[460px] flex-col border-l border-border bg-bg shadow-2xl">
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
            <Link href={conversationId ? `/jarvis/${conversationId}` : "/jarvis"} onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" title="Open full screen" aria-label="Open full screen">
              <Maximize2 className="h-4 w-4" />
            </Link>
            <button onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Close Jarvis">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <JarvisChat key={session} compact module={module} availability={availability} initialPrompt={initialPrompt} autoSend={session === 0 && autoSend} conversationId={conversationId} onConversation={(id) => setConversationId(id)} />
        </div>
      </div>
    </div>
  );
}
