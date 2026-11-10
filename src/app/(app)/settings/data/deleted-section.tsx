import { PixelIcon } from "@/components/pixel/pixel-icon";
import { ActionButton } from "@/components/action-form";
import { Card } from "@/components/ui/surface";
import { formatIn } from "@/lib/dates";
import type { listTrash } from "@/server/services/trash";
import { TRASH_DAYS } from "@/server/services/trash";
import { deleteForeverAction, restoreAction } from "../../trash-actions";

const KIND: Record<string, string> = {
  task: "To-do",
  note: "Note",
  event: "Event",
  assignment: "Homework",
  shift: "Shift",
  transaction: "Transaction",
  goal: "Goal",
  budget: "Budget",
  course: "Class",
  project: "Project",
};

/**
 * Recently deleted, as a part of "Privacy and your data" (it was its own page; owner's page map 2026-11-10): bring
 * something back, or delete it for good. Items go for good on their own after TRASH_DAYS days.
 */
export function DeletedSection({ items, tz }: { items: Awaited<ReturnType<typeof listTrash>>; tz: string }) {
  return (
    <section id="deleted" aria-label="Recently deleted" className="scroll-mt-24">
      <Card className="p-5">
        <h2 className="font-medium">Recently deleted</h2>
        <p className="mt-1 text-sm text-text-2">Bring something back. Items go for good after {TRASH_DAYS} days.</p>
        {items.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted">
            <PixelIcon name="trash" className="h-4 w-4" /> Nothing here.
          </p>
        ) : (
          <ul className="lf-rows mt-3 -mx-3">
            {items.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 break-words text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-muted">
                    {KIND[t.kind] ?? t.kind} · deleted {formatIn(t.deletedAt, tz, "MMM d, h:mm a")}
                  </p>
                </div>
                <ActionButton action={restoreAction.bind(null, t.id)} title={`Restore ${t.label}`} className="lf-sb lf-sb-app lf-sb-xs lf-touch">
                  Restore
                </ActionButton>
                <ActionButton
                  action={deleteForeverAction.bind(null, t.id)}
                  confirm={`Delete "${t.label}" permanently? This can't be undone.`}
                  title={`Delete ${t.label} permanently`}
                  className="flex min-h-11 items-center rounded-full px-3 text-sm text-muted hover:text-danger"
                >
                  Delete forever
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
