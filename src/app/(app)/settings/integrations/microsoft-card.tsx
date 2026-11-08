"use client";
import { Calendar, RefreshCw, Video } from "lucide-react";
import { ActionButton } from "@/components/action-form";
import { Badge, Card } from "@/components/ui/surface";
import { disconnectMicrosoftAction, syncMicrosoftAction } from "./actions";
import { StillBuilding } from "@/components/still-building";

/** Connect / sync / disconnect Microsoft 365 (Outlook calendar with Teams meetings). */
export function MicrosoftCard({
  configured,
  connection,
}: {
  configured: boolean;
  connection: { email: string; status: string; lastSynced: string | null; error: string | null } | null;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-2">
            <Video className="h-5 w-5 text-accent" />
          </span>
          <div>
            <h2 className="font-medium">Microsoft Teams and Outlook</h2>
            <p className="text-xs text-muted">Meetings · Calendar</p>
          </div>
        </div>
        <Badge tone={connection ? (connection.status === "error" ? "danger" : "success") : "neutral"}>
          {connection ? (connection.status === "error" ? "Needs attention" : "Connected") : "Not connected"}
        </Badge>
      </div>
      <p className="mt-3 text-sm text-text-2">
        Your Outlook calendar and Teams meetings show in your plan, with the meeting link. Works with school, work and personal Microsoft accounts. LifeFlow
        only reads your calendar.
      </p>

      {!configured ? (
        <StillBuilding className="mt-3" line={1} detail="Check back soon." />
      ) : connection ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="text-text">{connection.email}</span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> {connection.lastSynced ? `Synced ${connection.lastSynced}` : "Not synced yet"}
            </span>
          </p>
          {connection.error && <p className="text-sm text-danger">{connection.error}</p>}
          <div className="flex flex-wrap gap-2">
            {connection.status === "error" ? (
              <a
                href="/api/integrations/microsoft/start"
                className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-sm font-medium text-accent-text"
              >
                Reconnect Microsoft
              </a>
            ) : (
              <ActionButton
                action={syncMicrosoftAction}
                title="Sync calendar now"
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Sync now
              </ActionButton>
            )}
            <ActionButton
              action={disconnectMicrosoftAction}
              confirm="Disconnect Microsoft? Your Outlook and Teams events will be removed from LifeFlow."
              title="Disconnect Microsoft"
              className="inline-flex h-9 items-center rounded-full px-4 text-sm text-muted hover:text-danger"
            >
              Disconnect
            </ActionButton>
          </div>
        </div>
      ) : (
        <a
          href="/api/integrations/microsoft/start"
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-accent-text"
        >
          Connect Microsoft
        </a>
      )}
    </Card>
  );
}
