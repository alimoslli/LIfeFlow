import type { Metadata } from "next";
import Link from "next/link";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { FiledSection } from "@/app/(app)/inbox/filed-section";
import { JarvisMessageCard } from "@/components/jarvis/message-card";
import { assistantProfile, nameAtStart } from "@/lib/assistant";
import { formatIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { moneyLocked } from "@/server/auth/money-lock";
import { listMessages } from "@/server/services/proactive/engine";
import { toCard } from "@/server/services/proactive/present";

export const metadata: Metadata = { title: "Updates" };

/** Updates: what the skyling said on its own, newest first, and below it what it filed for you (one page, merge 3). */
export default async function JarvisSaysPage({ searchParams }: { searchParams: Promise<{ shared?: string }> }) {
  const { shared } = await searchParams;
  const d = await withCurrentUser(async (s, u) => {
    const locked = await moneyLocked(u);
    const rows = (await listMessages(s, 150)).filter((m) => !(locked && m.topic === "money"));
    return { rows, tz: u.timezone, name: assistantProfile(u.preferences, u.timezone).name, locked };
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
          <h1 className="font-display text-[2.125rem] leading-tight font-medium tracking-tight">Updates</h1>
          <p className="mt-1 text-sm text-text-2">What {d.name} noticed, and what it filed for you.</p>
        </div>
        <Link href="/settings/jarvis" className="tap flex items-center justify-center text-muted" aria-label="Personality settings">
          <PixelIcon name="cog" className="h-5 w-5" />
        </Link>
      </header>
      {d.locked && <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-text-2">Money messages are hidden while Money is locked.</p>}
      {d.rows.length === 0 ? (
        <p className="px-1 text-[0.9375rem] text-text-2">Nothing new. {nameAtStart(d.name)} speaks up when something needs you.</p>
      ) : (
        [...days.entries()].map(([day, rows]) => (
          <section key={day} className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted">{day}</h2>
            {rows.map((m) => (
              <JarvisMessageCard key={m.id} m={toCard(m, d.tz, { moneyLocked: d.locked })} name={d.name} />
            ))}
          </section>
        ))
      )}
      <FiledSection shared={shared} />
    </div>
  );
}
