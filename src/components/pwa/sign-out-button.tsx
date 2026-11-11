"use client";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { Sheet } from "@/components/ui/sheet";
import { unsavedCount } from "@/lib/offline-queue";
import { clearOfflineData } from "./pwa-client";
import { PixelIcon } from "@/components/pixel/pixel-icon";

/**
 * Signs out, after turning off this device's notifications and wiping what was saved for offline use.
 * If changes made offline aren't saved yet, asks first: signing out would lose them.
 */
export function SignOutButton({ className = "lf-sb lf-sb-app lf-sb-sm" }: { className?: string } = {}) {
  const [pending, start] = useTransition();
  const [unsaved, setUnsaved] = useState(0);
  const go = () =>
    start(async () => {
      await clearOfflineData();
      await logout();
    });
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const n = await unsavedCount(); // sends what it can first
            if (n > 0) setUnsaved(n);
            else {
              await clearOfflineData();
              await logout();
            }
          })
        }
        className={className}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PixelIcon name="exit" className="h-4 w-4" />} Sign out
      </button>
      <Sheet open={unsaved > 0} onClose={() => setUnsaved(0)} title="Sign out?">
        <p className="text-[0.9375rem]">
          {unsaved === 1 ? "1 change you made offline isn't saved yet." : `${unsaved} changes you made offline aren't saved yet.`} If you sign out now, they are
          lost.
        </p>
        <div className="mt-4 flex gap-2">
          <button type="button" className="lf-sb lf-sb-sun lf-sb-sm" onClick={() => setUnsaved(0)}>
            Stay
          </button>
          <button
            type="button"
            className="min-h-11 rounded-full px-4 text-sm text-muted"
            onClick={() => {
              setUnsaved(0);
              go();
            }}
          >
            Sign out anyway
          </button>
        </div>
      </Sheet>
    </>
  );
}
