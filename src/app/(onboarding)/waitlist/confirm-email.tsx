"use client";
import { useActionState, useEffect, useRef } from "react";
import { confirmEmail, sendEmailCode, type ConfirmState } from "./actions";

/**
 * "Confirm your email" on the waitlist's night sky: Send code, then type the 6 digits. A friend's invite counts only once
 * the friend has done this, so the card says so when they came from a link. "Sent" is shown only when the email provider
 * accepted the message (the server says so). The card is a peer section of the page, so its heading is an h2 like the others.
 * After a right code the card stays and says so in its own place (the action doesn't re-render the page), so the person sees it worked.
 */
export function ConfirmEmail({ invited, className }: { invited: boolean; className: string }) {
  const [sent, sendAction, sending] = useActionState<ConfirmState, FormData>(sendEmailCode, null);
  const [checked, checkAction, checking] = useActionState<ConfirmState, FormData>(confirmEmail, null);
  // The newest answer wins, so a fresh "Send code" clears an old "wrong code".
  const latest = [sent, checked].filter(Boolean).sort((a, b) => b!.at - a!.at)[0] ?? null;
  const sentTo = sent?.sentTo;
  const done = !!latest?.confirmed;
  const codeField = useRef<HTMLInputElement>(null);
  // After "Send code" the next thing is typing it: focus goes to the code field once it's there.
  useEffect(() => {
    if (sent?.sentTo) codeField.current?.focus();
  }, [sent]);
  const status = done ? "Thank you, your email is confirmed." : sentTo ? `We sent a code to ${sentTo}.` : "";

  return (
    <section className={className} aria-labelledby="wl-confirm">
      <h2 id="wl-confirm" className="font-display text-[1.5rem] leading-[1.1] font-medium tracking-[-0.03em]">
        {invited ? "Confirm your email so your friend's invite counts" : "Confirm your email"}
      </h2>
      {/* always in the page, so a screen reader hears the text when it changes */}
      <p role="status" aria-live="polite" data-testid="wl-confirm-status" className={status ? "mt-3 text-[0.9375rem] text-white/85" : "sr-only"}>
        {status}
      </p>
      {!done && (
        <>
          <p className="mt-2 text-sm leading-relaxed text-white/70">We&apos;ll email you a 6-digit code. It works once, for 10 minutes.</p>
          <form action={sendAction} className="mt-4">
            <button type="submit" disabled={sending} className="lf-sb lf-sb-sun lf-sb-sm min-h-11 min-w-11 disabled:opacity-60">
              {sending ? "Sending…" : sentTo ? "Send a new code" : "Send code"}
            </button>
          </form>
          {/* always there, so someone who reloads the page or comes back to an earlier email can still type the code */}
          <form action={checkAction} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-white/70">
              Your code
              <input
                ref={codeField}
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                maxLength={7}
                required
                className="min-h-12 rounded-2xl bg-white/10 px-4 text-lg tracking-[0.3em] text-white ring-1 ring-white/20 outline-none focus:ring-star-gold"
              />
            </label>
            <button type="submit" disabled={checking} className="lf-sb lf-sb-glass lf-sb-sm min-h-12 min-w-11 disabled:opacity-60">
              {checking ? "Checking…" : "Confirm"}
            </button>
          </form>
          {latest?.error && (
            <p role="alert" className="mt-3 text-sm text-star-gold">
              {latest.error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
