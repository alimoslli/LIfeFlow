import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { NewPasswordField } from "@/components/password-field";
import { control, Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { Badge, Card, CardHeader } from "@/components/ui/surface";
import { formatIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { auditEvents, sessions } from "@/server/db/schema";
import { twoFactorStatus } from "@/server/auth/two-factor";
import { appleConfig, appleIdentityFor } from "@/server/auth/apple";
import { MONEY_LOCK_IDLE_CHOICES, moneyLockSettings } from "@/server/auth/money-lock";
import { listPasskeys } from "@/server/auth/passkeys";
import { accountHasPassword } from "@/server/services/accounts";
import { changePasswordAction, signOutOthersAction } from "../actions";
import { setMoneyLockAction, unlinkAppleAction } from "./passkey-actions";
import { PasskeysCard } from "./passkeys-card";
import { TwoFactorCard } from "./two-factor-card";

export const metadata: Metadata = { title: "Security" };

export default async function SecuritySettings({ searchParams }: { searchParams: Promise<{ apple?: string }> }) {
  const { apple: appleResult } = await searchParams;
  const d = await withCurrentUser(async (s, u) => {
    const events = await s.tx.select().from(auditEvents).where(eq(auditEvents.userId, s.userId)).orderBy(desc(auditEvents.createdAt)).limit(30);
    const active = await getDb()
      .select({ createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, userAgent: sessions.userAgent })
      .from(sessions)
      .where(eq(sessions.userId, u.id))
      .orderBy(desc(sessions.lastSeenAt));
    const tf = await twoFactorStatus(getDb(), u.id);
    const passkeys = await listPasskeys(getDb(), u.id);
    const apple = await appleIdentityFor(getDb(), u.id);
    const withPassword = await accountHasPassword(getDb(), u.id);
    return {
      events,
      active,
      tz: u.timezone,
      user: { name: u.name, email: u.email },
      tf,
      passkeys,
      apple,
      withPassword,
      lock: moneyLockSettings(u.preferences),
      demo: u.accountKind === "demo",
    };
  });
  const day = (x: Date) => formatIn(x, d.tz, "MMM d, yyyy");
  return (
    <div className="flex flex-col gap-5">
      {appleResult === "linked" && (
        <p role="status" className="rounded-2xl bg-success-soft px-4 py-3 text-sm text-success">
          Sign in with Apple is linked. You can use it next time you sign in.
        </p>
      )}
      <PasskeysCard
        demo={d.demo}
        passkeys={d.passkeys.map((p) => ({
          id: p.id,
          name: p.name,
          created: day(p.createdAt),
          lastUsed: p.lastUsedAt ? formatIn(p.lastUsedAt, d.tz, "MMM d, h:mm a") : null,
          synced: p.backedUp,
        }))}
      />
      <Card className="p-5">
        <h2 className="font-medium">Lock Money with Face ID</h2>
        <p className="mt-0.5 text-sm text-text-2">
          Money and investments ask for Face ID or Touch ID after a few minutes without use, so someone holding your unlocked phone can&apos;t see your
          balances. Jarvis can&apos;t read your money while it&apos;s locked either.
        </p>
        <ActionForm action={setMoneyLockAction} reset={false} className="mt-3 gap-0">
          <label className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-border py-2">
            <span className="flex-1 text-[15px]">Require Face ID / Touch ID for Money</span>
            <input type="checkbox" name="enabled" defaultChecked={d.lock.enabled} disabled={!d.passkeys.length} className="lf-switch" />
          </label>
          <label className="flex min-h-14 items-center gap-3 py-2">
            <span className="flex-1 text-[15px]">Lock after</span>
            <select name="idleMinutes" defaultValue={String(d.lock.idleMinutes)} className="h-11 rounded-xl border border-border bg-surface px-3 text-[16px]">
              {MONEY_LOCK_IDLE_CHOICES.map((m) => (
                <option key={m} value={m}>
                  {m} minute{m === 1 ? "" : "s"} without use
                </option>
              ))}
            </select>
          </label>
          {!d.passkeys.length && <p className="text-sm text-muted">Add a passkey above first. The lock uses it.</p>}
          <SubmitButton className="mt-3 self-start" disabled={!d.passkeys.length}>
            Save
          </SubmitButton>
        </ActionForm>
      </Card>
      {(appleConfig() || d.apple) && (
        <Card className="p-5">
          <h2 className="font-medium">Sign in with Apple</h2>
          {d.apple ? (
            <>
              <p className="mt-0.5 text-sm text-text-2">
                Linked {day(d.apple.createdAt)}
                {d.apple.isPrivateEmail ? " with Hide My Email (Apple forwards LifeFlow's emails to you)" : d.apple.email ? ` (${d.apple.email})` : ""}.
              </p>
              {d.withPassword ? (
                <ActionButton
                  action={unlinkAppleAction}
                  confirm="Unlink Sign in with Apple? You'll sign in with your email and password."
                  className="mt-3 text-sm font-medium text-danger"
                >
                  Unlink Apple
                </ActionButton>
              ) : (
                <p className="mt-2 text-xs text-muted">Set a password below before unlinking, so you can still sign in.</p>
              )}
            </>
          ) : (
            <>
              <p className="mt-0.5 text-sm text-text-2">Use your Apple ID to sign in to this account.</p>
              <a
                href="/api/auth/apple/start?mode=link"
                className="mt-3 inline-flex min-h-11 items-center rounded-full bg-black px-5 text-sm font-medium text-white dark:bg-white dark:text-black"
              >
                Link Apple ID
              </a>
            </>
          )}
        </Card>
      )}
      <TwoFactorCard
        status={{
          enabled: d.tf.enabled,
          enabledOn: d.tf.enabledAt ? formatIn(d.tf.enabledAt, d.tz, "MMM d, yyyy") : null,
          recoveryCodesLeft: d.tf.recoveryCodesLeft,
          available: d.tf.available,
        }}
      />
      <Card className="p-5">
        <h2 className="mb-3 font-medium">{d.withPassword ? "Change password" : "Set a password"}</h2>
        {!d.withPassword && <p className="-mt-2 mb-3 text-sm text-text-2">You signed up with Apple. A password lets you sign in with your email too.</p>}
        <ActionForm action={changePasswordAction} showSuccess className="max-w-sm">
          {d.withPassword && (
            <Field label="Current password" htmlFor="pw-c">
              <Input id="pw-c" name="current" type="password" required autoComplete="current-password" />
            </Field>
          )}
          <Field label="New password" htmlFor="pw-n">
            <NewPasswordField
              id="pw-n"
              name="next"
              required
              minLength={10}
              maxLength={200}
              className={cn(control, "h-10")}
              context={[d.user.name, d.user.email]}
            />
          </Field>
          <SubmitButton className="self-start">{d.withPassword ? "Change password" : "Set password"}</SubmitButton>
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
