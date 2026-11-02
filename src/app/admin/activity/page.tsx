import { Card, EmptyState, Tabs } from "@/components/ui/surface";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { recentActions, safe } from "@/server/services/admin";
import { ADMIN_TABS, Failed, adminTz, fmt } from "../format";

const LABEL: Record<string, string> = {
  "user.sign_out_everywhere": "Signed a user out everywhere",
  "user.suspend": "Suspended a user",
  "user.unsuspend": "Unsuspended a user",
  "user.set_plan": "Changed a plan",
  "user.delete": "Deleted a user",
  "error.clear": "Cleared an error",
};

/** Everything done on the admin page: who, what, to whom, when. */
export default async function AdminActivity() {
  await requireAdmin();
  const r = await safe("activity", () => recentActions(getDb(), 50));
  const tz = await adminTz();
  return (
    <div className="flex flex-col gap-5">
      <Tabs items={ADMIN_TABS} current="activity" />
      {!r.ok ? (
        <Card className="p-5 text-sm text-danger">{Failed()}</Card>
      ) : r.data.length === 0 ? (
        <EmptyState title="Nothing yet">Actions you take on this page are listed here.</EmptyState>
      ) : (
        <Card className="px-5 py-1">
          <ul className="divide-y divide-border">
            {r.data.map((a) => (
              <li key={a.id} className="py-3.5">
                <p className="text-[15px] font-medium">{LABEL[a.action] ?? a.action}</p>
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
    </div>
  );
}
