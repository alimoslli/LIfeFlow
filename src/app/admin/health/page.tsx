import { Check, X } from "lucide-react";
import { Badge, Card, Stat, Tabs } from "@/components/ui/surface";
import { Head } from "../head";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { health, safe } from "@/server/services/admin";
import { ADMIN_TABS } from "../format";

const mb = (b: number | null) => (b == null ? "unknown" : `${(b / 1_048_576).toFixed(1)} MB`);

/** Read-only snapshot. For uptime alerts, point a monitor at /api/health (it answers 503 when the database is down). */
export default async function AdminHealth() {
  await requireAdmin();
  const r = await safe("health", () => health(getDb()));
  return (
    <div className="flex flex-col gap-5">
      <Tabs items={ADMIN_TABS} current="health" />
      {!r.ok ? (
        <Card className="p-5">
          <Badge tone="danger">Database not answering</Badge>
          <p className="mt-3 text-sm text-text-2">
            The app couldn&apos;t reach its database just now. Check your database provider&apos;s status page, then reload.
          </p>
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <Head title="App" />
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
              <Stat label="Database answer time" value={`${r.data.dbMs} ms`} sub={r.data.dbMs < 500 ? "Good" : "Slow"} />
              <Stat label="Database size" value={mb(r.data.dbBytes)} />
              <Stat label="Migrations applied" value={r.data.migrations ?? "unknown"} />
              <Stat label="Server running for" value={`${r.data.uptimeMinutes} min`} sub={r.data.nodeVersion} />
            </div>
          </Card>
          <Card className="p-5">
            <Head title="Integrations" subtitle="Whether each one is set up on the server. Keys are never shown." />
            <ul className="mt-2 divide-y divide-border">
              {r.data.integrations.map((i) => (
                <li key={i.name} className="flex items-center justify-between gap-3 py-3">
                  <span className="text-[0.9375rem]">{i.name}</span>
                  <Badge tone={i.on ? "success" : "neutral"} className="gap-1">
                    {i.on ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
                    {i.on ? "Set up" : "Not set up"}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
          <p className="text-xs text-muted">Uptime monitor address: /api/health</p>
        </>
      )}
    </div>
  );
}
