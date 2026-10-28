"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { Check, Trash2, Undo2 } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { isOffline, offlineTaskDone, queueTaskStatus } from "@/lib/offline-queue";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/server/actions";
import { OFFLINE_SAVED } from "./task-check";
import { toast } from "./ui/toaster";
import { gsap, MOTION, prefersReducedMotion } from "./motion/gsap";

const THRESHOLD = 88;

/**
 * Swipe right to complete, left to delete (with Undo). Vertical scrolling
 * stays native (touch-action: pan-y). Every swipe action also exists as a
 * normal button elsewhere, so nothing depends on swiping.
 */
export function SwipeRow({
  children,
  onComplete,
  onDelete,
  done = false,
  className,
  taskId,
}: {
  /** A to-do's id: completing it offline saves on this device and syncs later. */
  taskId?: string;
  children: ReactNode;
  onComplete?: () => Promise<ActionState>;
  onDelete?: () => Promise<ActionState>;
  done?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const row = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const g = useRef<{ x: number; y: number; dx: number; locked: "h" | "v" | null; crossed: boolean } | null>(null);
  const [dx, setDx] = useState(0);

  const settle = (to = 0) => {
    const el = row.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.style.transform = `translateX(${to}px)`;
      setDx(to);
      return;
    }
    gsap.to(el, { x: to, duration: 0.3, ease: MOTION.ease, onUpdate: () => setDx(Number(gsap.getProperty(el, "x"))) });
  };

  const run = async (kind: "complete" | "delete") => {
    haptic(kind === "complete" ? "success" : "warning");
    if (isOffline()) {
      settle(0);
      if (kind === "complete" && taskId) {
        await queueTaskStatus(taskId, !(offlineTaskDone(taskId) ?? done));
        toast(OFFLINE_SAVED);
      } else toast(kind === "delete" ? "You're offline. Deleting needs a connection." : "You're offline. Try again when you're connected.", { tone: "danger" });
      return;
    }
    if (kind === "delete" && onDelete) {
      const w = wrap.current;
      if (w && !prefersReducedMotion()) await gsap.to(w, { height: 0, opacity: 0, duration: 0.25, ease: "power2.in" });
      const r = await onDelete();
      if (r?.ok) toast(r.message ?? "Moved to trash.", { undo: r.undo });
      else {
        toast(r?.error ?? "Couldn't delete.", { tone: "danger" });
        if (w) gsap.set(w, { clearProps: "height,opacity" });
        settle(0);
      }
      router.refresh();
      return;
    }
    if (kind === "complete" && onComplete) {
      settle(0);
      const r = await onComplete();
      toast(r?.ok ? (r.message ?? "Done.") : (r?.error ?? "Couldn't update."), { tone: r?.ok ? "success" : "danger" });
      router.refresh();
    }
  };

  return (
    <div ref={wrap} className={cn("relative overflow-hidden", className)}>
      {/* What the swipe reveals (only while swiping: cards are translucent glass) */}
      {dx !== 0 && (
        <div aria-hidden className="absolute inset-0 flex items-center justify-between">
          {dx > 0 && (
            <span className={cn("flex h-full items-center gap-2 pl-5 text-sm font-medium text-white", done ? "bg-info" : "bg-success")} style={{ width: dx }}>
              {dx > 30 && (done ? <Undo2 className="h-5 w-5" /> : <Check className="h-5 w-5" />)}
            </span>
          )}
          {dx < 0 && (
            <span className="ml-auto flex h-full items-center justify-end gap-2 bg-danger pr-5 text-sm font-medium text-white" style={{ width: -dx }}>
              {dx < -30 && <Trash2 className="h-5 w-5" />}
            </span>
          )}
        </div>
      )}
      <div
        ref={row}
        className={cn("relative", dx !== 0 && "bg-bg")}
        style={{ touchAction: "pan-y" }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          g.current = { x: e.clientX, y: e.clientY, dx: 0, locked: null, crossed: false };
        }}
        onPointerMove={(e) => {
          const s = g.current;
          if (!s) return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          if (!s.locked && (Math.abs(mx) > 8 || Math.abs(my) > 8)) s.locked = Math.abs(mx) > Math.abs(my) ? "h" : "v";
          if (s.locked !== "h") return;
          let x = mx;
          if (x > 0 && !onComplete) x = 0;
          if (x < 0 && !onDelete) x = 0;
          x = Math.sign(x) * Math.min(Math.abs(x), 160);
          s.dx = x;
          const crossed = Math.abs(x) >= THRESHOLD;
          if (crossed !== s.crossed) {
            s.crossed = crossed;
            if (crossed) haptic("light");
          }
          if (row.current) row.current.style.transform = `translateX(${x}px)`;
          setDx(x);
        }}
        onPointerUp={() => {
          const s = g.current;
          g.current = null;
          if (!s || s.locked !== "h") return;
          if (s.dx >= THRESHOLD) void run("complete");
          else if (s.dx <= -THRESHOLD) void run("delete");
          else settle(0);
        }}
        onPointerCancel={() => {
          g.current = null;
          settle(0);
        }}
        onClickCapture={(e) => {
          // A swipe shouldn't also count as a tap on the link underneath.
          if (Math.abs(dx) > 4) e.preventDefault();
        }}
      >
        {children}
      </div>
    </div>
  );
}
