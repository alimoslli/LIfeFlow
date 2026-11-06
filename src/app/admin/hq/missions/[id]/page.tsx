import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/surface";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Links, Section, StatusIcon } from "@/components/hq/cards";
import { CopyAndOpen } from "@/components/hq/copy-open";
import { PRIORITY_LABEL, STATUS_LABEL, dayLabel } from "@/components/hq/labels";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { chatUrl, employee } from "@/server/hq/team";
import { getMission, listChats, markMissionSeen } from "@/server/services/hq";
import { safe } from "@/server/services/admin";
import { adminTz, fmt } from "../../../format";
import { Notice } from "../../../ui";
import { updateMissionAction } from "../../actions";

const UUID = /^[0-9a-f-]{20,40}$/i;

/** One mission: everything about it, and the owner's controls. */
export default async function MissionDetail({
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
  const db = getDb();
  const r = await safe("hq-mission", () => getMission(db, id));
  if (!r.ok || !r.data) notFound();
  const m = r.data;
  // Opening a finished mission stops its "done" sparkle.
  if (m.status === "done" && !m.seenAt) await safe("hq-seen", () => markMissionSeen(db, m.id));
  const chats = await safe("hq-chats", () => listChats(db));
  const chat = chats.ok
    ? ((m.sessionId ? chats.data.find((c) => c.id === m.sessionId) : undefined) ?? chats.data.find((c) => c.role === m.role && c.isPrimary))
    : undefined;
  const openUrl = m.sessionId ? chatUrl(m.sessionId) : (chat?.url ?? null);
  const tz = await adminTz();
  const who = employee(m.role);
  const handoff = `${m.title}${m.detail ? `\n\n${m.detail}` : ""}`;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <Link href="/admin/hq/missions" className="inline-flex min-h-11 items-center text-sm text-text-2">
          ← All missions
        </Link>
        <h1 className="font-display text-[1.75rem] leading-tight font-medium tracking-tight break-words">{m.title}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-text-2">
          <StatusIcon status={m.status} /> {STATUS_LABEL[m.status]} · {who.title} · {PRIORITY_LABEL[m.priority]} priority
          {m.dueOn && <Badge tone="info">Due {dayLabel(m.dueOn)}</Badge>}
        </p>
      </header>
      <Notice done={sp.done} error={sp.error} />

      <Section title="The details">
        {m.detail ? (
          <p className="text-sm break-words whitespace-pre-wrap text-text-2">{m.detail}</p>
        ) : (
          <p className="text-sm text-muted">No details written.</p>
        )}
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row k="Progress" v={m.progress} />
          <Row k="Blocked because" v={m.blockedReason} />
          <Row k="Result" v={m.result} />
          <Row k="Branch" v={m.branch} />
          <Row k="Source" v={m.source === "owner" ? "You" : m.source === "agent" ? "Your team" : "Imported"} />
          <Row k="Created" v={fmt(m.createdAt, tz)} />
          <Row k="Started" v={m.startedAt ? fmt(m.startedAt, tz) : null} />
          <Row k="Finished" v={m.doneAt ? fmt(m.doneAt, tz) : null} />
        </dl>
        <Links links={m.links} />
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Change the status">
          <form action={updateMissionAction} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={m.id} />
            <input type="hidden" name="op" value="status" />
            <Field label="Status" htmlFor="s-status">
              <Select id="s-status" name="status" defaultValue={m.status}>
                <option value="todo">To do</option>
                <option value="doing">Doing</option>
                <option value="waiting">Waiting on you</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
                <option value="dropped">Dropped</option>
              </Select>
            </Field>
            <Field label="Why it's blocked (only if blocked)" htmlFor="s-reason">
              <Input id="s-reason" name="reason" maxLength={500} defaultValue={m.blockedReason ?? ""} />
            </Field>
            <Field label="Result (when done)" htmlFor="s-result">
              <Textarea id="s-result" name="result" maxLength={2000} defaultValue={m.result ?? ""} placeholder="What was finished, in a sentence or two" />
            </Field>
            <div>
              <SubmitButton pendingText="Saving…">Save status</SubmitButton>
            </div>
          </form>
        </Section>

        <div className="flex flex-col gap-5">
          <Section title="Progress">
            <form action={updateMissionAction} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={m.id} />
              <input type="hidden" name="op" value="progress" />
              <Field label="Where it is now" htmlFor="p-progress">
                <Textarea id="p-progress" name="progress" maxLength={1000} defaultValue={m.progress ?? ""} />
              </Field>
              <div>
                <SubmitButton variant="secondary" pendingText="Saving…">
                  Save progress
                </SubmitButton>
              </div>
            </form>
          </Section>
          <Section title="Add a link">
            <form action={updateMissionAction} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={m.id} />
              <input type="hidden" name="op" value="link" />
              <input type="hidden" name="links" value={JSON.stringify(m.links)} />
              <Field label="Name" htmlFor="l-label">
                <Input id="l-label" name="label" maxLength={80} placeholder="Prototype" />
              </Field>
              <Field label="Address" htmlFor="l-url">
                <Input id="l-url" name="url" required maxLength={500} placeholder="https://…" />
              </Field>
              <div>
                <SubmitButton variant="secondary" pendingText="Adding…">
                  Add link
                </SubmitButton>
              </div>
            </form>
          </Section>
        </div>
      </div>

      {openUrl && (
        <Section title="Talk to them" sub="Copies the mission, then opens the real chat for you to paste it.">
          <CopyAndOpen url={openUrl} defaultText={handoff} label="Copy and open chat" />
        </Section>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null }) {
  if (!v) return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="break-words whitespace-pre-wrap text-text">{v}</dd>
    </div>
  );
}
