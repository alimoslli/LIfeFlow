import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge, Card, CardHeader } from "@/components/ui/surface";
import { formatIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { auditEvents, sessions } from "@/server/db/schema";
import { changePasswordAction, signOutOthersAction } from "../actions";

export const metadata: Metadata = { title: "Security" };

export default async function SecuritySettings() {
  const d = await withCurrentUser(async (s, u) => {
    const events = await s.tx.select().from(auditEvents).where(eq(auditEvents.userId, s.userId)).orderBy(desc(auditEvents.createdAt)).limit(30);
    const active = await getDb()
      .select({ createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, userAgent: sessions.userAgent })
      .from(sessions)
      .where(eq(sessions.userId, u.id))
      .orderBy(desc(sessions.lastSeenAt));
    return { events, active, tz: u.timezone };
  });
  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <h2 className="mb-3 font-medium">Change password</h2>
        <ActionForm action={changePasswordAction} showSuccess className="max-w-sm">
          <Field label="Current password" htmlFor="pw-c">
            <Input id="pw-c" name="current" type="password" required autoComplete="current-password" />
          </Field>
          <Field label="New password" htmlFor="pw-n" hint="At least 10 characters.">
            <Input id="pw-n" name="next" type="password" required minLength={10} autoComplete="new-password" />
          </Field>
          <SubmitButton className="self-start">Change password</SubmitButton>
        </ActionForm>
      </Card>
      <Card>
        <CardHeader
          title={`Active sessions · ${d.active.length}`}
          action={
            d.active.length > 1 ? (
              <ActionButton action={signOutOthersAction} className="text-xs font-medium text-accent hover:underline">
                Sign out others
              </ActionButton>
            ) : undefined
          }
        />
        <ul className="px-5 pb-4 text-sm">
          {d.active.map((s, i) => (
            <li key={i} className="flex justify-between gap-3 py-1.5">
              <span className="truncate text-text-2">{s.userAgent?.replace(/\(.*?\)/g, "").slice(0, 60) || "Unknown device"}</span>
              <span className="shrink-0 text-xs text-muted">active {formatIn(s.lastSeenAt, d.tz, "MMM d")}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Recent activity" subtitle="Audit log of sign-ins, exports and changes (including those made by Jarvis)" />
        <ul className="px-5 pb-4 text-sm">
          {d.events.map((e) => (
            <li key={e.id} className="flex items-center gap-3 border-b border-border/60 py-1.5 last:border-0">
              <Badge tone={e.actor === "jarvis" ? "accent" : "neutral"}>{e.actor}</Badge>
              <span className="flex-1 truncate font-mono text-xs">{e.action}</span>
              <span className="shrink-0 text-xs text-muted">{formatIn(e.createdAt, d.tz, "MMM d, h:mm a")}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
