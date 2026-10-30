import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Brain, ChevronRight, Heart, Link2, Lock } from "lucide-react";
import { JarvisAvatar } from "@/components/jarvis/message-card";
import { assistantProfile } from "@/lib/assistant";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { listProposedMemories } from "@/server/services/memory";
import { jarvisSettings, unreadCount } from "@/server/services/proactive/engine";

export const metadata: Metadata = { title: "Jarvis" };

/** Jarvis's profile: who he is, what's waiting on you, and the two things you shape (personality and memory). */
export default async function JarvisProfilePage() {
  const d = await withCurrentUser(async (s, u) => {
    const [unread, proposed] = await series(
      () => unreadCount(s),
      () => listProposedMemories(s),
    );
    return { unread, proposed: proposed.length, profile: assistantProfile(u.preferences), avatar: jarvisSettings(u.preferences).avatar };
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
        <JarvisAvatar style={d.avatar} name={name} className="h-24 w-24 [&_svg]:h-10 [&_svg]:w-10 [&>span]:text-3xl" />
        <h1 className="mt-3 font-display text-[34px] leading-tight font-medium tracking-tight">{name}</h1>
        {status.href ? (
          <Link href={status.href} className={`flex min-h-11 items-center text-sm font-medium ${status.tone}`}>
            {status.text}
          </Link>
        ) : (
          <p className={`flex min-h-11 items-center text-sm ${status.tone}`}>{status.text}</p>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/settings/jarvis"
          className="relative flex aspect-[4/3] flex-col justify-between overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#8e6bbf,#b48ad6_55%,#7c6aa8)] p-4 text-white shadow-soft"
        >
          <span>
            <span className="block text-xl font-semibold tracking-tight">Personality</span>
            <span className="text-xs opacity-80">Tone, voice, when he speaks up</span>
          </span>
          <Heart className="h-6 w-6 self-end opacity-80" />
        </Link>
        <Link
          href="/jarvis/memory"
          className="relative flex aspect-[4/3] flex-col justify-between overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#1f8a4c,#34b46a_55%,#23793f)] p-4 text-white shadow-soft"
        >
          <span>
            <span className="block text-xl font-semibold tracking-tight">Memory</span>
            <span className="text-xs opacity-80">What {name} knows about you</span>
          </span>
          <Brain className="h-6 w-6 self-end opacity-80" />
        </Link>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-3xl bg-surface shadow-soft">
        {[
          { href: "/settings/integrations", label: "Connected accounts", icon: Link2 },
          { href: "/settings/notifications", label: "Notifications", icon: Bell },
          { href: "/settings/data", label: "Privacy & data", icon: Lock },
        ].map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex min-h-14 items-center gap-3 px-4 text-[15px]">
              <Icon className="h-5 w-5 text-text-2" strokeWidth={1.8} />
              <span className="flex-1">{label}</span>
              <ChevronRight className="h-4 w-4 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="px-2 text-center text-xs text-muted">
        {name} never trains AI models on your data, asks before anything important, and{" "}
        <Link href="/integrity" className="text-accent">
          never does graded work for you
        </Link>
        .
      </p>
    </div>
  );
}
