"use client";
import { useActionState, useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import type { ActionState } from "@/server/actions";
import { FormError } from "./ui/field";
import { toast } from "./ui/toaster";
import { isNetworkError, isOffline } from "@/lib/offline-queue";
import { cn } from "@/lib/utils";
import { celebrate } from "./motion/burst";
import { primeSound } from "./motion/sound";

/** A celebration when the action succeeds: a star (small) or the milestone sun (big), with its tag. Plain data, so a server page can ask for it. */
export type Cheer = { size: "small" | "big"; label?: string };

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Wraps a server action so its feedback (toast, onSuccess) runs as soon as
 * the result arrives, even if the page re-renders and this control is gone
 * (e.g. deleting the last item swaps the list for an empty state).
 */
function useReportedAction(action: Action, report: (r: ActionState) => void) {
  const reportRef = useRef(report);
  useEffect(() => {
    reportRef.current = report;
  });
  return useCallback(
    async (prev: ActionState, fd: FormData) => {
      let r: ActionState;
      try {
        r = await action(prev, fd);
      } catch (e) {
        // A dropped connection shows as a normal error, not a crash screen.
        if (!isNetworkError(e)) throw e;
        r = { ok: false, error: "Couldn't reach LifeFlow. Check your connection and try again.", at: Date.now() };
      }
      reportRef.current(r);
      // A save clears the page cache; the app shell warms the tabs again (see app-shell.tsx).
      if (r?.ok) window.dispatchEvent(new Event("lf:saved"));
      return r;
    },
    [action],
  );
}

/**
 * React 19 resets an uncontrolled form after its action finishes, even when the
 * action failed. Put back what the person typed so they can fix it and resubmit.
 */
function restoreValues(form: HTMLFormElement, sent: FormData) {
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) || !el.name) continue;
    if (
      el instanceof HTMLInputElement &&
      (el.type === "hidden" || el.type === "file" || el.type === "submit" || el.type === "button" || el.type === "password")
    )
      continue;
    const values = sent.getAll(el.name).filter((v): v is string => typeof v === "string");
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) el.checked = values.includes(el.value);
    else if (el instanceof HTMLSelectElement && el.multiple) for (const o of Array.from(el.options)) o.selected = values.includes(o.value);
    else el.value = values[0] ?? "";
  }
}

/** A form bound to a server action, with inline error display and reset-on-success. */
export function ActionForm({
  action,
  children,
  className,
  onSuccess,
  reset = true,
  showSuccess = false,
  offline,
  cheer,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  onSuccess?: () => void;
  cheer?: Cheer;
  reset?: boolean;
  showSuccess?: boolean;
  /** Saves the form on this device when there's no connection (synced later). Returns the message to show. */
  offline?: (fd: FormData) => Promise<string>;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const sent = useRef<FormData | null>(null);
  const remember = useCallback(
    (prev: ActionState, fd: FormData) => {
      sent.current = fd;
      return action(prev, fd);
    },
    [action],
  );
  const reported = useReportedAction(remember, (r) => {
    if (!r?.ok) return;
    if (reset) ref.current?.reset();
    // Every save gives feedback: inline when the form asks for it, otherwise a toast.
    if (!showSuccess) toast(r.message ?? "Saved.", { undo: r.undo });
    if (cheer) celebrate(null, cheer.size, cheer.label);
    onSuccess?.();
  });
  const [state, formAction] = useActionState(reported, null);
  // The reset happens as the failed result commits; this runs right after it.
  useLayoutEffect(() => {
    if (state && !state.ok && ref.current && sent.current) restoreValues(ref.current, sent.current);
  }, [state]);
  return (
    <form
      ref={ref}
      action={formAction}
      onSubmit={(e) => {
        if (cheer?.size === "big") primeSound();
        if (!offline || !isOffline()) return;
        e.preventDefault();
        offline(new FormData(e.currentTarget))
          .then((msg) => {
            toast(msg);
            if (reset) ref.current?.reset();
            onSuccess?.();
          })
          .catch((err: Error) => toast(err.message, { tone: "danger" }));
      }}
      className={cn("flex flex-col gap-3", className)}
    >
      {state && !state.ok && <FormError message={state.error} />}
      {showSuccess && state?.ok && state.message && <p className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">{state.message}</p>}
      {children}
    </form>
  );
}

/** One-click mutation button (e.g. complete, delete) as a tiny form. Results show as a toast. */
export function ActionButton({
  action,
  children,
  className,
  title,
  confirm,
  onSuccess,
  cheer,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  title?: string;
  confirm?: string;
  cheer?: Cheer;
  /** Runs after the action succeeds (e.g. close the sheet it lives in). */
  onSuccess?: () => void;
}) {
  const spot = useRef<HTMLButtonElement>(null);
  const reported = useReportedAction(action, (r) => {
    if (!r) return;
    if (r.ok && r.message) toast(r.message, { undo: r.undo });
    if (!r.ok) toast(r.error ?? "Something went wrong.", { tone: "danger" });
    if (r.ok && cheer) celebrate(cheer.size === "big" ? null : (spot.current?.getBoundingClientRect() ?? null), cheer.size, cheer.label);
    if (r.ok) onSuccess?.();
  });
  const [, formAction, pending] = useActionState(reported, null);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
        else if (cheer?.size === "big") primeSound();
      }}
      className="contents"
    >
      <button ref={spot} type="submit" title={title} aria-label={title} disabled={pending} className={cn("lf-touch disabled:opacity-50", className)}>
        {children}
      </button>
    </form>
  );
}
