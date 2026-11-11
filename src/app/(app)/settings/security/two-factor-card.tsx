"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { Badge, Card } from "@/components/ui/surface";
import { confirmTwoFactorSetup, emailRestartCode, finishRestart, newRecoveryCodes, startTwoFactorSetup, turnOffTwoFactor } from "./two-factor-actions";
import { PixelIcon } from "@/components/pixel/pixel-icon";

type Status = { enabled: boolean; enabledOn: string | null; recoveryCodesLeft: number; available: boolean };
type Mode = "idle" | "setup" | "codes" | "disable" | "regenerate" | "restart";

/** Settings → Security: two-step sign-in with an authenticator app. */
export function TwoFactorCard({ status }: { status: Status }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [restartSentTo, setRestartSentTo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = <T,>(fn: () => Promise<({ ok: true } & T) | { ok: false; error: string }>, then: (r: T) => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) then(r);
      else setError(r.error);
    });

  const codesText = codes.join("\n");

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            <PixelIcon name="shield" className="h-4 w-4 text-accent" /> Two-step sign-in
          </h2>
          <p className="mt-1 max-w-md text-sm text-text-2">
            After your password, enter a 6-digit code from an app like Apple Passwords or Google Authenticator.
          </p>
        </div>
        <Badge tone={status.enabled ? "success" : "neutral"}>{status.enabled ? "On" : "Off"}</Badge>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {error && <FormError message={error} />}

        {!status.available && !status.enabled && <p className="text-sm text-warning">Two-step sign-in isn&apos;t available yet.</p>}

        {mode === "idle" && !status.enabled && status.available && (
          <Button className="self-start" loading={pending} onClick={() => run(startTwoFactorSetup, (r) => (setSetup(r), setMode("setup")))}>
            Turn on
          </Button>
        )}

        {mode === "setup" && setup && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const code = String(new FormData(e.currentTarget).get("code") ?? "");
              run(
                () => confirmTwoFactorSetup(code),
                (r) => (setCodes(r.recoveryCodes), setMode("codes")),
              );
            }}
          >
            <ol className="list-decimal space-y-1 pl-5 text-sm text-text-2">
              <li>Open your authenticator app and add a new account.</li>
              <li>Scan this code, or type the key below.</li>
              <li>Enter the 6-digit code the app shows.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
              <img src={setup.qr} alt="QR code to add LifeFlow to your authenticator app" width={168} height={168} className="rounded-2xl bg-white p-2" />
              <div className="min-w-0">
                <p className="text-xs text-muted">Setup key</p>
                <p className="font-mono text-sm break-all select-all" aria-label="Setup key">
                  {setup.secret.replace(/(.{4})/g, "$1 ").trim()}
                </p>
              </div>
            </div>
            <Field label="Code from the app" htmlFor="tf-code">
              <Input
                id="tf-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\s*\d{3}\s?\d{3}\s*"
                maxLength={7}
                required
                className="max-w-40"
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" loading={pending}>
                Confirm
              </Button>
              <Button type="button" variant="ghost" onClick={() => setMode("idle")}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {mode === "codes" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-success">Two-step sign-in is on.</p>
            <p className="text-sm text-text-2">
              Save these backup codes somewhere safe. Each one works once if you lose your phone.{" "}
              <strong className="font-medium">They won&apos;t be shown again.</strong>
            </p>
            <ul aria-label="Backup codes" className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-2xl bg-surface-2 p-4 font-mono text-sm sm:max-w-sm">
              {codes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => navigator.clipboard?.writeText(codesText)}>
                <PixelIcon name="copy" className="h-4 w-4" /> Copy
              </Button>
              <a
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(`LifeFlow backup codes\n\n${codesText}\n`)}`}
                download="lifeflow-backup-codes.txt"
                className="lf-sb lf-sb-app lf-sb-xs lf-touch"
              >
                <PixelIcon name="download" className="h-4 w-4" /> Download
              </a>
              <Button type="button" size="sm" onClick={() => (setCodes([]), setMode("idle"))}>
                I&apos;ve saved them
              </Button>
            </div>
          </div>
        )}

        {mode === "idle" && status.enabled && (
          <>
            <p className="text-sm text-muted">
              On since {status.enabledOn} · {status.recoveryCodesLeft} backup code{status.recoveryCodesLeft === 1 ? "" : "s"} left
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setMode("regenerate")}>
                New backup codes
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMode("disable")}>
                Turn off
              </Button>
            </div>
            <button
              type="button"
              onClick={() => (setRestartSentTo(null), setMode("restart"))}
              className="min-h-11 self-start text-sm text-muted underline-offset-2 hover:text-text hover:underline"
            >
              Lost your app? Start over with an email code
            </button>
          </>
        )}

        {mode === "restart" && !restartSentTo && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const password = String(new FormData(e.currentTarget).get("password") ?? "");
              run(
                () => emailRestartCode(password),
                (r) => setRestartSentTo(r.sentTo),
              );
            }}
          >
            <p className="text-sm text-text-2">We&apos;ll email you a code. Then you set up your app again and get new backup codes.</p>
            <Field label="Password" htmlFor="tf-restart-pw">
              <Input id="tf-restart-pw" name="password" type="password" autoComplete="current-password" required className="max-w-xs" />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={pending}>
                Email me a code
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setMode("idle")}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {mode === "restart" && restartSentTo && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const code = String(new FormData(e.currentTarget).get("code") ?? "");
              run(
                () => finishRestart(code),
                () =>
                  run(startTwoFactorSetup, (r) => {
                    setSetup(r);
                    setMode("setup");
                  }),
              );
            }}
          >
            <p className="text-sm text-text-2">We emailed a 6-digit code to {restartSentTo}. It works once, for 10 minutes.</p>
            <Field label="Code from the email" htmlFor="tf-restart-code">
              <Input
                id="tf-restart-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\s*\d{3}\s?\d{3}\s*"
                maxLength={7}
                required
                className="max-w-40"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" loading={pending}>
                Reset and set up again
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRestartSentTo(null)}>
                Send a new code
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setMode("idle")}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {mode === "regenerate" && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const code = String(new FormData(e.currentTarget).get("code") ?? "");
              run(
                () => newRecoveryCodes(code),
                (r) => (setCodes(r.recoveryCodes), setMode("codes")),
              );
            }}
          >
            <Field label="Current code from your app" htmlFor="tf-regen">
              <Input id="tf-regen" name="code" autoComplete="one-time-code" maxLength={20} required className="max-w-48" />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={pending}>
                Make new codes
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setMode("idle")}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {mode === "disable" && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(
                () => turnOffTwoFactor(String(f.get("password") ?? ""), String(f.get("code") ?? "")),
                () => setMode("idle"),
              );
            }}
          >
            <p className="text-sm text-text-2">Turning this off makes your account easier to break into. Confirm it&apos;s you:</p>
            <Field label="Password" htmlFor="tf-pw">
              <Input id="tf-pw" name="password" type="password" autoComplete="current-password" required className="max-w-xs" />
            </Field>
            <Field label="Code from your app (or a backup code)" htmlFor="tf-off">
              <Input id="tf-off" name="code" autoComplete="one-time-code" maxLength={20} required className="max-w-48" />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="danger" size="sm" loading={pending}>
                Turn off
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setMode("idle")}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
