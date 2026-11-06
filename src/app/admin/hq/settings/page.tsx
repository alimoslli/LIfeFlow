import { cookies } from "next/headers";
import { Badge } from "@/components/ui/surface";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Empty, Section } from "@/components/hq/cards";
import { ClearOnce } from "@/components/hq/copy-open";
import { ControlsForm } from "@/components/hq/marketing";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { EMPLOYEES, USAGE_PLAN } from "@/server/hq/team";
import type { Chat } from "@/server/hq/types";
import { listChats, listHqKeys } from "@/server/services/hq";
import { getControls } from "@/server/services/hq-marketing";
import { safe } from "@/server/services/admin";
import { Failed, adminTz, fmt } from "../../format";
import { AdminTitle, Notice } from "../../ui";
import { createKeyAction, importSeedAction, removeChatAction, revokeKeyAction, saveChatAction } from "../actions";
import { NEW_KEY_COOKIE } from "../shared";

const RoleSelect = ({ id, value }: { id: string; value: string | null }) => (
  <Select id={id} name="role" defaultValue={value ?? ""}>
    <option value="">No one yet</option>
    {EMPLOYEES.filter((e) => e.role !== "assistant").map((e) => (
      <option key={e.role} value={e.role}>
        {e.title}
      </option>
    ))}
  </Select>
);

function ChatForm({ chat }: { chat: Chat }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3.5">
      <form action={saveChatAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="id" value={chat.id} />
        <Field label="Title" htmlFor={`c-title-${chat.id}`}>
          <Input id={`c-title-${chat.id}`} name="title" defaultValue={chat.title} maxLength={120} required />
        </Field>
        <Field label="Belongs to" htmlFor={`c-role-${chat.id}`}>
          <RoleSelect id={`c-role-${chat.id}`} value={chat.role} />
        </Field>
        <Field label="Branch" htmlFor={`c-branch-${chat.id}`}>
          <Input id={`c-branch-${chat.id}`} name="branch" defaultValue={chat.branch ?? ""} maxLength={160} />
        </Field>
        <label className="flex min-h-11 items-center gap-2.5 text-sm text-text-2 sm:self-end">
          <input type="checkbox" name="isPrimary" defaultChecked={chat.isPrimary} className="h-5 w-5 accent-[var(--accent)]" />
          Their main chat
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <SubmitButton size="sm" pendingText="Saving…">
            Save chat
          </SubmitButton>
          <span className="min-w-0 truncate text-xs text-muted">Session {chat.id}</span>
        </div>
      </form>
      <form action={removeChatAction} className="mt-1">
        <input type="hidden" name="id" value={chat.id} />
        <SubmitButton variant="ghost" size="sm" pendingText="Removing…">
          Remove from HQ
        </SubmitButton>
      </form>
    </div>
  );
}

/** Chats, HQ keys, the weekly usage plan and what isn't connected yet. */
export default async function HqSettings({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const db = getDb();
  const [chats, keys, controls] = await Promise.all([
    safe("hq-chats", () => listChats(db)),
    safe("hq-keys", () => listHqKeys(db)),
    safe("hq-controls", () => getControls(db)),
  ]);
  const tz = await adminTz();
  const newKey = (await cookies()).get(NEW_KEY_COOKIE)?.value ?? null;

  return (
    <div className="flex flex-col gap-5">
      <AdminTitle title="HQ settings" sub="How the team runs, chats, keys and the weekly plan." />
      <Notice done={sp.done} error={sp.error} />

      <Section title="How the team runs" sub="Read by every round before it starts.">
        {controls.ok ? <ControlsForm c={controls.data} tz={tz} /> : <Empty>{Failed()}</Empty>}
      </Section>

      <Section title="Chats" sub="Which real Claude Code chat belongs to which employee. HQ only links to them.">
        <div className="flex flex-col gap-3">
          {!chats.ok ? (
            <Empty>{Failed()}</Empty>
          ) : chats.data.length ? (
            <>
              {chats.data.some((c) => c.role) && chats.data.filter((c) => c.role).map((c) => <ChatForm key={c.id} chat={c} />)}
              {chats.data.some((c) => !c.role) && (
                <>
                  <p className="mt-2 text-sm font-medium text-text">Not assigned yet (newest first)</p>
                  {chats.data
                    .filter((c) => !c.role)
                    .map((c) => (
                      <ChatForm key={c.id} chat={c} />
                    ))}
                </>
              )}
            </>
          ) : (
            <Empty>No chats added yet.</Empty>
          )}
        </div>
        <form action={importSeedAction} className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
          <SubmitButton variant="secondary" size="sm" pendingText="Importing…">
            Import the starting list
          </SubmitButton>
          <span className="min-w-0 text-xs text-muted">Adds the real chats, missions and approvals from the handover. Safe to press twice.</span>
        </form>
        <form action={saveChatAction} className="mt-4 grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-2">
          <p className="text-sm font-medium text-text sm:col-span-2">Add a chat by its session id</p>
          <Field label="Session id" htmlFor="n-id" hint="The last part of the chat's address, like session_01Abc…">
            <Input id="n-id" name="id" required maxLength={120} placeholder="session_…" autoComplete="off" />
          </Field>
          <Field label="Title" htmlFor="n-title">
            <Input id="n-title" name="title" maxLength={120} placeholder="LF Main" />
          </Field>
          <Field label="Belongs to" htmlFor="n-role">
            <RoleSelect id="n-role" value={null} />
          </Field>
          <Field label="Branch (optional)" htmlFor="n-branch">
            <Input id="n-branch" name="branch" maxLength={160} />
          </Field>
          <label className="flex min-h-11 items-center gap-2.5 text-sm text-text-2">
            <input type="checkbox" name="isPrimary" className="h-5 w-5 accent-[var(--accent)]" />
            Their main chat
          </label>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Adding…">Add chat</SubmitButton>
          </div>
        </form>
      </Section>

      <Section title="HQ keys" sub="Chats use a key to report in. Keep it as a secret on the cloud environment, never in a chat.">
        {newKey && (
          <div className="mb-4 rounded-2xl bg-accent-soft p-3.5" role="status">
            <p className="text-sm font-medium text-text">Your new key. It is shown once: copy it now.</p>
            <p data-testid="hq-new-key" className="mt-1.5 rounded-xl bg-surface px-3 py-2 font-mono text-[0.8125rem] break-all text-text select-all">
              {newKey}
            </p>
            <ClearOnce url="/admin/hq/key-seen" />
          </div>
        )}
        {!keys.ok ? (
          <Empty>{Failed()}</Empty>
        ) : keys.data.length ? (
          <ul className="flex flex-col divide-y divide-border/60">
            {keys.data.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">
                    {k.name} {k.revokedAt && <Badge tone="danger">Revoked</Badge>}
                  </p>
                  <p className="text-xs text-muted">
                    Created {fmt(k.createdAt, tz)} · {k.lastUsedAt ? `last used ${fmt(k.lastUsedAt, tz)}` : "never used"}
                  </p>
                </div>
                {!k.revokedAt && (
                  <form action={revokeKeyAction}>
                    <input type="hidden" name="id" value={k.id} />
                    <SubmitButton variant="secondary" size="sm" pendingText="Revoking…">
                      Revoke
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No keys yet.</Empty>
        )}
        <form action={createKeyAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-border/60 pt-4">
          <Field label="Key name" htmlFor="k-name" className="min-w-0 flex-1 basis-48">
            <Input id="k-name" name="name" required minLength={2} maxLength={60} placeholder="Cloud environment" />
          </Field>
          <SubmitButton pendingText="Creating…">Create key</SubmitButton>
        </form>
      </Section>

      <Section title="The weekly usage plan">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-text-2">
          <li>
            Aim to use {USAGE_PLAN.targetLow}–{USAGE_PLAN.target}% of your Claude week on automated work. Never more than {USAGE_PLAN.ceiling}%.
          </li>
          <li>
            Split: engineering and research {USAGE_PLAN.split.engineering}%, marketing {USAGE_PLAN.split.marketing}%, a reserve of {USAGE_PLAN.split.reserve}%.
          </li>
          <li>
            How it is measured: each round records your weekly usage meter at its start and end, and the difference is that round&apos;s share. The meter covers
            your whole account, including your own chats, and only updates after replies.
          </li>
          <li>It is a guide, not a hard cap: a step already running finishes. No new round starts once rounds have used {USAGE_PLAN.target}%.</li>
        </ul>
      </Section>

      <Section title="Connections">
        <p className="text-sm text-text-2">Marketing numbers come from Metricool. Connect each network there; HQ only shows what the team reports.</p>
      </Section>
    </div>
  );
}
