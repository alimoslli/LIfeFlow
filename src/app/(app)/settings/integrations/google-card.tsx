"use client";
import { AssistantName } from "@/components/assistant-name";
import { ActionButton } from "@/components/action-form";
import { Badge, Card } from "@/components/ui/surface";
import { disconnectGoogleAction, setGmailFilingAction, syncGoogleAction } from "./actions";
import { PixelIcon } from "@/components/pixel/pixel-icon";

/** Connect / sync / disconnect Google (Gmail + Calendar). */
export function GoogleCard({
  configured,
  connection,
  filing = false,
}: {
  configured: boolean;
  connection: { email: string; status: string; lastSynced: string | null; error: string | null } | null;
  /** Each morning the skyling puts what it finds in email on the sky (on unless turned off). */
  filing?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-2">
            <PixelIcon name="mail" className="h-5 w-5 text-accent" />
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
        Once Google is connected, <AssistantName /> reads your new email automatically each morning for due dates, exam changes, bills, receipts, deliveries and
        bookings, and puts them on your sky, marked &ldquo;From your email&rdquo;, with Undo. Only mail Gmail confirms came from its sender. The switch below
        turns the reading off. It never sends anything without asking you.
      </p>

      {!configured ? (
        <p className="mt-3 text-sm text-warning">Google isn&apos;t available yet. Check back soon.</p>
      ) : connection ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="text-text">{connection.email}</span>
            <span className="flex items-center gap-1">
              <PixelIcon name="calendar" className="h-4 w-4" /> {connection.lastSynced ? `Updated ${connection.lastSynced}` : "Not updated yet"}
            </span>
          </p>
          {connection.error && <p className="text-sm text-danger">{connection.error}</p>}
          <ActionButton
            action={setGmailFilingAction.bind(null, !filing)}
            className="flex min-h-11 items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-2 text-left text-sm"
          >
            <span>
              <span className="block font-medium">Put what&apos;s in my email on my sky</span>
              <span className="text-xs text-muted">
                {filing
                  ? "On: your email is read automatically. The first look goes back 30 days (up to 50 emails), then each morning checks new mail."
                  : "Off: your email isn't read unless you ask."}
              </span>
            </span>
            <span className={filing ? "font-medium text-accent" : "text-muted"}>{filing ? "On" : "Off"}</span>
          </ActionButton>
          <div className="flex flex-wrap gap-2">
            {connection.status === "error" ? (
              <a href="/api/integrations/google/start" className="lf-sb lf-sb-sun lf-sb-xs lf-touch">
                Reconnect Google
              </a>
            ) : (
              <ActionButton action={syncGoogleAction} title="Sync calendar now" className="lf-sb lf-sb-app lf-sb-xs lf-touch">
                <PixelIcon name="sync" className="h-4 w-4" /> Sync calendar now
              </ActionButton>
            )}
            <ActionButton
              action={disconnectGoogleAction}
              confirm="Disconnect Google? Your skyling loses Gmail and your Google events leave your plan."
              title="Disconnect Google"
              className="inline-flex h-9 items-center rounded-full px-4 text-sm text-muted hover:text-danger"
            >
              Disconnect
            </ActionButton>
          </div>
        </div>
      ) : (
        <a href="/api/integrations/google/start" className="lf-sb lf-sb-sun lf-sb-sm mt-4">
          Connect Google
        </a>
      )}
    </Card>
  );
}
