"use client";
import { useOptimistic, useState, useSyncExternalStore, useTransition } from "react";
import { haptic } from "@/lib/haptics";
import { isNetworkError, isOffline, offlineTaskDone, queueTaskStatus, subscribeQueue } from "@/lib/offline-queue";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/server/actions";
import { toast } from "./ui/toaster";
import { celebrate } from "./motion/burst";
import { PixelIcon } from "./pixel/pixel-icon";

export const OFFLINE_SAVED = "Saved on this phone. It will sync when you're back online.";

/**
 * Optimistic completion checkbox backed by a server action. The visible box is small; the touch target is 44×44.
 * With `taskId`, ticking it offline saves on the device and syncs later.
 */
export function TaskCheck({ done, action, label, taskId }: { done: boolean; action: () => Promise<ActionState>; label: string; taskId?: string }) {
  const [serverOptimistic, setOptimistic] = useOptimistic(done);
  const local = useSyncExternalStore(
    subscribeQueue,
    () => (taskId ? offlineTaskDone(taskId) : undefined),
    () => undefined,
  );
  const checked = local ?? serverOptimistic;
  const [, start] = useTransition();
  const [toggled, setToggled] = useState(false); // pop only when the user ticks it, not on page load

  const offline = async (next: boolean) => {
    if (!taskId) return toast("You're offline. Try again when you're connected.", { tone: "danger" });
    await queueTaskStatus(taskId, next);
    toast(OFFLINE_SAVED);
  };

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        const next = !checked;
        setToggled(true);
        if (next) {
          haptic("success");
          // finishing something gets its moment: sparks from the box
          celebrate(e.currentTarget.getBoundingClientRect(), "small");
        }
        if (isOffline()) return void offline(next);
        start(async () => {
          setOptimistic(next);
          try {
            const r = await action();
            if (r && !r.ok) toast(r.error ?? "Couldn't update.", { tone: "danger" });
            else if (r?.message && (next || r.message.includes("Next"))) toast(r.message);
          } catch (e) {
            if (!isNetworkError(e)) throw e;
            await offline(next);
          }
        });
      }}
      className="tap -m-2.5 flex shrink-0 items-center justify-center rounded-full"
    >
      {/* our own tick box: the pixel to-do icon, empty until it's done */}
      <span className={cn("flex h-6 w-6 items-center justify-center", toggled && checked && "lf-pop")}>
        <PixelIcon name={checked ? "todo" : "box"} className={cn("h-6 w-6", !checked && "lf-box")} />
      </span>
    </button>
  );
}
