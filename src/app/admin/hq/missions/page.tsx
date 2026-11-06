import { Empty, MissionLine, Section } from "@/components/hq/cards";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { EMPLOYEES } from "@/server/hq/team";
import type { Mission } from "@/server/hq/types";
import { listMissions } from "@/server/services/hq";
import { safe } from "@/server/services/admin";
import { Failed } from "../../format";
import { AdminTitle, Notice } from "../../ui";
import { createMissionAction } from "../actions";

const byUpdated = (a: Mission, b: Mission) => b.updatedAt.getTime() - a.updatedAt.getTime();

/** The board: To do, Doing, Waiting on you or blocked, Done. One grouped list on phones, columns on wide screens. */
export default async function Missions({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const r = await safe("hq-missions", () => listMissions(getDb()));
  const all = r.ok ? r.data : [];
  const cols: { title: string; items: Mission[]; empty: string }[] = [
    { title: "To do", items: all.filter((m) => m.status === "todo").sort(byUpdated), empty: "Nothing queued." },
    { title: "Doing", items: all.filter((m) => m.status === "doing").sort(byUpdated), empty: "Nothing in progress." },
    { title: "Waiting on you or blocked", items: all.filter((m) => m.status === "waiting" || m.status === "blocked").sort(byUpdated), empty: "Nothing stuck." },
    {
      title: "Done",
      items: all
        .filter((m) => m.status === "done")
        .sort((a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0))
        .slice(0, 20),
      empty: "Nothing finished yet.",
    },
  ];
  return (
    <div className="flex flex-col gap-5">
      <AdminTitle title="Missions" sub="What your team is working on." />
      <Notice done={sp.done} error={sp.error} />
      {!r.ok && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{Failed()}</p>}

      <div className="grid gap-4 lg:grid-cols-4 lg:items-start">
        {cols.map((c) => (
          <Section key={c.title} title={c.title} sub={c.items.length ? `${c.items.length}` : undefined}>
            {c.items.length ? (
              <ul className="-mx-2 flex flex-col">
                {c.items.map((m) => (
                  <li key={m.id}>
                    <MissionLine m={m} />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>{c.empty}</Empty>
            )}
          </Section>
        ))}
      </div>

      <Section title="New mission" sub="Your team picks it up at their next round.">
        <form action={createMissionAction} className="grid gap-3 sm:grid-cols-2">
          <Field label="Who is it for" htmlFor="m-role">
            <Select id="m-role" name="role" required defaultValue="developer">
              {EMPLOYEES.map((e) => (
                <option key={e.role} value={e.role}>
                  {e.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title" htmlFor="m-title">
            <Input id="m-title" name="title" required minLength={3} maxLength={160} placeholder="Fix the calendar sync" />
          </Field>
          <Field label="Details (optional)" htmlFor="m-detail" className="sm:col-span-2">
            <Textarea id="m-detail" name="detail" maxLength={2000} placeholder="What done looks like, links, anything they should know" />
          </Field>
          <Field label="Priority" htmlFor="m-priority">
            <Select id="m-priority" name="priority" defaultValue="normal">
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </Select>
          </Field>
          <Field label="Due date (optional)" htmlFor="m-due">
            <Input id="m-due" name="dueOn" type="date" />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Adding…">New mission</SubmitButton>
          </div>
        </form>
      </Section>
    </div>
  );
}
