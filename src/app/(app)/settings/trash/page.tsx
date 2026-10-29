import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { ActionButton } from "@/components/action-form";
import { Card, EmptyState } from "@/components/ui/surface";
import { formatIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { listTrash, TRASH_DAYS } from "@/server/services/trash";
import { deleteForeverAction, restoreAction } from "../../trash-actions";
import { SettingsHeader } from "../settings-header";

export const metadata: Metadata = { title: "Trash" };

const KIND: Record<string, string> = {
  task: "To-do",
  note: "Note",
  event: "Event",
  assignment: "Assignment",
  shift: "Shift",
  transaction: "Transaction",
  goal: "Goal",
  budget: "Budget",
  course: "Class",
  project: "Project",
};

export default async function TrashPage() {
  const d = await withCurrentUser(async (s, u) => ({ items: await listTrash(s), tz: u.timezone }));
  return (
    <div className="flex flex-col gap-3">
      <SettingsHeader title="Recently deleted" />
      <p className="text-sm text-text-2">Items are removed for good after {TRASH_DAYS} days.</p>
      <Card>
        {d.items.length === 0 ? (
          <EmptyState icon={<Trash2 />} title="Nothing here" />
        ) : (
          <ul className="divide-y divide-border">
            {d.items.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 break-words text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-muted">
                    {KIND[t.kind] ?? t.kind} · deleted {formatIn(t.deletedAt, d.tz, "MMM d, h:mm a")}
                  </p>
                </div>
                <ActionButton action={restoreAction.bind(null, t.id)} title={`Restore ${t.label}`} className="rounded-full bg-surface-2 px-3 py-1.5 text-sm">
                  Restore
                </ActionButton>
                <ActionButton
                  action={deleteForeverAction.bind(null, t.id)}
                  confirm={`Delete "${t.label}" permanently? This can't be undone.`}
                  title={`Delete ${t.label} permanently`}
                  className="rounded-full px-3 py-1.5 text-sm text-muted hover:text-danger"
                >
                  Delete forever
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
