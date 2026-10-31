import type { Metadata } from "next";
import Link from "next/link";
import { IdeaButton } from "@/components/jarvis/idea-button";
import { todayIn } from "@/lib/dates";
import { ideaCatalog } from "@/lib/ideas";
import { lifeAreas } from "@/lib/life";
import { assistantProfile } from "@/lib/assistant";
import { withCurrentUser } from "@/server/auth/current-user";
import { personalIdeas } from "@/server/services/ideas";

export const metadata: Metadata = { title: "Ideas" };

/** Everything Jarvis can do, as offers. Ideas from the user's own records come first. */
export default async function IdeasPage() {
  const d = await withCurrentUser(async (s, u) => {
    const areas = lifeAreas(u.preferences?.lifeStage);
    return { areas, mine: await personalIdeas(s, u.timezone, todayIn(u.timezone), areas), name: assistantProfile(u.preferences).name };
  });
  const groups = [...(d.mine.length ? [{ name: "For you", ideas: d.mine }] : []), ...ideaCatalog(d.areas)];
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-7">
      <header>
        <h1 className="font-display text-[34px] leading-tight font-medium tracking-tight">Ideas</h1>
        <p className="mt-1 text-sm text-text-2">Things {d.name} can do for you. Tap one to start.</p>
      </header>
      {groups.map((g) => (
        <section key={g.name} aria-label={g.name}>
          <h2 className="text-[22px] font-medium tracking-tight">{g.name}</h2>
          <ul className="divide-y divide-border">
            {g.ideas.map((i) => (
              <li key={i.title}>
                {i.prompt ? (
                  <IdeaButton idea={i} />
                ) : (
                  <Link href="/jarvis/memory/import" className="flex w-full gap-4 py-4">
                    <span className="text-[26px] leading-none" aria-hidden>
                      {i.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] leading-snug font-semibold">{i.title}</span>
                      <span className="mt-1 block text-sm text-text-2">{i.detail}</span>
                    </span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
