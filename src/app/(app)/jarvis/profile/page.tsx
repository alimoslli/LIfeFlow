import type { Metadata } from "next";
import Link from "next/link";
import { MemorySection } from "../memory/section";
import { JarvisAvatar } from "@/components/jarvis/message-card";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { assistantProfile, nameAtStart } from "@/lib/assistant";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { listProposedMemories } from "@/server/services/memory";
import { unreadCount } from "@/server/services/proactive/engine";

export const metadata: Metadata = { title: "Skyling" };

/** The skyling's one page: who it is, what's waiting on you, its personality and what it knows (merge 4). */
export default async function JarvisProfilePage({ searchParams }: { searchParams: Promise<{ debug?: string; imported?: string }> }) {
  const sp = await searchParams;
  const d = await withCurrentUser(async (s, u) => {
    const [unread, proposed] = await series(
      () => unreadCount(s),
      () => listProposedMemories(s),
    );
    return { unread, proposed: proposed.length, profile: assistantProfile(u.preferences, u.timezone) };
  });
  const name = d.profile.name;
  const status = d.proposed
    ? { text: `${d.proposed} memor${d.proposed === 1 ? "y needs" : "ies need"} your OK`, href: "#memory", tone: "text-accent" }
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

      <ul className="lf-tiles">
        {[
          { href: "/settings/jarvis", label: "Personality", icon: "health" as const },
          { href: "/settings/integrations", label: "Connected", icon: "plug" as const },
          { href: "/settings/notifications", label: "Notifications", icon: "bell" as const },
          { href: "/settings/data", label: "Privacy and your data", icon: "shield" as const },
        ].map(({ href, label, icon }) => (
          <li key={href}>
            <Link href={href} className="flex min-h-14 items-center gap-3 px-4 text-[0.9375rem]">
              <PixelIcon name={icon} className="h-6 w-6" />
              <span className="flex-1">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="px-2 text-center text-xs text-muted">
        {nameAtStart(name)} never trains AI models on your data, asks before it deletes or sends anything, and{" "}
        <Link href="/integrity" className="text-accent underline">
          never does graded work for you
        </Link>
        .
      </p>
      <MemorySection sp={sp} />
    </div>
  );
}
