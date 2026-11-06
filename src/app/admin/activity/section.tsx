import { Card, EmptyState } from "@/components/ui/surface";
import { PageSection } from "../ui";
import { getDb } from "@/server/db/client";
import { recentActions, safe } from "@/server/services/admin";
import { Failed, adminTz, fmt } from "../format";

const LABEL: Record<string, string> = {
  "user.sign_out_everywhere": "Signed a user out everywhere",
  "user.suspend": "Suspended a user",
  "user.unsuspend": "Unsuspended a user",
  "user.set_plan": "Changed a plan",
  "user.delete": "Deleted a user",
  "error.clear": "Cleared an error",
  reset_limits: "Reset someone's AI limits",
  "feedback.handled": "Marked feedback handled",
  "feedback.reopened": "Reopened feedback",
  "announcement.create": "Published an announcement",
  "announcement.end": "Ended an announcement",
  "users.export": "Exported the user list",
};

/** Everything done on the admin page: who, what, to whom, when. */
export async function ActivitySection() {
  const r = await safe("activity", () => recentActions(getDb(), 50));
  const tz = await adminTz();
  return (
    <PageSection id="activity" title="Activity log" sub="Everything done on the admin page: what, to whom and when.">
      {!r.ok ? (
        <Card className="p-5 text-sm text-danger">{Failed()}</Card>
      ) : r.data.length === 0 ? (
        <EmptyState title="Nothing yet">Actions you take on this page are listed here.</EmptyState>
      ) : (
        <Card className="px-5 py-1">
          <ul className="divide-y divide-border">
            {r.data.map((a) => (
              <li key={a.id} className="py-3.5">
                <p className="text-[0.9375rem] font-medium">{LABEL[a.action] ?? a.action}</p>
                <p className="text-sm text-text-2">
                  {a.targetEmail ? `${a.targetEmail} · ` : ""}
                  by {a.actorEmail}
                </p>
                <p className="text-xs text-muted">{fmt(a.createdAt, tz)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </PageSection>
  );
}
