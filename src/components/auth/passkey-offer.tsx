"use client";
import { useEffect, useState } from "react";
import { ScanFace } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toaster";
import { addPasskey, biometricName, deviceHasBiometrics, PasskeyCancelled, passkeysSupported } from "./passkey-client";

const DISMISSED = "lf-passkey-offer-dismissed";

/**
 * After signing in with a password, offers Face ID / Touch ID for next time:
 * only on devices that have it, only if the account has no passkey yet, and
 * never again on this device once declined.
 */
export function PasskeyOffer() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!document.cookie.split("; ").includes("lf_offer_passkey=1")) return;
    document.cookie = "lf_offer_passkey=; path=/; max-age=0";
    let live = true;
    (async () => {
      try {
        if (localStorage.getItem(DISMISSED) === "1" || !passkeysSupported() || !(await deviceHasBiometrics())) return;
      } catch {
        return;
      }
      const r = await fetch("/api/passkeys/status").catch(() => null);
      const s = r?.ok ? ((await r.json()) as { count: number; demo: boolean }) : null;
      if (live && s && s.count === 0 && !s.demo) setOpen(true);
    })();
    return () => {
      live = false;
    };
  }, []);

  const later = () => {
    setOpen(false);
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {}
  };

  const yes = async () => {
    setBusy(true);
    try {
      await addPasskey();
      toast(`Done. Next time, sign in with ${biometricName()}.`);
      setOpen(false);
    } catch (e) {
      if (!(e instanceof PasskeyCancelled)) toast(e instanceof Error ? e.message : "Couldn't set it up.", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const name = biometricName();
  return (
    <Sheet open={open} onClose={later} title={`Use ${name} next time?`}>
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-accent-soft text-accent">
          <ScanFace className="h-8 w-8" />
        </span>
        <p className="text-[15px] text-text-2">Sign in with a glance instead of typing your password. It&apos;s faster and can&apos;t be phished.</p>
        <button
          type="button"
          onClick={yes}
          disabled={busy}
          className="mt-2 min-h-12 w-full rounded-full bg-accent text-[15px] font-medium text-accent-text disabled:opacity-60"
        >
          Use {name}
        </button>
        <button type="button" onClick={later} className="min-h-11 w-full rounded-full text-[15px] text-text-2">
          Not now
        </button>
      </div>
    </Sheet>
  );
}
