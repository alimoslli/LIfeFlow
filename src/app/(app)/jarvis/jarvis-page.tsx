import { PixelIcon } from "@/components/pixel/pixel-icon";
import { SettingsGear } from "@/components/settings/settings-sheet";
import { AssistantName } from "@/components/assistant-name";
import Link from "next/link";
import { MySkyling } from "@/components/skylings/sprite";
import { SectionNav } from "@/components/shell/section-nav";
import { QuickAddButton } from "@/components/shell/quick-add";
import { ActionButton } from "@/components/action-form";
import { JarvisChat } from "@/components/jarvis/chat";
import { NewChatButton } from "@/components/jarvis/new-chat-button";
import type { UiMessage } from "@/components/jarvis/types";
import type { IdeaCloud } from "@/lib/idea-clouds";
import type { SkyCounts } from "@/lib/sky-home";
import { formatIn } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { jarvisStatus } from "@/server/jarvis/providers";
import { deleteConversationAction } from "./actions";
import { HistorySheet } from "./history-sheet";
import { ChatViewport } from "@/components/jarvis/chat-viewport";

type Conv = { id: string; title: string; lastMessageAt: Date };

export function JarvisPage({
  conversations,
  activeId,
  messages,
  tz,
  ask,
  connect,
  ideas,
  voice,
  home,
}: {
  conversations: Conv[];
  activeId: string | null;
  messages: UiMessage[];
  tz: string;
  /** A first message to put in the box (from onboarding ideas); the user still taps Send. */
  ask?: string;
  /** Not connected yet (bank, Canvas, calendar): Jarvis suggests them on his home screen. */
  connect?: string[];
  /** Idea clouds for the empty chat (lib/idea-clouds). */
  ideas?: IdeaCloud[];
  /** Start talking right away (the mic on Today). */
  voice?: boolean;
  /** The skyling's cloud: its stars and suns. */
  home?: SkyCounts;
}) {
  const status = jarvisStatus();
  const items = conversations.map((c) => ({ id: c.id, title: c.title, when: formatIn(c.lastMessageAt, tz, "MMM d") }));
  return (
    // Phones: pinned to the visible screen, above the tab bar or the keyboard (ChatViewport). Desktop: full height.
    <ChatViewport className="flex md:h-dvh">
      <aside className="hidden w-72 shrink-0 flex-col py-6 pr-2 pl-1 lg:flex">
        <nav className="flex-1 overflow-y-auto px-2" aria-label="Conversations">
          {items.length === 0 && <p className="px-3 py-2 text-sm text-muted">Your conversations will appear here.</p>}
          {items.map((c) => (
            <div key={c.id} className={cn("group flex items-center rounded-[1rem]", c.id === activeId ? "bg-surface shadow-soft" : "hover:bg-surface-2")}>
              <Link href={`/jarvis?c=${c.id}`} className="min-w-0 flex-1 px-3.5 py-2.5">
                <span className="line-clamp-2 break-words text-sm">{c.title}</span>
                <span className="block text-xs text-muted">{c.when}</span>
              </Link>
              <ActionButton
                action={deleteConversationAction.bind(null, c.id)}
                confirm="Delete this conversation?"
                title="Delete conversation"
                className="mr-2 hidden rounded-full px-2 text-muted group-hover:block hover:text-danger"
              >
                ×
              </ActionButton>
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* One light row: earlier chats, the skyling's name, settings and its profile. One chat keeps going, so no new chat. */}
        <header className="flex items-center gap-0.5 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] lg:px-4">
          <span className="lg:hidden">
            <HistorySheet items={items} activeId={activeId} />
          </span>
          <p className="min-w-0 flex-1 truncate px-1 text-center text-[0.9375rem] font-semibold lg:text-left">
            <AssistantName start />
          </p>
          <NewChatButton className="flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-2.5 text-[0.8125rem] font-semibold text-text-2 transition-colors hover:bg-surface-2 hover:text-text" />
          <SettingsGear className="flex h-11 w-11 items-center justify-center rounded-full text-text-2 transition-colors hover:bg-surface-2 hover:text-text">
            <PixelIcon name="cog" className="h-6 w-6" />
          </SettingsGear>
          <Link href="/jarvis/profile" aria-label="Skyling profile" className="lf-hop flex h-11 w-11 items-center justify-center">
            <span className="lf-chip-night h-9 w-9 overflow-hidden rounded-[0.75rem]">
              <MySkyling still className="h-8 w-8 translate-y-[3px]" />
            </span>
          </Link>
        </header>
        <SectionNav inline>
          <QuickAddButton className="lf-sb lf-sb-app lf-sb-sm shrink-0">
            <PixelIcon name="edit" className="h-4 w-4" /> Capture
          </QuickAddButton>
        </SectionNav>
        <div className="min-h-0 flex-1">
          <JarvisChat
            key={activeId ?? "new"}
            conversationId={activeId}
            initialMessages={messages}
            initialPrompt={ask}
            connect={connect}
            ideas={ideas}
            startVoice={voice}
            home={home}
            module="home"
            availability={{ available: status.available, reason: status.reason, model: status.model }}
          />
        </div>
      </div>
    </ChatViewport>
  );
}
