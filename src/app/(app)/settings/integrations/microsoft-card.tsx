"use client";
import { ActionButton } from "@/components/action-form";
import { Badge, Card } from "@/components/ui/surface";
import { disconnectMicrosoftAction, syncMicrosoftAction } from "./actions";
import { PixelIcon } from "@/components/pixel/pixel-icon";

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
            <PixelIcon name="video" className="h-5 w-5 text-accent" />
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
        <p className="mt-3 text-sm text-warning">Microsoft isn&apos;t available yet. Check back soon.</p>
      ) : connection ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="text-text">{connection.email}</span>
            <span className="flex items-center gap-1">
              <PixelIcon name="calendar" className="h-4 w-4" /> {connection.lastSynced ? `Synced ${connection.lastSynced}` : "Not synced yet"}
            </span>
          </p>
          {connection.error && <p className="text-sm text-danger">{connection.error}</p>}
          <div className="flex flex-wrap gap-2">
            {connection.status === "error" ? (
              <a href="/api/integrations/microsoft/start" className="lf-sb lf-sb-sun lf-sb-xs lf-touch">
                Reconnect Microsoft
              </a>
            ) : (
              <ActionButton action={syncMicrosoftAction} title="Sync calendar now" className="lf-sb lf-sb-app lf-sb-xs lf-touch">
                <PixelIcon name="sync" className="h-4 w-4" /> Sync now
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
        <a href="/api/integrations/microsoft/start" className="lf-sb lf-sb-sun lf-sb-sm mt-4">
          Connect Microsoft
        </a>
      )}
    </Card>
  );
}
