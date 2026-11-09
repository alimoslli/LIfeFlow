import Link from "next/link";
import { Mail } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui/surface";
import { SubmitButton } from "@/components/ui/button";
import { getDb } from "@/server/db/client";
import { inboxCounts, listInbox, safe, type InboxFilter } from "@/server/services/admin";
import { inboxHandledAction } from "../actions";
import type { PeopleParams } from "../users/section";
import { Failed, adminTz, ago, fmt } from "../format";
import { PageSection } from "../ui";
import { cn } from "@/lib/utils";

const KIND = { bug: { label: "Bug", tone: "danger" }, idea: { label: "Idea", tone: "info" }, other: { label: "Feedback", tone: "neutral" } } as const;
const STATUSES = [
  { key: "open", label: "Open" },
  { key: "handled", label: "Handled" },
  { key: "all", label: "All" },
] as const;

/** Everything people send from Settings → Send feedback, newest first. Each message is also emailed to the owner. */
export async function FeedbackSection({ sp }: { sp: PeopleParams }) {
  const status = (STATUSES.find((s) => s.key === sp.fstatus)?.key ?? "open") as NonNullable<InboxFilter["status"]>;
  const kind = sp.fkind === "bug" || sp.fkind === "idea" || sp.fkind === "other" ? sp.fkind : undefined;
  const db = getDb();
  const [r, c] = await Promise.all([safe("feedback", () => listInbox(db, { status, kind })), safe("feedback-counts", () => inboxCounts(db))]);
  const tz = await adminTz();
  // The feedback filter is fstatus / fkind so it can't clash with the user search on the same page.
  const href = (s: string, k?: string) => {
    const p = new URLSearchParams();
    for (const key of ["q", "plan", "status", "page"] as const) if (sp[key]) p.set(key, sp[key]);
    p.set("fstatus", s);
    if (k) p.set("fkind", k);
    return `/admin/people?${p}`;
  };
  const here = href(status, kind);
  return (
    <PageSection
      id="feedback"
      title="Feedback"
      sub={c.ok ? `${c.data.open} open · ${c.data.total} received. Each one is also emailed to you.` : "From Settings → Send feedback."}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full bg-surface-2 p-1">
          {STATUSES.map((s) => (
            <Link
              key={s.key}
              href={`${href(s.key, kind)}#feedback`}
              aria-current={s.key === status ? "page" : undefined}
              className={cn("min-h-11 rounded-full px-4 py-2 text-sm", s.key === status ? "bg-surface font-medium shadow-soft" : "text-text-2")}
            >
              {s.label}
            </Link>
          ))}
        </div>
        {([undefined, "bug", "idea", "other"] as const).map((k) => (
          <Link
            key={k ?? "any"}
            href={`${href(status, k)}#feedback`}
            aria-current={k === kind ? "page" : undefined}
            className={cn("min-h-11 rounded-full px-3 py-2 text-sm", k === kind ? "bg-accent-soft font-medium text-text" : "text-text-2 hover:text-text")}
          >
            {k ? `${KIND[k].label}s` : "Every kind"}
          </Link>
        ))}
      </div>

      {!r.ok ? (
        <Card className="p-5 text-sm text-danger">{Failed()}</Card>
      ) : r.data.length === 0 ? (
        <EmptyState title={status === "open" ? "Nothing open" : "No feedback here"}>
          New feedback from Settings → Send feedback shows up here, with who sent it.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {r.data.map((f) => (
            <li key={f.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={KIND[f.kind].tone}>{KIND[f.kind].label}</Badge>
                  {f.handledAt && <Badge tone="success">Handled</Badge>}
                  <span className="text-xs text-muted" title={fmt(f.createdAt, tz)}>
                    {ago(f.createdAt)} · {fmt(f.createdAt, tz)}
                  </span>
                </div>
                <p className="mt-3 text-[1rem] leading-relaxed break-words whitespace-pre-wrap">{f.message}</p>
                <p className="mt-3 text-sm text-text-2">
                  From{" "}
                  {f.senderUserId ? (
                    <Link href={`/admin/users/${f.senderUserId}`} className="font-medium text-accent hover:underline">
                      {f.senderName}
                    </Link>
                  ) : (
                    <span className="font-medium">{f.senderName}</span>
                  )}{" "}
                  <span className="break-all text-muted">({f.senderEmail})</span>
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <form action={inboxHandledAction}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="handled" value={f.handledAt ? "0" : "1"} />
                    <input type="hidden" name="back" value={here} />
                    <SubmitButton variant={f.handledAt ? "secondary" : "primary"} size="sm" pendingText="Saving…">
                      {f.handledAt ? "Reopen" : "Mark handled"}
                    </SubmitButton>
                  </form>
                  <a
                    href={`mailto:${f.senderEmail}?subject=${encodeURIComponent("Re: your LifeFlow feedback")}`}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm text-text"
                  >
                    <Mail className="h-4 w-4" /> Reply by email
                  </a>
                  <span className="text-xs text-muted">{f.emailedAt ? "Emailed to you" : "Not emailed (email isn't set up yet)"}</span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageSection>
  );
}
