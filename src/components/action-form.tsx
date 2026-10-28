"use client";
import { useActionState, useCallback, useEffect, useRef, type ReactNode } from "react";
import type { ActionState } from "@/server/actions";
import { FormError } from "./ui/field";
import { toast } from "./ui/toaster";
import { isNetworkError, isOffline } from "@/lib/offline-queue";
import { cn } from "@/lib/utils";

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
      return r;
    },
    [action],
  );
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
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  onSuccess?: () => void;
  reset?: boolean;
  showSuccess?: boolean;
  /** Saves the form on this device when there's no connection (synced later). Returns the message to show. */
  offline?: (fd: FormData) => Promise<string>;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const reported = useReportedAction(action, (r) => {
    if (!r?.ok) return;
    if (reset) ref.current?.reset();
    // Every save gives feedback: inline when the form asks for it, otherwise a toast.
    if (!showSuccess) toast(r.message ?? "Saved.", { undo: r.undo });
    onSuccess?.();
  });
  const [state, formAction] = useActionState(reported, null);
  return (
    <form
      ref={ref}
      action={formAction}
      onSubmit={(e) => {
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
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  title?: string;
  confirm?: string;
  /** Runs after the action succeeds (e.g. close the sheet it lives in). */
  onSuccess?: () => void;
}) {
  const reported = useReportedAction(action, (r) => {
    if (!r) return;
    if (r.ok && r.message) toast(r.message, { undo: r.undo });
    if (!r.ok) toast(r.error ?? "Something went wrong.", { tone: "danger" });
    if (r.ok) onSuccess?.();
  });
  const [, formAction, pending] = useActionState(reported, null);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="contents"
    >
      <button type="submit" title={title} aria-label={title} disabled={pending} className={cn("lf-touch disabled:opacity-50", className)}>
        {children}
      </button>
    </form>
  );
}
