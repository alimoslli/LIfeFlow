import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AskJarvisButton } from "@/components/shell/app-shell";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { Card, CardHeader, EmptyState } from "@/components/ui/surface";
import { formatIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { getPaperPack } from "@/server/services/paper-pack";
import { getAssignment } from "@/server/services/school";

export const metadata: Metadata = { title: "Paper pack" };

/** A paper pack (gamechanger 1): the sources the skyling found and the questions to look into. The writing is theirs. */
export default async function PaperPackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await withCurrentUser(async (s, u) => {
    const work = await getAssignment(s, id).catch(() => null);
    if (!work) return null;
    return { work, pack: await getPaperPack(s, id), tz: u.timezone };
  });
  if (!d) notFound();
  const { work, pack } = d;
  const course = work.course.code ? `${work.course.code} · ${work.course.name}` : work.course.name;

  return (
    <>
      <Link href={`/school/courses/${work.course.id}`} className="mb-4 hidden items-center gap-1 text-sm text-muted hover:text-text md:inline-flex">
        <PixelIcon name="back" className="h-4 w-4" /> {work.course.name}
      </Link>
      <header className="mb-6">
        <p className="text-sm font-medium text-muted">{course}</p>
        <h1 className="font-display text-[2rem] leading-tight font-medium tracking-tight">{work.title}</h1>
        {work.dueAt && <p className="mt-1 text-sm text-text-2">Due {formatIn(work.dueAt, d.tz, "EEEE, MMM d")}</p>}
      </header>
      {!pack ? (
        <Card>
          <EmptyState icon={<PixelIcon name="find" className="h-8 w-8" />} title="No pack yet">
            <p>Your skyling can find sources and questions to start from. The writing stays yours.</p>
            <div className="mt-4">
              <AskJarvisButton prompt={`Make me a paper pack for ${work.title}`} className="lf-sb lf-sb-sun lf-sb-sm lf-touch">
                Find sources
              </AskJarvisButton>
            </div>
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Sources" subtitle={`Found ${formatIn(pack.searchedAt, d.tz, "MMM d")}`} />
            <ul className="lf-rows px-2 pb-3 *:px-3">
              {pack.sources.map((src) => (
                <li key={src.url} className="py-2">
                  <a href={src.url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-accent hover:underline">
                    {src.title}
                  </a>
                  {src.why && <p className="text-sm text-text-2">{src.why}</p>}
                </li>
              ))}
            </ul>
          </Card>
          {pack.questions.length > 0 && (
            <Card>
              <CardHeader title="Questions to look into" />
              <ul className="lf-rows px-2 pb-3 *:px-3">
                {pack.questions.map((q) => (
                  <li key={q} className="py-2 text-sm">
                    {q}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <div className="flex flex-wrap gap-2">
            <AskJarvisButton prompt={`Find time this week to work on ${work.title}`} className="lf-sb lf-sb-sun lf-sb-sm lf-touch">
              Plan sessions
            </AskJarvisButton>
            <AskJarvisButton prompt={`Make me a paper pack for ${work.title} again`} className="lf-sb lf-sb-app lf-sb-sm lf-touch">
              Find new sources
            </AskJarvisButton>
          </div>
        </div>
      )}
    </>
  );
}
