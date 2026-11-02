import { Badge, Card, EmptyState } from "@/components/ui/surface";
import { AdminTitle, Notice } from "../ui";
import { SubmitButton } from "@/components/ui/button";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { listErrors, safe } from "@/server/services/admin";
import { clearErrorAction } from "../actions";
import { Failed, adminTz, ago, fmt } from "../format";

/** Grouped, scrubbed error reports (no emails or ids). The owner also gets an email on the 1st, 10th, 100th and 1,000th time. */
export default async function AdminErrors({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const r = await safe("errors", () => listErrors(getDb()));
  const tz = await adminTz();
  return (
    <div className="flex flex-col gap-5">
      <AdminTitle title="Errors" sub="Grouped and scrubbed of personal details. You're emailed on the 1st, 10th, 100th and 1,000th time." />
      <Notice done={sp.done} error={sp.error} />
      {!r.ok ? (
        <Card className="p-5 text-sm text-danger">{Failed()}</Card>
      ) : r.data.length === 0 ? (
        <EmptyState title="No errors recorded">Nothing has failed. This page fills in if something does.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {r.data.map((e) => (
            <li key={e.fingerprint}>
              <Card className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={e.source === "server" ? "danger" : "warning"}>{e.source === "server" ? "Server" : "Browser"}</Badge>
                  <Badge>{e.count}×</Badge>
                  <span className="min-w-0 truncate text-sm text-muted">{e.route}</span>
                </div>
                <p className="mt-2 text-[0.9375rem] break-words">{e.message}</p>
                <p className="mt-1 text-xs text-muted">
                  Last {ago(e.lastSeenAt)} · first {fmt(e.firstSeenAt, tz)}
                </p>
                <form action={clearErrorAction} className="mt-3">
                  <input type="hidden" name="fingerprint" value={e.fingerprint} />
                  <SubmitButton variant="secondary" size="sm" pendingText="Clearing…">
                    Clear
                  </SubmitButton>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
