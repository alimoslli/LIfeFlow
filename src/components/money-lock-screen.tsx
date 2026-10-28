"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { biometricName, PasskeyCancelled, unlockWithPasskey } from "@/components/auth/passkey-client";
import { haptic } from "@/lib/haptics";

/** Shown instead of Money when the Face ID lock is on and Money hasn't been used for a while. */
export function MoneyLockScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      <h1 className="font-display text-[30px] leading-tight font-medium">Money is locked</h1>
      <p className="text-[15px] text-text-2">Your balances and investments are hidden until you confirm it&apos;s you.</p>
      <button
        type="button"
        onClick={unlock}
        disabled={busy}
        className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-[15px] font-medium text-accent-text shadow-soft active:scale-[0.98] disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Unlock with {biometricName()}
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
