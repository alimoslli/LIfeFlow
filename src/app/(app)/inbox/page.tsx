import { AssistantName } from "@/components/assistant-name";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, CheckCircle2, CircleSlash, FileText, Mail, Undo2 } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { SegmentedNav, UPDATES } from "@/components/ui/segmented-nav";
import { Card } from "@/components/ui/surface";
import { formatIn } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { inboxAddress, listInbox, listSenders } from "@/server/services/inbox";
import { extractionClient } from "@/server/services/inbox/extract";
import { addSenderAction, removeSenderAction, fileSuggestionAction, answerQuestionAction, undoInboxAction, verifySenderAction } from "./actions";
import { CopyAddress, InboxUpload } from "./upload";
import { StillBuilding } from "@/components/still-building";

export const metadata: Metadata = { title: "Filed" };

const STATUS = {
  filed: { icon: CheckCircle2, tone: "text-success", label: "Filed" },
  suggested: { icon: Mail, tone: "text-accent", label: "Waiting for you" },
  needs_review: { icon: AlertCircle, tone: "text-warning", label: "Needs you" },
  ignored: { icon: CircleSlash, tone: "text-muted", label: "Ignored" },
  failed: { icon: AlertCircle, tone: "text-danger", label: "Couldn't read" },
  undone: { icon: Undo2, tone: "text-muted", label: "Undone" },
  duplicate: { icon: CircleSlash, tone: "text-muted", label: "Already filed" },
  processing: { icon: FileText, tone: "text-muted", label: "Reading" },
} as const;

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ shared?: string }> }) {
  const { shared } = await searchParams;
  const d = await withCurrentUser(async (s, u) => ({
    address: await inboxAddress(getDb(), u.id),
    senders: await listSenders(s),
    items: await listInbox(s),
    tz: u.timezone,
    canRead: !!extractionClient(),
  }));
  const pending = d.senders.filter((x) => !x.verifiedAt);
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6">
      <header>
        <h1 className="font-display text-[2.125rem] leading-tight font-medium tracking-tight">Updates</h1>
        <p className="mt-1 text-sm text-text-2">
          Send bills, receipts and school emails. <AssistantName start /> files them.
        </p>
      </header>
      <SegmentedNav label="Updates" items={UPDATES} active="filed" />
      {shared === "1" && (
        <p className="rounded-2xl bg-success-soft px-4 py-3 text-sm text-success">
          Got it. <AssistantName start /> filed what you shared; see it below.
        </p>
      )}
      {shared === "0" && (
        <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">That share couldn&apos;t be read. Try adding it here instead.</p>
      )}
      {!d.canRead && <StillBuilding className="rounded-2xl bg-surface-2 px-4 py-3" detail="Reading documents isn't ready yet. Items wait here until it is." />}

      <Card className="flex flex-col gap-4 p-5">
        <InboxUpload />
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            <Mail className="h-4 w-4" /> Your forwarding address
          </h2>
          {d.address ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded-xl bg-surface-2 px-3 py-2 text-sm break-all" data-testid="inbox-address">
                {d.address}
              </code>
              <CopyAddress address={d.address} />
            </div>
          ) : (
            <StillBuilding className="mt-1" line={1} detail="Email forwarding is on its way. Photo and PDF uploads work now." />
          )}
        </div>
        <div>
          <h3 className="text-sm font-medium text-text-2">Addresses allowed to forward</h3>
          <p className="text-xs text-muted">Mail from anywhere else is ignored.</p>
          <ul className="mt-2 flex flex-col gap-1">
            {d.senders.map((x) => (
              <li key={x.id} className="flex min-h-11 items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 break-all">{x.email}</span>
                <span className={cn("text-xs", x.verifiedAt ? "text-success" : "text-warning")}>{x.verifiedAt ? "Verified" : "Waiting for code"}</span>
                <ActionButton action={removeSenderAction.bind(null, x.id)} title={`Remove ${x.email}`} className="rounded-full px-2 text-xs text-muted">
                  Remove
                </ActionButton>
              </li>
            ))}
          </ul>
          <ActionForm action={addSenderAction} className="mt-2 flex-row items-end gap-2">
            <Field label="Add your email address" htmlFor="sender-email" className="flex-1">
              <Input id="sender-email" name="email" type="email" required placeholder="you@school.edu" className="h-11" />
            </Field>
            <SubmitButton className="min-h-11">Add</SubmitButton>
          </ActionForm>
          {pending.map((x) => (
            <ActionForm key={x.id} action={verifySenderAction} className="mt-2 flex-row items-end gap-2">
              <input type="hidden" name="email" value={x.email} />
              <Field label={`Code sent to ${x.email}`} htmlFor={`code-${x.id}`} className="flex-1">
                <Input id={`code-${x.id}`} name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className="h-11" />
              </Field>
              <SubmitButton className="min-h-11">Verify</SubmitButton>
            </ActionForm>
          ))}
        </div>
      </Card>

      <section className="flex flex-col gap-3" aria-label="Received">
        {d.items.length === 0 && <p className="text-sm text-muted">Nothing yet. Forward an email or add a photo to try it.</p>}
        {d.items.map((i) => {
          const st = STATUS[i.status];
          const ask = (
            i.extracted as {
              ask?: {
                kind?: "bill" | "exam";
                verified?: boolean;
                answered?: string;
                sameAs?: string;
                twin?: string;
                seriesKey?: string;
                options?: { id: string; label: string }[];
              };
            } | null
          )?.ask;
          return (
            <Card as="article" key={i.id} className="p-4">
              <div className="flex items-start gap-3">
                <st.icon className={cn("mt-0.5 h-5 w-5 shrink-0", st.tone)} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">
                    {st.label} · {i.channel === "email" ? `email from ${i.fromAddress}` : i.channel === "share" ? "shared" : "uploaded"} ·{" "}
                    {formatIn(i.receivedAt, d.tz, "MMM d, h:mm a")}
                  </p>
                  <p className="text-[0.9375rem] font-medium break-words">{i.subject || "(no subject)"}</p>
                  {i.summary && <p className="text-sm text-text-2">{i.summary}</p>}
                  {i.filed.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {i.filed.map((f) => (
                        <li key={f.id} className={cn("text-sm", i.status === "undone" && "line-through opacity-60")}>
                          {f.href && i.status !== "undone" ? (
                            <Link href={f.href} className="text-accent">
                              {f.label}
                            </Link>
                          ) : (
                            f.label
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {i.reason && i.status !== "suggested" && <p className="mt-1 text-sm text-text-2">{i.reason}</p>}
                </div>
              </div>
              {i.status === "suggested" && (
                <div className="mt-2 flex justify-end">
                  <ActionButton action={fileSuggestionAction.bind(null, i.id)} className="min-h-11 rounded-full bg-accent px-4 text-sm font-medium text-white">
                    {i.reason ?? "File this?"}
                  </ActionButton>
                </div>
              )}
              {i.status === "needs_review" && ask?.verified && !ask.answered && (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end" data-testid="same-question">
                  {ask.options?.map((o) => (
                    <ActionButton
                      key={o.id}
                      action={answerQuestionAction.bind(null, i.id, true, o.id)}
                      className="min-h-11 rounded-2xl bg-accent px-4 py-2 text-left text-[0.875rem] font-medium text-white"
                    >
                      It&apos;s this one: {o.label}
                    </ActionButton>
                  ))}
                  {!ask.options && (ask.sameAs || ask.twin || ask.seriesKey) && (
                    <ActionButton
                      action={answerQuestionAction.bind(null, i.id, true, undefined)}
                      className="min-h-11 rounded-full bg-accent px-4 text-sm font-medium text-white"
                    >
                      {ask.kind === "exam" ? "Yes, it moved" : "Yes, it\u2019s the same"}
                    </ActionButton>
                  )}
                  <ActionButton
                    action={answerQuestionAction.bind(null, i.id, false, undefined)}
                    className="min-h-11 rounded-full bg-surface-2 px-4 text-sm font-medium text-text"
                  >
                    {ask.kind === "exam" ? "No, keep the old date" : ask.options ? "It\u2019s a new bill" : "No, keep both"}
                  </ActionButton>
                </div>
              )}
              {(i.status === "filed" || (i.status !== "undone" && ask?.answered)) && !i.filed.some((f) => f.stale) && (
                <div className="mt-2 flex justify-end">
                  <ActionButton action={undoInboxAction.bind(null, i.id)} className="flex items-center gap-1 rounded-full px-3 text-sm text-text-2">
                    <Undo2 className="h-4 w-4" /> Undo
                  </ActionButton>
                </div>
              )}
            </Card>
          );
        })}
      </section>
    </div>
  );
}
