import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { ago } from "@/app/admin/format";
import type { Brief, EmployeeCard } from "@/server/hq/types";

/**
 * "From your COO": the newest brief, how many things wait for the owner, and the one button to talk to it.
 * Server-rendered; on phones the text is cut at six lines with a native "Read all".
 */
export function BriefCard({ brief, chief, pending }: { brief: Brief | null; chief: EmployeeCard | undefined; pending: number }) {
  const title = chief?.title ?? "COO";
  const url = chief?.primaryChat?.url ?? null;
  return (
    <section aria-labelledby="hq-brief-title" data-testid="hq-brief" className="hq-brief p-4 sm:p-6 lg:rounded-[28px]">
      <div className="relative z-10 flex items-center gap-3">
        {/* The COO's face, cropped from his room picture (public/hq/office). */}
        <span className="hq-coo-face" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id="hq-brief-title" className="font-display text-[1.375rem] leading-tight font-medium lg:text-[1.5rem]">
            From your {title}
          </h2>
          {brief && <p className="text-[0.8125rem] text-[#d6e4f7]">{ago(brief.createdAt)}</p>}
        </div>
      </div>
      <div className="relative z-10">
        {brief ? (
          <>
            <p data-testid="hq-brief-body" className="mt-2 hidden text-[0.9375rem] leading-relaxed whitespace-pre-line text-[#eef3fb] sm:block lg:text-base">
              {brief.body}
            </p>
            <details className="group mt-2 sm:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none flex-col justify-center [&::-webkit-details-marker]:hidden">
                <span className="line-clamp-6 text-[0.9375rem] leading-relaxed whitespace-pre-line text-[#eef3fb] group-open:hidden">{brief.body}</span>
                <span className="mt-1 text-sm font-medium text-brass-xl group-open:hidden">Read all</span>
                <span className="hidden text-sm font-medium text-brass-xl group-open:inline">Show less</span>
              </summary>
              <p className="text-[0.9375rem] leading-relaxed whitespace-pre-line text-[#eef3fb]">{brief.body}</p>
            </details>
          </>
        ) : (
          <div className="mt-2">
            <p className="text-sm text-[#d6e4f7]">Your {title}&apos;s first brief arrives after the next round.</p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Link
            href="/admin/work#approvals"
            className={
              pending > 0
                ? "hq-btn-brass inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-semibold max-sm:w-full"
                : "inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brass-xl"
            }
          >
            {pending === 0 ? "Nothing needs you" : pending === 1 ? "Open the decision" : `Open the ${pending} decisions`}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-white/40 px-5 text-sm font-semibold text-[#f5f8fd] max-sm:w-full"
            >
              Talk to your {title} <ExternalLink className="h-4 w-4" aria-hidden />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <Link href="/admin/hq/settings" className="inline-flex min-h-11 items-center text-sm text-[#eef3fb] underline underline-offset-2">
              Connect its chat in Settings
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
