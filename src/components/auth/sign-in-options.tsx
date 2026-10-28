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

/**
 * Sign in with Apple and with a passkey (Face ID / Touch ID), above the
 * email form. On sign-in, passkeys also show up in the email field's
 * suggestions (autocomplete="username webauthn").
 */
export function SignInOptions({ mode, apple, next }: { mode: "login" | "signup"; apple: boolean; next?: string }) {
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
      signInWithPasskey(next ?? "/", true)
        .then((r) => router.replace(r.next))
        .catch((e) => {
          if (!(e instanceof PasskeyCancelled) && live) setError(e instanceof Error ? e.message : "Couldn't sign in with that passkey.");
        });
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

  const appleHref = () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    return `/api/auth/apple/start?tz=${encodeURIComponent(tz)}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
  };

  if (!apple && !supported) return null;
  return (
    <div className="flex flex-col gap-2.5">
      {apple && (
        <a
          href="/api/auth/apple/start"
          onClick={(e) => {
            e.preventDefault();
            window.location.href = appleHref();
          }}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-black text-[15px] font-medium text-white shadow-soft active:scale-[0.98] dark:bg-white dark:text-black"
        >
          <AppleLogo /> {mode === "login" ? "Sign in with Apple" : "Sign up with Apple"}
        </a>
      )}
      {supported && (
        <button
          type="button"
          onClick={passkey}
          disabled={busy}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-surface text-[15px] font-medium shadow-soft active:scale-[0.98] disabled:opacity-60"
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
