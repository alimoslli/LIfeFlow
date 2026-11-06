import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { ago } from "@/app/admin/format";
import type { Brief, EmployeeCard } from "@/server/hq/types";
import { Empty } from "./cards";

/**
 * "From your Chief of Staff": the newest brief, how many things wait for the owner, and the one button to talk to it.
 * Server-rendered; on phones the text is cut at six lines with a native "Read all".
 */
export function BriefCard({ brief, chief, pending }: { brief: Brief | null; chief: EmployeeCard | undefined; pending: number }) {
  const title = chief?.title ?? "Chief of Staff";
  const url = chief?.primaryChat?.url ?? null;
  return (
    <section aria-labelledby="hq-brief-title" data-testid="hq-brief" className="rounded-3xl bg-surface p-4 shadow-soft sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="hq-brief-title" className="text-[0.9375rem] font-semibold text-text">
          From your {title}
        </h2>
        {brief && <span className="text-xs text-muted">{ago(brief.createdAt)}</span>}
      </div>

      {brief ? (
        <>
          <p data-testid="hq-brief-body" className="mt-2 hidden text-[0.9375rem] leading-relaxed whitespace-pre-line text-text sm:block">
            {brief.body}
          </p>
          <details className="group mt-2 sm:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none flex-col justify-center [&::-webkit-details-marker]:hidden">
              <span className="line-clamp-6 text-[0.9375rem] leading-relaxed whitespace-pre-line text-text group-open:hidden">{brief.body}</span>
              <span className="mt-1 text-sm font-medium text-accent group-open:hidden">Read all</span>
              <span className="hidden text-sm font-medium text-accent group-open:inline">Show less</span>
            </summary>
            <p className="text-[0.9375rem] leading-relaxed whitespace-pre-line text-text">{brief.body}</p>
          </details>
        </>
      ) : (
        <div className="mt-2">
          <Empty>Your {title}&apos;s first brief arrives after the next round.</Empty>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link href="/admin/hq/approvals" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent">
          {pending === 0 ? "Nothing needs you" : pending === 1 ? "1 thing needs you" : `${pending} things need you`}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-accent px-5 text-sm font-semibold text-accent-text max-sm:w-full"
          >
            Talk to your {title} <ExternalLink className="h-4 w-4" aria-hidden />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <Link href="/admin/hq/settings" className="inline-flex min-h-11 items-center text-sm text-text-2 underline underline-offset-2">
            Connect its chat in Settings
          </Link>
        )}
      </div>
    </section>
  );
}
