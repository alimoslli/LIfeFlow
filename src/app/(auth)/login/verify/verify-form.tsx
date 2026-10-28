"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { FormError } from "@/components/ui/field";
import { verifyLogin, type VerifyState } from "../../actions";

const input =
  "h-14 w-full rounded-2xl bg-surface px-4 text-center text-[22px] tracking-[0.3em] text-text shadow-soft placeholder:text-muted placeholder:tracking-normal focus:shadow-lift focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

export function VerifyForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<VerifyState, FormData>(verifyLogin, null);
  const [backup, setBackup] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="mb-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <h1 className="mt-5 font-display text-[34px] leading-[1.05] font-medium tracking-tight">One more step.</h1>
        <p className="mt-2 text-[15px] text-muted">
          {backup ? "Enter one of the backup codes you saved when you turned this on." : "Open your authenticator app and enter the 6-digit code for LifeFlow."}
        </p>
      </div>
      <FormError message={state?.error} />
      {state?.expired ? (
        <Link href="/login" className="flex h-12 items-center justify-center rounded-full bg-accent text-[15px] font-medium text-accent-text">
          Sign in again
        </Link>
      ) : (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="sr-only">{backup ? "Backup code" : "Authenticator code"}</span>
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
          {next && <input type="hidden" name="next" value={next} />}
          <button
            type="submit"
            disabled={pending}
            className="mt-1 flex h-12 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-medium text-accent-text shadow-soft transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Verify
          </button>
          <button type="button" onClick={() => setBackup((b) => !b)} className="text-sm text-muted hover:text-text">
            {backup ? "Use my authenticator app instead" : "Can't use your app? Use a backup code"}
          </button>
        </>
      )}
    </form>
  );
}
