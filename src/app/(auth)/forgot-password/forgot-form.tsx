"use client";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { FormError } from "@/components/ui/field";
import { forgotPassword, type ForgotState } from "../actions";

const input =
  "h-12 w-full rounded-2xl bg-surface px-4 text-[0.9375rem] text-text shadow-soft placeholder:text-muted transition-shadow focus:shadow-lift focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

const RESEND_AFTER_S = 60;

export function ForgotForm({ available, contact, sender }: { available: boolean; contact: string | null; sender: string | null }) {
  const [state, action, pending] = useActionState<ForgotState, FormData>(forgotPassword, null);
  // "Send again" unlocks a minute after each send.
  const [sends, setSends] = useState(0);
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (!state?.sent) return;
    const start = setTimeout(() => {
      setSends((n) => n + 1);
      setWait(RESEND_AFTER_S);
    }, 0);
    return () => clearTimeout(start);
  }, [state]);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  if (state?.sent)
    return (
      <div className="flex flex-col gap-4">
        <MailCheck className="h-10 w-10 text-accent" />
        <h1 className="font-display text-[2.125rem] leading-[1.05] font-medium tracking-tight">Check your email.</h1>
        <p className="text-[0.9375rem] text-text-2">
          If {state.email} has a LifeFlow account, a link to choose a new password is on its way. It works once, for one hour.
        </p>
        <ul className="flex flex-col gap-1.5 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-text-2">
          <li>It can take a minute or two to arrive.</li>
          {sender && <li>It comes from {sender}.</li>}
          <li>Check your spam or junk folder too.</li>
        </ul>
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="email" value={state.email ?? ""} />
          <button
            type="submit"
            disabled={pending || wait > 0}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-surface text-[0.9375rem] font-medium text-text shadow-soft disabled:opacity-60"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {wait > 0 ? `Send again in ${wait}s` : "Send again"}
          </button>
          {sends > 1 && (
            <p role="status" className="text-center text-sm text-muted">
              Sent again. Use the newest email.
            </p>
          )}
        </form>
        <Link href="/login" className="mt-2 font-medium text-accent">
          Back to sign in
        </Link>
      </div>
    );
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="mb-3">
        <h1 className="font-display text-[2.375rem] leading-[1.05] font-medium tracking-tight">Forgot your password?</h1>
        <p className="mt-2 text-[0.9375rem] text-muted">Enter your email and we&apos;ll send you a link to choose a new one.</p>
      </div>
      {!available && (
        <p role="status" className="rounded-2xl bg-accent-soft px-4 py-3 text-sm text-text">
          Password reset by email isn&apos;t available yet. If you added a passkey or Sign in with Apple, use that on the sign-in page.
          {contact ? ` Otherwise, email ${contact} for help.` : ""}
        </p>
      )}
      <FormError message={state?.error} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-2">Email</span>
        <input name="email" type="email" autoComplete="email" required defaultValue={state?.email} className={input} disabled={!available} />
      </label>
      <button
        type="submit"
        disabled={pending || !available}
        className="mt-2 flex h-12 items-center justify-center gap-2 rounded-full bg-accent text-[0.9375rem] font-medium text-accent-text shadow-soft active:scale-[0.98] disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} Send reset link
      </button>
      <Link href="/login" className="mt-2 text-center text-sm font-medium text-accent">
        Back to sign in
      </Link>
    </form>
  );
}
