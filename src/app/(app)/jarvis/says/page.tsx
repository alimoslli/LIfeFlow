import type { Metadata } from "next";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { SegmentedNav, UPDATES } from "@/components/ui/segmented-nav";
import { JarvisMessageCard } from "@/components/jarvis/message-card";
import { assistantProfile } from "@/lib/assistant";
import { formatIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { moneyLocked } from "@/server/auth/money-lock";
import { jarvisSettings, listMessages } from "@/server/services/proactive/engine";
import { toCard } from "@/server/services/proactive/present";

export const metadata: Metadata = { title: "Updates" };

/** Everything Jarvis said on his own, newest first, with what was done about it. */
export default async function JarvisSaysPage() {
  const d = await withCurrentUser(async (s, u) => {
    const locked = await moneyLocked(u);
    const rows = (await listMessages(s, 150)).filter((m) => !(locked && m.topic === "money"));
    return { rows, tz: u.timezone, name: assistantProfile(u.preferences).name, avatar: jarvisSettings(u.preferences).avatar, locked };
  });
  const days = new Map<string, typeof d.rows>();
  for (const m of d.rows) {
    const key = formatIn(m.createdAt, d.tz, "EEEE, MMMM d");
    days.set(key, [...(days.get(key) ?? []), m]);
  }
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[34px] leading-tight font-medium tracking-tight">Updates</h1>
          <p className="mt-1 text-sm text-text-2">What {d.name} noticed and did, newest first.</p>
        </div>
        <Link href="/settings/jarvis" className="tap flex items-center justify-center text-muted" aria-label="Personality settings">
          <Settings2 className="h-5 w-5" />
        </Link>
      </header>
      <SegmentedNav label="Updates" items={UPDATES} active="jarvis" />
      {d.locked && <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-text-2">Money messages are hidden while Money is locked.</p>}
      {d.rows.length === 0 ? (
        <p className="rounded-3xl bg-surface p-6 text-[15px] text-text-2 shadow-soft">
          Nothing yet. {d.name} looks at your day every morning, midday and evening, and speaks up only when something is worth your attention.
        </p>
      ) : (
        [...days.entries()].map(([day, rows]) => (
          <section key={day} className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted">{day}</h2>
            {rows.map((m) => (
              <JarvisMessageCard key={m.id} m={toCard(m, d.tz)} name={d.name} avatar={d.avatar} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
