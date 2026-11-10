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
      className="lf-sb lf-sb-app lf-sb-sm"
    >
      <Compass className="h-4 w-4" /> Replay the tour
    </button>
  );
}
