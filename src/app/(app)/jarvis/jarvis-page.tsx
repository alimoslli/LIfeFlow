import Link from "next/link";
import { Plus } from "lucide-react";
import { ActionButton } from "@/components/action-form";
import { JarvisChat } from "@/components/jarvis/chat";
import type { UiMessage } from "@/components/jarvis/types";
import { formatIn } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { jarvisStatus } from "@/server/jarvis/providers";
import { deleteConversationAction } from "./actions";
import { HistorySheet } from "./history-sheet";

type Conv = { id: string; title: string; lastMessageAt: Date };

export function JarvisPage({ conversations, activeId, messages, tz }: { conversations: Conv[]; activeId: string | null; messages: UiMessage[]; tz: string }) {
  const status = jarvisStatus();
  const items = conversations.map((c) => ({ id: c.id, title: c.title, when: formatIn(c.lastMessageAt, tz, "MMM d") }));
  const active = conversations.find((c) => c.id === activeId);
  return (
    // Phones: full height minus the bottom tab bar. Desktop: full height.
    <div className="flex h-[calc(100dvh-4.25rem-env(safe-area-inset-bottom))] md:h-dvh">
      <aside className="hidden w-72 shrink-0 flex-col py-6 pr-2 pl-1 lg:flex">
        <Link href="/jarvis" className="mx-2 mb-4 flex items-center justify-center gap-2 rounded-full bg-surface px-4 py-2.5 text-sm font-medium shadow-soft transition-shadow hover:shadow-lift">
          <Plus className="h-4 w-4" /> New chat
        </Link>
        <nav className="flex-1 overflow-y-auto px-2" aria-label="Conversations">
          {items.length === 0 && <p className="px-3 py-2 text-sm text-muted">Your conversations will appear here.</p>}
          {items.map((c) => (
            <div key={c.id} className={cn("group flex items-center rounded-2xl", c.id === activeId ? "bg-surface shadow-soft" : "hover:bg-surface-2")}>
              <Link href={`/jarvis/${c.id}`} className="min-w-0 flex-1 px-3.5 py-2.5">
                <span className="block truncate text-sm">{c.title}</span>
                <span className="block text-xs text-muted">{c.when}</span>
              </Link>
              <ActionButton action={deleteConversationAction.bind(null, c.id)} confirm="Delete this conversation?" title="Delete conversation" className="mr-2 hidden rounded-full px-2 text-muted group-hover:block hover:text-danger">
                ×
              </ActionButton>
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 px-4 pt-4 lg:hidden">
          <HistorySheet items={items} activeId={activeId} />
          <p className="min-w-0 flex-1 truncate text-center text-sm font-medium">{active?.title ?? "Jarvis"}</p>
          <Link href="/jarvis" aria-label="New chat" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface shadow-soft">
            <Plus className="h-4 w-4" />
          </Link>
        </header>
        <div className="min-h-0 flex-1">
          <JarvisChat key={activeId ?? "new"} conversationId={activeId} initialMessages={messages} module="home" availability={{ available: status.available, reason: status.reason, model: status.model }} />
        </div>
      </div>
    </div>
  );
}
