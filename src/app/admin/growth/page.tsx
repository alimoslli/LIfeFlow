import Link from "next/link";
import { Card } from "@/components/ui/surface";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { growth, overview, safe } from "@/server/services/admin";
import { Head } from "../head";
import { Failed } from "../format";
import { AdminTitle, Tile } from "../ui";

/** How LifeFlow is growing: who's coming back, sign-ups, and who brings friends. */
export default async function AdminGrowth() {
  await requireAdmin();
  const db = getDb();
  const [g, o] = await Promise.all([safe("growth", () => growth(db)), safe("overview", () => overview(db))]);
  const max = o.ok ? Math.max(1, ...o.data.signupsByDay.map((d) => d.n)) : 1;
  return (
    <div className="flex flex-col gap-5">
      <AdminTitle title="Growth" sub="Who's using LifeFlow and how people find it." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Active today" value={g.ok ? g.data.active1d : "–"} />
        <Tile label="Active this week" value={g.ok ? g.data.active7d : "–"} />
        <Tile label="Active this month" value={g.ok ? g.data.active30d : "–"} />
        <Tile
          label="Joined from invites"
          value={g.ok ? g.data.invited : "–"}
          sub={o.ok && o.data.users ? `${Math.round(((g.ok ? g.data.invited : 0) / o.data.users) * 100)}% of users` : undefined}
        />
      </div>

      <Card className="p-5">
        <Head title="Sign-ups, last 30 days" subtitle={o.ok ? `${o.data.new30d} new · ${o.data.new7d} this week · ${o.data.new24h} today` : undefined} />
        {o.ok ? (
          <div className="mt-4 flex h-36 items-end gap-[3px]" role="img" aria-label="Sign-ups per day for the last 30 days">
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

      <Card className="p-5">
        <Head title="Top inviters" subtitle="People whose invite links brought friends in." />
        {!g.ok ? (
          <p className="mt-3 text-sm text-danger">{Failed()}</p>
        ) : g.data.topInviters.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No one has joined from an invite yet. Invite links are in Settings → Invite friends.</p>
        ) : (
          <ol className="mt-2 divide-y divide-border">
            {g.data.topInviters.map((t, i) => (
              <li key={t.id}>
                <Link href={`/admin/users/${t.id}`} className="flex items-center gap-3 py-3">
                  <span className="tabular w-6 shrink-0 text-sm text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-medium">{t.name}</span>
                    <span className="block truncate text-sm text-muted">{t.email}</span>
                  </span>
                  <span className="tabular shrink-0 text-sm font-medium">
                    {t.invited} friend{t.invited === 1 ? "" : "s"}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
