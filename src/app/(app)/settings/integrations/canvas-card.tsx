"use client";
import { GraduationCap, RefreshCw } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge, Card } from "@/components/ui/surface";
import { connectCanvasAction, disconnectCanvasAction, syncCanvasAction } from "./actions";

/** Canvas: school address + personal access token. Read-only. */
export function CanvasCard({ connection }: { connection: { host: string | null; status: string; lastSynced: string | null; error: string | null } | null }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-2">
            <GraduationCap className="h-5 w-5 text-accent" />
          </span>
          <div>
            <h2 className="font-medium">Canvas</h2>
            <p className="text-xs text-muted">Classes and assignments</p>
          </div>
        </div>
        <Badge tone={connection ? (connection.status === "error" ? "danger" : "success") : "neutral"}>
          {connection ? (connection.status === "error" ? "Needs attention" : "Connected") : "Not connected"}
        </Badge>
      </div>
      {connection ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm text-muted">
            <span className="text-text">{connection.host}</span> · {connection.lastSynced ? `Synced ${connection.lastSynced}` : "Not synced yet"}
          </p>
          {connection.error && <p className="text-sm text-danger">{connection.error}</p>}
          <div className="flex flex-wrap gap-2">
            <ActionButton
              action={syncCanvasAction}
              title="Sync Canvas now"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Sync now
            </ActionButton>
            <ActionButton
              action={disconnectCanvasAction}
              confirm="Disconnect Canvas? Classes and assignments it added stay in LifeFlow."
              title="Disconnect Canvas"
              className="inline-flex min-h-11 items-center rounded-full px-4 text-sm text-muted hover:text-danger"
            >
              Disconnect
            </ActionButton>
          </div>
        </div>
      ) : (
        <ActionForm action={connectCanvasAction} className="mt-4">
          <p className="text-sm text-text-2">
            In Canvas, open Account → Settings → New access token, then paste it here. LifeFlow only reads your classes and due dates.
          </p>
          <Field label="Your school's Canvas address" htmlFor="cv-url">
            <Input id="cv-url" name="url" required placeholder="canvas.myschool.edu" autoCapitalize="none" autoCorrect="off" />
          </Field>
          <Field label="Access token" htmlFor="cv-token">
            <Input id="cv-token" name="token" required type="password" autoComplete="off" />
          </Field>
          <SubmitButton className="self-start">Connect Canvas</SubmitButton>
        </ActionForm>
      )}
    </Card>
  );
}
