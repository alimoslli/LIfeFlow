"use client";
import { useTransition } from "react";
import { Loader2, LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { clearOfflineData } from "./pwa-client";

/** Signs out, after turning off this device's notifications and wiping what was saved for offline use. */
export function SignOutButton() {
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
      className="flex min-h-11 items-center gap-1.5 rounded-full bg-surface px-4 text-sm text-text-2 shadow-soft hover:text-text disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Sign out
    </button>
  );
}
