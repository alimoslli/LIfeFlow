"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Fingerprint, Loader2 } from "lucide-react";
import { PasskeyCancelled, passkeyAutofillSupported, passkeysSupported, signInWithPasskey } from "./passkey-client";

/** Apple's logo (from Apple's Sign in with Apple guidelines), white on the black button. */
function AppleLogo() {
  return (
    <svg viewBox="0 0 17 20" className="h-[18px] w-[18px]" aria-hidden fill="currentColor">
      <path d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.7-1-2.7-4.1zM11.6 3c.7-.9 1.2-2 1-3.2-1 .1-2.2.7-3 1.5-.6.7-1.2 1.9-1.1 3.1 1.2.1 2.3-.6 3.1-1.4z" />
    </svg>
  );
}

/** Google's "G" in its standard colours (Google sign-in branding guidelines). */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/**
 * Sign in with Apple or Google, and with a passkey (Face ID / Touch ID), above the
 * email form. On sign-in, passkeys also show up in the email field's
 * suggestions (autocomplete="username webauthn").
 */
export function SignInOptions({
  mode,
  apple,
  google = false,
  next,
  invite,
}: {
  mode: "login" | "signup";
  apple: boolean;
  google?: boolean;
  next?: string;
  /** a friend's invite code from /signup?invite=…, carried through Apple and Google sign-up */
  invite?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (mode !== "login" || !passkeysSupported()) return;
    let live = true;
    const t = setTimeout(() => live && setSupported(true), 0);
    // Passkey suggestions in the email field's autofill (Safari, Chrome).
    void passkeyAutofillSupported().then((ok) => {
      if (!ok || !live) return;
      // a quiet offer in the email field's suggestions: nothing was tapped, so a failure here is never shown
      signInWithPasskey(next ?? "/", true)
        .then((r) => router.replace(r.next))
        .catch(() => {});
    });
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [mode, next, router]);

  const passkey = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await signInWithPasskey(next ?? "/");
      router.replace(r.next);
    } catch (e) {
      if (!(e instanceof PasskeyCancelled)) setError(e instanceof Error ? e.message : "Couldn't sign in with that passkey.");
      setBusy(false);
    }
  };

  // The time zone comes along so a new account starts in the right one.
  const startHref = (provider: "apple" | "google") => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    return `/api/auth/${provider}/start?tz=${encodeURIComponent(tz)}${next ? `&next=${encodeURIComponent(next)}` : ""}${mode === "signup" && invite ? `&invite=${encodeURIComponent(invite)}` : ""}`;
  };
  const verb = mode === "login" ? "Sign in" : "Sign up";

  if (!apple && !google && !supported) return null;
  return (
    <div className="flex flex-col gap-2.5">
      {apple && (
        <a
          href="/api/auth/apple/start"
          onClick={(e) => {
            e.preventDefault();
            window.location.href = startHref("apple");
          }}
          className="flex h-[3.25rem] items-center justify-center gap-2 rounded-[1.125rem] bg-black text-[0.9375rem] font-medium text-white shadow-soft active:scale-[0.98] dark:bg-white dark:text-black"
        >
          <AppleLogo /> {verb} with Apple
        </a>
      )}
      {google && (
        <a
          href="/api/auth/google/start"
          onClick={(e) => {
            e.preventDefault();
            window.location.href = startHref("google");
          }}
          className="flex h-[3.25rem] items-center justify-center gap-2.5 rounded-[1.125rem] border border-[#747775] bg-white text-[0.9375rem] font-medium text-[#1f1f1f] shadow-soft active:scale-[0.98]"
        >
          <GoogleLogo /> {verb} with Google
        </a>
      )}
      {supported && (
        <button
          type="button"
          onClick={passkey}
          disabled={busy}
          className="flex h-[3.25rem] items-center justify-center gap-2 rounded-[1.125rem] bg-surface ring-1 ring-border text-[0.9375rem] font-medium shadow-soft active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-[18px] w-[18px]" />} Sign in with a passkey
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="my-2 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" /> or with email <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
