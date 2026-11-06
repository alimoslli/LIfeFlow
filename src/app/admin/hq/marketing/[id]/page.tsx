import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Links, Section } from "@/components/hq/cards";
import { ContentChip, ReadMore } from "@/components/hq/marketing";
import { KIND_WORD, platformsLine, toLocalInput } from "@/components/hq/marketing-labels";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { getContent } from "@/server/services/hq-marketing";
import { safe } from "@/server/services/admin";
import { adminTz, fmt } from "../../../format";
import { Notice } from "../../../ui";
import { updateContentAction } from "../../actions";

const UUID = /^[0-9a-f-]{20,40}$/i;

/** One piece of content: everything about it, and the owner's controls. */
export default async function ContentDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const r = await safe("hq-content", () => getContent(getDb(), id));
  if (!r.ok || !r.data) notFound();
  const c = r.data;
  const tz = await adminTz();
  const editable = c.status !== "published" && c.status !== "dropped";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <Link href="/admin/hq/marketing" className="inline-flex min-h-11 items-center text-sm text-text-2">
          ← Marketing
        </Link>
        <h1 className="font-display text-[1.75rem] leading-tight font-medium tracking-tight break-words">{c.title}</h1>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-2">
          <ContentChip status={c.status} /> {KIND_WORD[c.kind]} · {platformsLine(c.platforms)}
        </p>
      </header>
      <Notice done={sp.done} error={sp.error} />

      <Section title="Details">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">When</dt>
            <dd className="text-text">{c.scheduledFor ? fmt(c.scheduledFor, tz) : "No date yet"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Added</dt>
            <dd className="text-text">
              {fmt(c.createdAt, tz)} · {c.source === "owner" ? "by you" : c.source === "agent" ? "by the team" : "imported"}
            </dd>
          </div>
        </dl>
        {c.hook && (
          <>
            <p className="mt-4 text-xs text-muted">Hook</p>
            <p className="text-[0.9375rem] break-words text-text">{c.hook}</p>
          </>
        )}
        <ReadMore label={c.kind === "research" ? "Read more" : "Read the script"} body={c.body} />
        <Links links={c.links} />
        {c.publishedUrl?.startsWith("https://") && (
          <p className="mt-3">
            <a
              href={c.publishedUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center text-sm text-accent underline underline-offset-2"
            >
              See the post<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        )}
        {c.status === "waiting" && (
          <p className="mt-3 text-sm text-text-2">
            It is waiting for your answer.{" "}
            <Link href="/admin/hq/marketing" className="text-accent underline underline-offset-2">
              Answer it on the Marketing page
            </Link>
            .
          </p>
        )}
      </Section>

      {editable && (
        <Section title="Change it">
          <form action={updateContentAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="op" value="edit" />
            <Field label="Title" htmlFor="c-title" className="sm:col-span-2">
              <Input id="c-title" name="title" defaultValue={c.title} maxLength={160} required className="h-11" />
            </Field>
            <Field label="Hook" htmlFor="c-hook" className="sm:col-span-2">
              <Input id="c-hook" name="hook" defaultValue={c.hook ?? ""} maxLength={400} className="h-11" />
            </Field>
            <Field label="When" htmlFor="c-when" hint="In your time zone. Leave empty for no date.">
              <Input id="c-when" name="scheduledFor" type="datetime-local" defaultValue={toLocalInput(c.scheduledFor, tz)} className="h-11" />
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton pendingText="Saving…">Save</SubmitButton>
            </div>
          </form>
          <form action={updateContentAction} className="mt-4 border-t border-border/60 pt-4">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="op" value="drop" />
            <SubmitButton variant="secondary" pendingText="Dropping…">
              Drop it
            </SubmitButton>
            <p className="mt-2 text-xs text-muted">It stays here, marked as dropped, and won&apos;t be posted.</p>
          </form>
        </Section>
      )}
    </div>
  );
}
