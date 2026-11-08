"use client";
import { useActionState, useState } from "react";
import { Loader2, Smartphone } from "lucide-react";
import { sendPhoneCode, verifyPhoneCode, type PhoneState } from "@/app/(auth)/phone-actions";

const input =
  "h-12 w-full rounded-2xl bg-surface px-4 text-[0.9375rem] text-text shadow-soft placeholder:text-muted transition-shadow focus:shadow-lift focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";
const primary =
  "flex h-12 items-center justify-center gap-2 rounded-full bg-accent text-[0.9375rem] font-medium text-accent-text shadow-soft transition-transform active:scale-[0.98] disabled:opacity-60";

/**
 * "Use my phone number": a code to the number, then sign in. The wording never says whether the number has an account, and says
 * truthfully how the code travels (a text, or an email to the account until texting is set up).
 */
export function PhoneSignIn({ next }: { next?: string }) {
  const [open, setOpen] = useState(false);
  const [sent, sendAction, sending] = useActionState<PhoneState, FormData>(sendPhoneCode, null);
  const [checked, verifyAction, verifying] = useActionState<PhoneState, FormData>(verifyPhoneCode, null);
  const step = sent?.step === "code" ? "code" : "phone";
  const phone = sent?.phone ?? "";
  const via = sent?.via;

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-11 items-center justify-center gap-2 text-sm font-medium text-accent">
        <Smartphone className="h-4 w-4" aria-hidden /> Use my phone number instead
      </button>
    );
  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-surface-2 p-4" role="group" aria-label="Sign in with your phone number">
      {step === "phone" ? (
        <form action={sendAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-2">Phone number</span>
            <input name="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="(404) 555-0134" autoFocus className={input} />
          </label>
          {sent?.error && (
            <p role="alert" className="text-sm text-danger">
              {sent.error}
            </p>
          )}
          <button type="submit" disabled={sending} className={primary}>
            {sending && <Loader2 className="h-4 w-4 animate-spin" />} Send me a code
          </button>
        </form>
      ) : (
        <form action={verifyAction} className="flex flex-col gap-3">
          <p role="status" className="text-sm text-text-2">
            {via === "text"
              ? "If that number is on a LifeFlow account, we just texted it a 6-digit code."
              : "If that number is on a LifeFlow account, we just emailed that account a 6-digit code."}
          </p>
          <input type="hidden" name="phone" value={phone} />
          {next && <input type="hidden" name="next" value={next} />}
          <label className="flex flex-col gap-1.5">
            <span className="sr-only">Code</span>
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\s*\d{3}\s?\d{3}\s*"
              maxLength={7}
              required
              placeholder="123456"
              autoFocus
              className={input}
            />
          </label>
          {checked?.error && (
            <p role="alert" className="text-sm text-danger">
              {checked.error}
            </p>
          )}
          <button type="submit" disabled={verifying} className={primary}>
            {verifying && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
          </button>
        </form>
      )}
      <button type="button" onClick={() => setOpen(false)} className="min-h-11 text-sm text-muted hover:text-text">
        Back to email
      </button>
    </div>
  );
}
