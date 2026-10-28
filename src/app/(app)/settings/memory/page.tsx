import type { Metadata } from "next";
import { Archive, Brain, Check, RotateCcw, Trash2, X } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/surface";
import { formatIn } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { jarvisStats } from "@/server/jarvis/metrics";
import { jarvisStatus } from "@/server/jarvis/providers";
import { listAllMemories } from "@/server/services/memory";
import {
  updateAssistantAction,
  addMemoryAction,
  archiveMemoryAction,
  decideMemoryAction,
  deleteMemoryAction,
  setMemorySuggestionsAction,
  updateMemoryAction,
} from "../actions";
import { CATEGORY_LABEL, CATEGORY_OPTIONS } from "./categories";
import { EditMemory } from "./edit-memory";
import { AssistantCard } from "./assistant-card";
import { assistantProfile } from "@/lib/assistant";

export const metadata: Metadata = { title: "Assistant" };

const seconds = (ms: number | null) => (ms == null ? "None yet" : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`);
const compact = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export default async function MemorySettings() {
  const d = await withCurrentUser(async (s, u) => {
    const [all, stats] = await series(
      () => listAllMemories(s),
      () => jarvisStats(s, 30),
    );
    return { all, stats, tz: u.timezone, suggestionsOn: u.preferences?.memorySuggestions !== false, assistant: assistantProfile(u.preferences) };
  });
  const status = jarvisStatus();
  const now = new Date();
  const fmt = (x: Date, f = "MMM d, yyyy") => formatIn(x, d.tz, f);

  const replacedBy = new Map(d.all.filter((m) => m.supersedesId).map((m) => [m.supersedesId!, m]));
  const pending = d.all.filter((m) => m.status === "proposed");
  const active = d.all.filter((m) => m.status === "active" && !(m.expiresAt && m.expiresAt < now));
  const history = d.all.filter((m) => m.status === "archived" || m.status === "rejected" || (m.status === "active" && m.expiresAt && m.expiresAt < now));
  const groups = CATEGORY_OPTIONS.map(([cat, label]) => ({ cat, label, items: active.filter((m) => m.category === cat) })).filter((g) => g.items.length);
  const st = d.stats;
  const toolRate = st.toolCalls ? Math.round(((st.toolCalls - st.toolErrors) / st.toolCalls) * 100) : null;

  return (
    <div className="flex flex-col gap-5">
      <AssistantCard profile={d.assistant} action={updateAssistantAction} />
      {pending.length > 0 && (
        <Card>
          <CardHeader
            title={`Waiting for your OK (${pending.length})`}
            subtitle="Jarvis suggested remembering these. Nothing here is used until you keep it."
          />
          <ul className="divide-y divide-border">
            {pending.map((m) => (
              <li key={m.id} className="flex items-start gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  {m.supersedesId && <p className="text-xs text-muted line-through">{d.all.find((x) => x.id === m.supersedesId)?.content}</p>}
                  <p className="text-[15px]">{m.content}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <Badge tone={m.basis === "inferred" ? "info" : "neutral"}>{m.basis === "inferred" ? "Jarvis noticed" : "You mentioned it"}</Badge>
                    <span>
                      {CATEGORY_LABEL[m.category]} · suggested {fmt(m.createdAt, "MMM d")}
                    </span>
                  </p>
                </div>
                <ActionButton
                  action={decideMemoryAction.bind(null, m.id, "keep")}
                  title="Keep"
                  className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-text"
                >
                  <Check className="h-3.5 w-3.5" /> Keep
                </ActionButton>
                <ActionButton
                  action={decideMemoryAction.bind(null, m.id, "dismiss")}
                  title="Dismiss"
                  className="rounded-full bg-surface-2 p-2 text-muted hover:text-text"
                >
                  <X className="h-3.5 w-3.5" />
                </ActionButton>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader
          title="What Jarvis remembers"
          subtitle="Only the memories relevant to a request are sent with it. Edit, archive or delete anything. Passwords and account numbers are refused automatically."
        />
        <div className="mx-5 mb-2 flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Let Jarvis suggest things to remember</p>
            <p className="text-xs text-muted">When off, Jarvis only saves what you explicitly ask it to remember.</p>
          </div>
          <ActionButton
            action={setMemorySuggestionsAction.bind(null, !d.suggestionsOn)}
            title={d.suggestionsOn ? "Turn memory suggestions off" : "Turn memory suggestions on"}
            className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", d.suggestionsOn ? "bg-accent" : "bg-surface-3")}
          >
            <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left]", d.suggestionsOn ? "left-6" : "left-1")} />
            <span className="sr-only">{d.suggestionsOn ? "On" : "Off"}</span>
          </ActionButton>
        </div>

        {active.length === 0 ? (
          <EmptyState icon={<Brain />} title="Nothing remembered yet">
            Tell Jarvis “Remember that I prefer studying in the morning”, or add one below.
          </EmptyState>
        ) : (
          groups.map((g) => (
            <section key={g.cat} aria-label={g.label}>
              <h3 className="px-5 pt-4 pb-1 text-xs font-medium tracking-wide text-muted uppercase">{g.label}</h3>
              <ul className="divide-y divide-border">
                {g.items.map((m) => (
                  <li key={m.id} className="flex items-start gap-2 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px]">{m.content}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <Badge tone={m.basis === "inferred" ? "info" : "neutral"}>
                          {m.basis === "inferred" ? "Jarvis noticed · you approved" : m.source === "user" ? "Added by you" : "You told Jarvis"}
                        </Badge>
                        <span>{m.lastUsedAt ? `Last used ${fmt(m.lastUsedAt, "MMM d")}` : "Not used yet"}</span>
                        {m.expiresAt && <span>· until {fmt(m.expiresAt, "MMM d")}</span>}
                      </p>
                    </div>
                    <EditMemory
                      action={updateMemoryAction.bind(null, m.id)}
                      content={m.content}
                      category={m.category}
                      expires={m.expiresAt ? fmt(m.expiresAt, "yyyy-MM-dd") : undefined}
                    />
                    <ActionButton
                      action={archiveMemoryAction.bind(null, m.id, "archived")}
                      title="Archive (Jarvis stops using it)"
                      className="rounded-full p-2 text-muted hover:text-text"
                    >
                      <Archive className="h-4 w-4" />
                    </ActionButton>
                    <ActionButton
                      action={deleteMemoryAction.bind(null, m.id)}
                      confirm="Delete this memory permanently?"
                      title="Delete memory"
                      className="rounded-full p-2 text-muted hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </ActionButton>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        <div className="border-t border-border p-5">
          <ActionForm action={addMemoryAction} className="gap-3" showSuccess>
            <Field label="Add a memory" htmlFor="m-c">
              <Input id="m-c" name="content" required minLength={3} maxLength={500} placeholder="I work at the campus library on Tuesdays and Thursdays." />
            </Field>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Kind" htmlFor="m-k">
                <Select id="m-k" name="category" defaultValue="preference" className="w-52">
                  {CATEGORY_OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Expires (optional)" htmlFor="m-e">
                <Input id="m-e" name="expiresAt" type="date" className="w-44" />
              </Field>
              <SubmitButton>Add</SubmitButton>
            </div>
          </ActionForm>
        </div>
      </Card>

      {history.length > 0 && (
        <Card>
          <details>
            <summary className="cursor-pointer list-none px-5 py-4 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
              Archived &amp; dismissed ({history.length}) <span className="text-sm font-normal text-muted">· not used by Jarvis</span>
            </summary>
            <ul className="divide-y divide-border border-t border-border">
              {history.map((m) => {
                const newer = replacedBy.get(m.id);
                const expired = m.status === "active";
                return (
                  <li key={m.id} className="flex items-start gap-2 px-5 py-3 opacity-80">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{m.content}</p>
                      <p className="mt-1 text-xs text-muted">
                        {m.status === "rejected"
                          ? "You dismissed this suggestion"
                          : expired
                            ? `Expired ${fmt(m.expiresAt!, "MMM d")}`
                            : newer
                              ? `Replaced by “${newer.content}”`
                              : "Archived"}
                      </p>
                    </div>
                    {m.status === "archived" && (
                      <ActionButton
                        action={archiveMemoryAction.bind(null, m.id, "active")}
                        title="Restore"
                        className="rounded-full p-2 text-muted hover:text-text"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </ActionButton>
                    )}
                    <ActionButton
                      action={deleteMemoryAction.bind(null, m.id)}
                      confirm="Delete permanently?"
                      title="Delete permanently"
                      className="rounded-full p-2 text-muted hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </ActionButton>
                  </li>
                );
              })}
            </ul>
          </details>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">AI model</h2>
            <p className="text-sm text-muted">{status.available ? `Connected · ${status.provider} · ${status.model}` : status.reason}</p>
          </div>
          <Badge tone={status.available ? "success" : "warning"}>{status.available ? "Ready" : "Not configured"}</Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Your Jarvis use in the last 30 days">
          <Stat label="Requests (30 days)" value={String(st.runs)} />
          <Stat
            label="Typical reply"
            value={seconds(st.medianLatencyMs)}
            hint={st.medianFirstTokenMs != null ? `first words ${seconds(st.medianFirstTokenMs)}` : undefined}
          />
          <Stat
            label="Actions that worked"
            value={toolRate == null ? "None yet" : `${toolRate}%`}
            hint={st.toolCalls ? `${st.toolCalls - st.toolErrors} of ${st.toolCalls}` : undefined}
          />
          <Stat
            label="AI usage"
            value={st.inputTokens + st.outputTokens ? `${compact(st.inputTokens + st.outputTokens)} tokens` : "None yet"}
            hint={st.costMicros != null ? `≈ $${(st.costMicros / 1e6).toFixed(2)} estimated` : st.runs ? "cost not configured" : undefined}
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          These numbers are yours alone; they never include what you said. Conversations are stored in your LifeFlow database and sent to the AI provider only
          to answer you, with provider-side storage turned off.
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="font-medium">How Jarvis learns</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-2">
          <li>Jarvis doesn’t train or change the AI model with your data. It gets more personal through the memories on this page.</li>
          <li>It only saves something on its own when you ask (“remember that…”). Everything else is a suggestion you keep or dismiss.</li>
          <li>Corrections keep the old version here, so you can restore it.</li>
        </ul>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-3.5 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="tabular mt-0.5 text-lg font-medium">{value}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
