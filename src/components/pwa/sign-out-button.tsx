"use client";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { clearOfflineData } from "./pwa-client";
import { PixelIcon } from "@/components/pixel/pixel-icon";

/** Signs out, after turning off this device's notifications and wiping what was saved for offline use. */
export function SignOutButton({ className = "lf-sb lf-sb-app lf-sb-sm" }: { className?: string } = {}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await clearOfflineData();
          await logout();
        })
      }
      className={className}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PixelIcon name="exit" className="h-4 w-4" />} Sign out
    </button>
  );
}
