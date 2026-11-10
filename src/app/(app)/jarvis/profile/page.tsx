import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Brain, ChevronRight, Heart, Link2, Lock } from "lucide-react";
import { JarvisAvatar } from "@/components/jarvis/message-card";
import { assistantProfile, nameAtStart } from "@/lib/assistant";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { listProposedMemories } from "@/server/services/memory";
import { unreadCount } from "@/server/services/proactive/engine";

export const metadata: Metadata = { title: "Skyling" };

/** Jarvis's profile: who he is, what's waiting on you, and the two things you shape (personality and memory). */
export default async function JarvisProfilePage() {
  const d = await withCurrentUser(async (s, u) => {
    const [unread, proposed] = await series(
      () => unreadCount(s),
      () => listProposedMemories(s),
    );
    return { unread, proposed: proposed.length, profile: assistantProfile(u.preferences, u.timezone) };
  });
  const name = d.profile.name;
  const status = d.proposed
    ? { text: `${d.proposed} memor${d.proposed === 1 ? "y needs" : "ies need"} your OK`, href: "/jarvis/memory", tone: "text-accent" }
    : d.unread
      ? { text: `${d.unread} new update${d.unread === 1 ? "" : "s"}`, href: "/jarvis/says", tone: "text-accent" }
      : { text: "All caught up", href: null, tone: "text-text-2" };
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6">
      <header className="flex flex-col items-center pt-2 text-center">
        <JarvisAvatar className="h-24 w-24" />
        <h1 className="mt-3 font-display text-[2.125rem] leading-tight font-medium tracking-tight">{nameAtStart(name)}</h1>
        {status.href ? (
          <Link href={status.href} className={`flex min-h-11 items-center text-sm font-medium ${status.tone}`}>
            {status.text}
          </Link>
        ) : (
          <p className={`flex min-h-11 items-center text-sm ${status.tone}`}>{status.text}</p>
        )}
      </header>

      {/* 4:3 cards that grow with large text: no clipping, icons that never shrink away, and a title that never runs past
          the padding on a narrow phone at Extra large text (capped by the card's width, 18cqw; audit A26). */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/settings/jarvis"
          className="@container relative flex aspect-[4/3] min-w-0 flex-col justify-between rounded-3xl bg-hero p-4 text-hero-text shadow-soft"
        >
          <span>
            <span className="block text-[min(1.25rem,18cqw)] leading-[1.4] font-semibold tracking-tight">Personality</span>
            <span className="text-xs opacity-80">Tone, voice, when it speaks up</span>
          </span>
          <Heart className="h-6 w-6 shrink-0 self-end opacity-80" />
        </Link>
        <Link
          href="/jarvis/memory"
          className="@container relative flex aspect-[4/3] min-w-0 flex-col justify-between rounded-3xl bg-hero p-4 text-hero-text shadow-soft"
        >
          <span>
            <span className="block text-[min(1.25rem,18cqw)] leading-[1.4] font-semibold tracking-tight">Memory</span>
            <span className="text-xs opacity-80">What {name} knows about you</span>
          </span>
          <Brain className="h-6 w-6 shrink-0 self-end opacity-80" />
        </Link>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-3xl bg-surface shadow-soft">
        {[
          { href: "/settings/integrations", label: "Connected accounts", icon: Link2 },
          { href: "/settings/notifications", label: "Notifications", icon: Bell },
          { href: "/settings/data", label: "Privacy & data", icon: Lock },
        ].map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex min-h-14 items-center gap-3 px-4 text-[0.9375rem]">
              <Icon className="h-5 w-5 text-text-2" strokeWidth={1.8} />
              <span className="flex-1">{label}</span>
              <ChevronRight className="h-4 w-4 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="px-2 text-center text-xs text-muted">
        {nameAtStart(name)} never trains AI models on your data, asks before anything important, and{" "}
        <Link href="/integrity" className="text-accent underline">
          never does graded work for you
        </Link>
        .
      </p>
    </div>
  );
}
