"use client";
import { Calendar, Mail, RefreshCw } from "lucide-react";
import { ActionButton } from "@/components/action-form";
import { Badge, Card } from "@/components/ui/surface";
import { disconnectGoogleAction, syncGoogleAction } from "./actions";

/** Connect / sync / disconnect Google (Gmail + Calendar). */
export function GoogleCard({
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
            <Mail className="h-5 w-5 text-accent" />
          </span>
          <div>
            <h2 className="font-medium">Google: Gmail and Calendar</h2>
            <p className="text-xs text-muted">Email · Calendar</p>
          </div>
        </div>
        <Badge tone={connection ? (connection.status === "error" ? "danger" : "success") : "neutral"}>
          {connection ? (connection.status === "error" ? "Needs attention" : "Connected") : "Not connected"}
        </Badge>
      </div>
      <p className="mt-3 text-sm text-text-2">
        Your assistant can search and read your email, draft replies in Gmail, send email after you confirm, and keep your Google Calendar in your plan. You can
        disconnect at any time.
      </p>

      {!configured ? (
        <p className="mt-3 text-sm text-warning">Not available yet: the server needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.</p>
      ) : connection ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="text-text">{connection.email}</span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> {connection.lastSynced ? `Calendar synced ${connection.lastSynced}` : "Calendar not synced yet"}
            </span>
          </p>
          {connection.error && <p className="text-sm text-danger">{connection.error}</p>}
          <div className="flex flex-wrap gap-2">
            {connection.status === "error" ? (
              <a
                href="/api/integrations/google/start"
                className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-sm font-medium text-accent-text"
              >
                Reconnect Google
              </a>
            ) : (
              <ActionButton
                action={syncGoogleAction}
                title="Sync calendar now"
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Sync calendar now
              </ActionButton>
            )}
            <ActionButton
              action={disconnectGoogleAction}
              confirm="Disconnect Google? Your assistant will lose access to Gmail and your Google Calendar events will be removed from LifeFlow."
              title="Disconnect Google"
              className="inline-flex h-9 items-center rounded-full px-4 text-sm text-muted hover:text-danger"
            >
              Disconnect
            </ActionButton>
          </div>
        </div>
      ) : (
        <a
          href="/api/integrations/google/start"
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-accent-text"
        >
          Connect Google
        </a>
      )}
    </Card>
  );
}
