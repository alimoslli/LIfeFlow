"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Compass } from "lucide-react";
import { setTourAction } from "@/app/(onboarding)/welcome/actions";

/** Re-queues the guided tour and goes to Today, where it starts. */
export function ReplayTour() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setTourAction("pending");
          router.push("/");
          router.refresh();
        })
      }
      className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm text-text-2 hover:text-text disabled:opacity-50"
    >
      <Compass className="h-4 w-4" /> Replay the tour
    </button>
  );
}
