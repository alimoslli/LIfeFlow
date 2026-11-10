"use client";
import { useTransition } from "react";
import { Compass } from "lucide-react";
import { setTourAction } from "@/app/(onboarding)/welcome/actions";

/** Re-queues the guided tour and goes to Today, where it starts. */
export function ReplayTour() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setTourAction("pending");
          // a full load of Today on purpose: the shell reads "tour" when it starts, so a move inside the app never showed it again
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign("/");
        })
      }
      className="lf-sb lf-sb-app lf-sb-sm"
    >
      <Compass className="h-4 w-4" /> Replay the tour
    </button>
  );
}
