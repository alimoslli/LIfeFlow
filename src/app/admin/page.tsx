import Link from "next/link";
import { Badge, Card, Stat, Tabs } from "@/components/ui/surface";
import { Head } from "./head";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { errorsLast24h, health, listUsers, overview, safe } from "@/server/services/admin";
import { ADMIN_TABS, Failed, ago } from "./format";

/** Overview: who's here, whether the app is healthy, whether anything is failing. Each panel loads on its own. */
export default async function AdminHome() {
  await requireAdmin();
  const db = getDb();
  const [o, e, h, recent] = await Promise.all([
    safe("overview", () => overview(db)),
    safe("errors", () => errorsLast24h(db)),
    safe("health", () => health(db)),
    safe("recent", () => listUsers(db, {})),
  ]);
  const max = o.ok ? Math.max(1, ...o.data.signupsByDay.map((d) => d.n)) : 1;
  return (
    <div className="flex flex-col gap-5">
      <Tabs items={ADMIN_TABS} current="overview" />

      <Card className="p-5">
        <Head title="Users" />
        {o.ok ? (
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            <Stat label="Total users" value={o.data.users} />
            <Stat label="New today" value={o.data.new24h} />
            <Stat label="New this week" value={o.data.new7d} />
            <Stat label="New this month" value={o.data.new30d} />
            <Stat label="Active today" value={o.data.active24h} />
            <Stat label="Pro" value={o.data.pro} />
            <Stat label="Suspended" value={o.data.suspended} />
            <Stat label="Signed-in devices" value={o.data.sessions} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-danger">{Failed()}</p>
        )}
      </Card>

      <Card className="p-5">
        <Head title="Signups, last 30 days" />
        {o.ok ? (
          <div className="mt-4 flex h-24 items-end gap-[3px]" role="img" aria-label="Signups per day for the last 30 days">
            {o.data.signupsByDay.map((d) => (
              <div key={d.day} className="flex h-full flex-1 items-end" title={`${d.day}: ${d.n}`}>
                <div className="w-full rounded-sm bg-accent" style={{ height: `${Math.max(d.n ? 8 : 2, (d.n / max) * 100)}%`, opacity: d.n ? 1 : 0.25 }} />
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-danger">{Failed()}</p>
        )}
      </Card>

      <div className="grid gap-5 sm:grid-cols-2">
        <Card className="p-5">
          <Head
            title="Errors"
            action={
              <Link href="/admin/errors" className="text-sm text-muted hover:text-text">
                See all
              </Link>
            }
          />
          {e.ok ? (
            e.data.kinds === 0 ? (
              <p className="mt-3 flex items-center gap-2 text-[15px]">
                <Badge tone="success">All clear</Badge> No errors in the last 24 hours.
              </p>
            ) : (
              <p className="mt-3 text-[15px]">
                <Badge tone="warning">{e.data.kinds} kinds</Badge> {e.data.hits} errors in the last 24 hours.
              </p>
            )
          ) : (
            <p className="mt-3 text-sm text-danger">{Failed()}</p>
          )}
        </Card>
        <Card className="p-5">
          <Head
            title="Health"
            action={
              <Link href="/admin/health" className="text-sm text-muted hover:text-text">
                Details
              </Link>
            }
          />
          {h.ok ? (
            <p className="mt-3 text-[15px]">
              <Badge tone={h.data.dbMs < 500 ? "success" : "warning"}>Database {h.data.dbMs} ms</Badge>{" "}
              {h.data.integrations.filter((i) => !i.on).length > 0 && (
                <span className="text-text-2">{h.data.integrations.filter((i) => !i.on).length} integrations not set up</span>
              )}
            </p>
          ) : (
            <p className="mt-3 text-sm text-danger">Database isn&apos;t answering. {Failed()}</p>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <Head
          title="Newest users"
          action={
            <Link href="/admin/users" className="text-sm text-muted hover:text-text">
              All users
            </Link>
          }
        />
        {recent.ok ? (
          <ul className="mt-2 divide-y divide-border">
            {recent.data.rows.slice(0, 6).map((u) => (
              <li key={u.id}>
                <Link href={`/admin/users/${u.id}`} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium">{u.name}</span>
                    <span className="block truncate text-sm text-muted">{u.email}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{ago(u.createdAt)}</span>
                </Link>
              </li>
            ))}
            {recent.data.rows.length === 0 && <li className="py-3 text-sm text-muted">No users yet.</li>}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-danger">{Failed()}</p>
        )}
      </Card>
    </div>
  );
}
