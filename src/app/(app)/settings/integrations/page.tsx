import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { Badge, Card } from "@/components/ui/surface";
import { formatIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { integrationStatus } from "@/server/services/integrations";
import { GoogleCard } from "./google-card";

export const metadata: Metadata = { title: "Integrations" };

const TONE = { success: "bg-success-soft text-success", danger: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning" } as const;

const GOOGLE_RESULT: Record<string, { tone: "success" | "danger" | "warning"; text: string }> = {
  connected: { tone: "success", text: "Google is connected. Your calendar is syncing and your assistant can now help with email." },
  denied: { tone: "warning", text: "You didn't give Google access, so nothing was connected." },
  missing_scopes: { tone: "warning", text: "Some permissions were unchecked. Connect again and keep all boxes checked." },
  failed: { tone: "danger", text: "Couldn't connect Google. Please try again." },
  not_configured: { tone: "warning", text: "Google isn't set up on the server yet (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)." },
};

export default async function IntegrationsSettings({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { google: result } = await searchParams;
  const d = await withCurrentUser(async (s, u) => ({ list: await integrationStatus(s), tz: u.timezone }));
  const banner = result ? GOOGLE_RESULT[result] : undefined;
  const google = d.list.find((i) => i.provider === "google");
  return (
    <div className="flex flex-col gap-3">
      {banner && <p className={`rounded-2xl px-4 py-3 text-sm ${TONE[banner.tone]}`}>{banner.text}</p>}
      {google && (
        <GoogleCard
          configured={google.configured}
          connection={
            google.connections[0]
              ? {
                  email: google.connections[0].displayName ?? "Google account",
                  status: google.connections[0].status,
                  lastSynced: google.connections[0].lastSyncedAt ? formatIn(google.connections[0].lastSyncedAt, d.tz, "MMM d, h:mm a") : null,
                  error: google.connections[0].lastError,
                }
              : null
          }
        />
      )}
      <p className="mb-1 text-sm text-text-2">
        Statuses here are exact: nothing is shown as connected unless a live connection exists. Integrations that aren&apos;t built yet are labelled “Planned”,
        and every module works with manual entry meanwhile.
      </p>
      {d.list
        .filter((i) => i.provider !== "google")
        .map((i) => (
          <Card key={i.provider} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-medium">{i.name}</h2>
                <p className="text-xs text-muted">{i.module}</p>
              </div>
              <div className="flex gap-1.5">
                <Badge tone={i.status === "connected" ? "success" : i.status === "error" ? "danger" : "neutral"}>
                  {i.status === "connected" ? "Connected" : i.status === "error" ? "Error" : "Not connected"}
                </Badge>
                <Badge tone="info">
                  {i.availability === "planned" ? "Planned" : i.availability === "awaiting_credentials" ? "Awaiting credentials" : "Available"}
                </Badge>
              </div>
            </div>
            <p className="mt-2 text-sm text-text-2">{i.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span>Server setup: {i.configured ? <span className="text-success">credentials present</span> : <>needs {i.requires.join(", ")}</>}</span>
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
