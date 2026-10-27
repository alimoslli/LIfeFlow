import type { Metadata } from "next";
import { Archive, Brain, RotateCcw, Trash2 } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/surface";
import { formatIn } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { jarvisStatus } from "@/server/jarvis/providers";
import { listAllMemories } from "@/server/services/memory";
import { addMemoryAction, archiveMemoryAction, deleteMemoryAction } from "../actions";

export const metadata: Metadata = { title: "Jarvis & memory" };

export default async function MemorySettings() {
  const d = await withCurrentUser(async (s, u) => ({ memories: await listAllMemories(s), tz: u.timezone }));
  const status = jarvisStatus();
  const now = new Date();
  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">AI model</h2>
            <p className="text-sm text-muted">{status.available ? `Connected · ${status.provider} · ${status.model}` : status.reason}</p>
          </div>
          <Badge tone={status.available ? "success" : "warning"}>{status.available ? "Ready" : "Not configured"}</Badge>
        </div>
        <p className="mt-3 text-xs text-muted">
          The model is set on the server (OPENAI_MODEL). Your API key is never sent to the browser. Conversations are stored in your LifeFlow database and sent to OpenAI with store=false.
        </p>
      </Card>
      <Card>
        <CardHeader title="What Jarvis remembers" subtitle="Used in every conversation. Edit or delete anything — sensitive data like passwords and account numbers is refused automatically." />
        {d.memories.length === 0 ? (
          <EmptyState icon={<Brain />} title="No memories yet">
            Tell Jarvis “Remember that I prefer studying in the morning”, or add one below.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {d.memories.map((m) => {
              const expired = m.expiresAt && m.expiresAt < now;
              const inactive = m.status === "archived" || expired;
              return (
                <li key={m.id} className={cn("flex items-start gap-3 px-5 py-3", inactive && "opacity-60")}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{m.content}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <Badge>{m.category}</Badge>
                      <span>{m.source === "jarvis" ? "Saved by Jarvis" : "Added by you"} · {formatIn(m.createdAt, d.tz, "MMM d, yyyy")}</span>
                      {m.expiresAt && <span>· {expired ? "expired" : "expires"} {formatIn(m.expiresAt, d.tz, "MMM d")}</span>}
                      {m.status === "archived" && <Badge tone="neutral">Archived</Badge>}
                    </p>
                  </div>
                  {m.status === "active" ? (
                    <ActionButton action={archiveMemoryAction.bind(null, m.id, "archived")} title="Archive (Jarvis stops using it)" className="p-1 text-muted hover:text-text">
                      <Archive className="h-4 w-4" />
                    </ActionButton>
                  ) : (
                    <ActionButton action={archiveMemoryAction.bind(null, m.id, "active")} title="Restore" className="p-1 text-muted hover:text-text">
                      <RotateCcw className="h-4 w-4" />
                    </ActionButton>
                  )}
                  <ActionButton action={deleteMemoryAction.bind(null, m.id)} confirm="Delete this memory permanently?" title="Delete memory" className="p-1 text-muted hover:text-danger">
                    <Trash2 className="h-4 w-4" />
                  </ActionButton>
                </li>
              );
            })}
          </ul>
        )}
        <div className="border-t border-border p-5">
          <ActionForm action={addMemoryAction} className="gap-3">
            <Field label="Add a memory" htmlFor="m-c">
              <Input id="m-c" name="content" required minLength={3} maxLength={500} placeholder="I work at the campus library on Tuesdays and Thursdays." />
            </Field>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Kind" htmlFor="m-k">
                <Select id="m-k" name="category" defaultValue="preference" className="w-40">
                  <option value="preference">Preference</option>
                  <option value="goal">Goal</option>
                  <option value="routine">Routine</option>
                  <option value="project">Project</option>
                  <option value="fact">Fact</option>
                  <option value="temporary">Temporary</option>
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
    </div>
  );
}
