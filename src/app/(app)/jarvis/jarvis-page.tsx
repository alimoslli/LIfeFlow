import Link from "next/link";
import { MessageSquare, Plus } from "lucide-react";
import { JarvisChat } from "@/components/jarvis/chat";
import type { UiMessage } from "@/components/jarvis/types";
import { formatIn } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { jarvisStatus } from "@/server/jarvis/providers";
import { deleteConversationAction } from "./actions";
import { ActionButton } from "@/components/action-form";

type Conv = { id: string; title: string; lastMessageAt: Date };

export function JarvisPage({ conversations, activeId, messages, tz }: { conversations: Conv[]; activeId: string | null; messages: UiMessage[]; tz: string }) {
  const status = jarvisStatus();
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] lg:h-dvh">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border md:flex">
        <div className="p-3">
          <Link href="/jarvis" className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:border-border-strong">
            <Plus className="h-4 w-4" /> New conversation
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Conversations">
          {conversations.length === 0 && <p className="px-3 py-2 text-xs text-muted">Your conversations will appear here.</p>}
          {conversations.map((c) => (
            <div key={c.id} className={cn("group flex items-center rounded-lg", c.id === activeId ? "bg-surface shadow-soft" : "hover:bg-surface-2")}>
              <Link href={`/jarvis/${c.id}`} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{c.title}</span>
                  <span className="block text-[11px] text-muted">{formatIn(c.lastMessageAt, tz, "MMM d")}</span>
                </span>
              </Link>
              <ActionButton action={deleteConversationAction.bind(null, c.id)} confirm="Delete this conversation?" title="Delete conversation" className="mr-1 hidden rounded p-1 text-xs text-muted group-hover:block hover:text-danger">
                ×
              </ActionButton>
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <JarvisChat key={activeId ?? "new"} conversationId={activeId} initialMessages={messages} module="home" availability={{ available: status.available, reason: status.reason, model: status.model }} />
      </div>
    </div>
  );
}
