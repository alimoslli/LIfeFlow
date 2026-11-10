"use client";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Loader2, Lock } from "lucide-react";
import { biometricName, PasskeyCancelled, unlockWithPasskey } from "@/components/auth/passkey-client";
import { haptic } from "@/lib/haptics";

/** Shown instead of Money when the Face ID lock is on and Money hasn't been used for a while. */
export function MoneyLockScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Decided in the browser only, so the server's "a passkey" never mismatches Face ID / Touch ID.
  const name = useSyncExternalStore(noSubscribe, biometricName, () => "a passkey");
  const unlock = async () => {
    setBusy(true);
    setError(null);
    try {
      await unlockWithPasskey();
      haptic("success");
      router.refresh();
    } catch (e) {
      if (!(e instanceof PasskeyCancelled)) setError(e instanceof Error ? e.message : "Couldn't unlock. Try again.");
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-sm flex-col items-center justify-center gap-4 px-4 text-center" data-testid="money-locked">
      <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-accent-soft text-accent">
        <Lock className="h-7 w-7" />
      </span>
      <h1 className="font-display text-[1.875rem] leading-tight font-medium">Money is locked</h1>
      <p className="text-[0.9375rem] text-text-2">Your balances and investments are hidden until you confirm it&apos;s you.</p>
      <button type="button" onClick={unlock} disabled={busy} className="lf-sb lf-sb-sun lf-sb-sm mt-2 w-full">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Unlock with {name}
      </button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <p className="text-xs text-muted">You can change this in Settings, Security.</p>
    </div>
  );
}

const noSubscribe = () => () => {};
