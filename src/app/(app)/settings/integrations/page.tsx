import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { Badge, Card } from "@/components/ui/surface";
import { formatIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { integrationStatus } from "@/server/services/integrations";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsSettings() {
  const d = await withCurrentUser(async (s, u) => ({ list: await integrationStatus(s), tz: u.timezone }));
  return (
    <div className="flex flex-col gap-3">
      <p className="mb-1 text-sm text-text-2">
        Statuses here are exact: nothing is shown as connected unless a live connection exists. Integrations that aren&apos;t built yet are labelled “Planned”, and every module works with manual entry meanwhile.
      </p>
      {d.list.map((i) => (
        <Card key={i.provider} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-medium">{i.name}</h2>
              <p className="text-xs text-muted">{i.module}</p>
            </div>
            <div className="flex gap-1.5">
              <Badge tone={i.status === "connected" ? "success" : i.status === "error" ? "danger" : "neutral"}>{i.status === "connected" ? "Connected" : i.status === "error" ? "Error" : "Not connected"}</Badge>
              <Badge tone="info">{i.availability === "planned" ? "Planned" : i.availability === "awaiting_credentials" ? "Awaiting credentials" : "Available"}</Badge>
            </div>
          </div>
          <p className="mt-2 text-sm text-text-2">{i.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span>
              Server setup: {i.configured ? <span className="text-success">credentials present</span> : <>needs {i.requires.join(", ")}</>}
            </span>
            <a href={i.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
              Official docs <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {i.connections.map((c) => (
            <p key={c.id} className="mt-2 text-xs text-muted">
              {c.displayName ?? "Connection"} · last sync {c.lastSyncedAt ? formatIn(c.lastSyncedAt, d.tz, "MMM d, h:mm a") : "never"}
              {c.lastError && <span className="text-danger"> · {c.lastError}</span>}
            </p>
          ))}
        </Card>
      ))}
    </div>
  );
}
