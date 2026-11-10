import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { NewPasswordField } from "@/components/password-field";
import { control, Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { Card, CardHeader } from "@/components/ui/surface";
import { formatIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { sessions } from "@/server/db/schema";
import { twoFactorStatus } from "@/server/auth/two-factor";
import { appleConfig, appleIdentityFor } from "@/server/auth/apple";
import { googleIdentityFor, googleSignInConfig } from "@/server/auth/google-signin";
import { MONEY_LOCK_IDLE_CHOICES, moneyLockSettings } from "@/server/auth/money-lock";
import { listPasskeys } from "@/server/auth/passkeys";
import { accountHasPassword } from "@/server/services/accounts";
import { changePasswordAction, signOutOthersAction } from "../actions";
import { setMoneyLockAction, unlinkAppleAction, unlinkGoogleAction } from "./passkey-actions";
import type { ActionState } from "@/server/actions";
import { PasskeysCard } from "./passkeys-card";
import { TwoFactorCard } from "./two-factor-card";
import { SettingsHeader } from "../settings-header";

export const metadata: Metadata = { title: "Sign-in and locks" };

export default async function SecuritySettings({ searchParams }: { searchParams: Promise<{ apple?: string; google?: string }> }) {
  const { apple: appleResult, google: googleResult } = await searchParams;
  const d = await withCurrentUser(async (s, u) => {
    const active = await getDb()
      .select({ createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, userAgent: sessions.userAgent })
      .from(sessions)
      .where(eq(sessions.userId, u.id))
      .orderBy(desc(sessions.lastSeenAt));
    const tf = await twoFactorStatus(getDb(), u.id);
    const passkeys = await listPasskeys(getDb(), u.id);
    const apple = await appleIdentityFor(getDb(), u.id);
    const google = await googleIdentityFor(getDb(), u.id);
    const withPassword = await accountHasPassword(getDb(), u.id);
    return {
      active,
      tz: u.timezone,
      user: { name: u.name, email: u.email },
      tf,
      passkeys,
      apple,
      google,
      withPassword,
      lock: moneyLockSettings(u.preferences),
      demo: u.accountKind === "demo",
    };
  });
  const day = (x: Date) => formatIn(x, d.tz, "MMM d, yyyy");
  return (
    <div className="flex flex-col gap-5">
      <SettingsHeader title="Sign-in and locks" />
      {(appleResult === "linked" || googleResult === "linked") && (
        <p role="status" className="rounded-2xl bg-success-soft px-4 py-3 text-sm text-success">
          Sign in with {appleResult === "linked" ? "Apple" : "Google"} is linked. You can use it next time you sign in.
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
        <p className="mt-0.5 text-sm text-text-2">Ask for Face ID before showing your balances.</p>
        <ActionForm action={setMoneyLockAction} reset={false} className="mt-3 gap-0">
          <label className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-border py-2">
            <span className="flex-1 text-[0.9375rem]">Require Face ID / Touch ID for Money</span>
            <input type="checkbox" name="enabled" defaultChecked={d.lock.enabled} disabled={!d.passkeys.length} className="lf-switch" />
          </label>
          <label className="flex min-h-14 items-center gap-3 py-2">
            <span className="min-w-0 flex-1 text-[0.9375rem]">Lock after</span>
            <select
              name="idleMinutes"
              defaultValue={String(d.lock.idleMinutes)}
              className="h-11 min-w-0 max-w-[60%] rounded-xl border border-border bg-surface px-3 text-[1rem]"
            >
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
        <LinkedSignIn
          provider="apple"
          identity={d.apple}
          withPassword={d.withPassword || !!d.google}
          day={day}
          unlink={unlinkAppleAction}
          buttonClass="bg-black text-white dark:bg-white dark:text-black"
        />
      )}
      {(googleSignInConfig() || d.google) && (
        <LinkedSignIn
          provider="google"
          identity={d.google}
          withPassword={d.withPassword || !!d.apple}
          day={day}
          unlink={unlinkGoogleAction}
          buttonClass="border border-[#747775] bg-white text-[#1f1f1f]"
        />
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
          title={`Signed-in devices · ${d.active.length}`}
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
    </div>
  );
}

/** Sign in with Apple or Google: link it, or unlink it when there's another way to sign in. */
function LinkedSignIn({
  provider,
  identity,
  withPassword,
  day,
  unlink,
  buttonClass,
}: {
  provider: "apple" | "google";
  identity: { email: string | null; isPrivateEmail: boolean; createdAt: Date } | null;
  withPassword: boolean;
  day: (x: Date) => string;
  unlink: () => Promise<ActionState>;
  buttonClass: string;
}) {
  const label = provider === "apple" ? "Apple" : "Google";
  return (
    <Card className="p-5">
      <h2 className="font-medium">Sign in with {label}</h2>
      {identity ? (
        <>
          <p className="mt-0.5 text-sm text-text-2">
            Linked {day(identity.createdAt)}
            {identity.isPrivateEmail ? " with Hide My Email (Apple forwards LifeFlow's emails to you)" : identity.email ? ` (${identity.email})` : ""}.
          </p>
          {withPassword ? (
            <ActionButton
              action={unlink}
              confirm={`Unlink Sign in with ${label}? You'll sign in another way.`}
              className="mt-3 text-sm font-medium text-danger"
            >
              Unlink {label}
            </ActionButton>
          ) : (
            <p className="mt-2 text-xs text-muted">Set a password below before unlinking, so you can still sign in.</p>
          )}
        </>
      ) : (
        <>
          <p className="mt-0.5 text-sm text-text-2">Use your {provider === "apple" ? "Apple ID" : "Google account"} to sign in to this account.</p>
          <a
            href={`/api/auth/${provider}/start?mode=link`}
            className={`mt-3 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-medium ${buttonClass}`}
          >
            Link {provider === "apple" ? "Apple ID" : "Google account"}
          </a>
        </>
      )}
    </Card>
  );
}
