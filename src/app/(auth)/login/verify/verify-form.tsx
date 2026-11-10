"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import { FormError } from "@/components/ui/field";
import { sendLoginEmailCode, verifyLogin, type EmailCodeState, type VerifyState } from "../../actions";

const input =
  "h-14 w-full rounded-2xl bg-surface px-4 text-center text-[1.375rem] tracking-[0.3em] text-text shadow-soft placeholder:text-muted placeholder:tracking-normal focus:shadow-lift focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

export function VerifyForm({ next, emailAvailable = false }: { next?: string; emailAvailable?: boolean }) {
  const [state, action, pending] = useActionState<VerifyState, FormData>(verifyLogin, null);
  const [emailState, emailAction, emailPending] = useActionState<EmailCodeState>(sendLoginEmailCode, null);
  const [backup, setBackup] = useState(false);
  const emailed = !!emailState?.sentTo && !backup;
  const expired = state?.expired || emailState?.expired;
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4">
        <div className="mb-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <h1 className="mt-5 font-display text-[2.125rem] leading-[1.05] font-medium tracking-tight">One more step.</h1>
          <p className="mt-2 text-[0.9375rem] text-muted">
            {backup
              ? "Enter one of the backup codes you saved when you turned this on."
              : emailed
                ? `We emailed a 6-digit code to ${emailState?.sentTo}. It works once, for 10 minutes.`
                : "Open your authenticator app and enter the 6-digit code for LifeFlow."}
          </p>
        </div>
        <FormError message={state?.error ?? emailState?.error} />
        {expired ? (
          <Link href="/login" className="lf-sb lf-sb-sun">
            Sign in again
          </Link>
        ) : (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="sr-only">{backup ? "Backup code" : emailed ? "Code from the email" : "Authenticator code"}</span>
              {backup ? (
                <input
                  key="backup"
                  name="code"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  maxLength={20}
                  placeholder="xxxxx-xxxxx"
                  className={input}
                />
              ) : (
                <input
                  key="totp"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\s*\d{3}\s?\d{3}\s*"
                  required
                  maxLength={7}
                  placeholder="123456"
                  autoFocus
                  className={input}
                />
              )}
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[0.9375rem] text-text-2">
              <input type="checkbox" name="remember" defaultChecked className="h-5 w-5 accent-[var(--accent)]" />
              Remember this phone for 30 days
            </label>
            {next && <input type="hidden" name="next" value={next} />}
            <button type="submit" disabled={pending} className="lf-sb lf-sb-sun mt-1">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Verify
            </button>
            <button type="button" onClick={() => setBackup((b) => !b)} className="min-h-11 text-sm text-muted hover:text-text">
              {backup ? "Use my authenticator app instead" : "Can't use your app? Use a backup code"}
            </button>
          </>
        )}
      </form>
      {emailAvailable && !expired && (
        <form action={emailAction}>
          <button
            type="submit"
            disabled={emailPending}
            onClick={() => setBackup(false)}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-surface text-sm font-medium text-text shadow-soft disabled:opacity-60"
          >
            {emailPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {emailState?.sentTo ? "Email me a new code" : "Email me a code instead"}
          </button>
        </form>
      )}
    </div>
  );
}
