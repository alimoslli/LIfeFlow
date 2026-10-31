"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { FormError } from "@/components/ui/field";
import { forgotPassword, type ForgotState } from "../actions";

const input =
  "h-12 w-full rounded-2xl bg-surface px-4 text-[15px] text-text shadow-soft placeholder:text-muted transition-shadow focus:shadow-lift focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

export function ForgotForm({ available, contact }: { available: boolean; contact: string | null }) {
  const [state, action, pending] = useActionState<ForgotState, FormData>(forgotPassword, null);
  if (state?.sent)
    return (
      <div className="flex flex-col gap-4">
        <MailCheck className="h-10 w-10 text-accent" />
        <h1 className="font-display text-[34px] leading-[1.05] font-medium tracking-tight">Check your email.</h1>
        <p className="text-[15px] text-text-2">
          If {state.email} has a LifeFlow account, a link to choose a new password is on its way. It works once, for one hour. Check spam if you don&apos;t see
          it in a few minutes.
        </p>
        <Link href="/login" className="mt-2 font-medium text-accent">
          Back to sign in
        </Link>
      </div>
    );
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="mb-3">
        <h1 className="font-display text-[38px] leading-[1.05] font-medium tracking-tight">Forgot your password?</h1>
        <p className="mt-2 text-[15px] text-muted">Enter your email and we&apos;ll send you a link to choose a new one.</p>
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
        className="mt-2 flex h-12 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-medium text-accent-text shadow-soft active:scale-[0.98] disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} Send reset link
      </button>
      <Link href="/login" className="mt-2 text-center text-sm font-medium text-accent">
        Back to sign in
      </Link>
    </form>
  );
}
