"use client";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { ActionState } from "@/server/actions";
import { FormError } from "./ui/field";
import { toast } from "./ui/toaster";
import { cn } from "@/lib/utils";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/** A form bound to a server action, with inline error display and reset-on-success. */
export function ActionForm({
  action,
  children,
  className,
  onSuccess,
  reset = true,
  showSuccess = false,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  onSuccess?: () => void;
  reset?: boolean;
  showSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });
  useEffect(() => {
    if (state?.ok) {
      if (reset) ref.current?.reset();
      onSuccessRef.current?.();
      // Every save gives feedback: inline when the form asks for it, otherwise a toast.
      if (!showSuccess) toast(state.message ?? "Saved.", { undo: state.undo });
    }
  }, [state, reset, showSuccess]);
  return (
    <form ref={ref} action={formAction} className={cn("flex flex-col gap-3", className)}>
      {state && !state.ok && <FormError message={state.error} />}
      {showSuccess && state?.ok && state.message && <p className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">{state.message}</p>}
      {children}
    </form>
  );
}

/** One-click mutation button (e.g. complete, delete) as a tiny form. */
export function ActionButton({
  action,
  children,
  className,
  title,
  confirm,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  title?: string;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  useEffect(() => {
    if (!state) return;
    if (state.ok && state.message) toast(state.message, { undo: state.undo });
    if (!state.ok) toast(state.error ?? "Something went wrong.", { tone: "danger" });
  }, [state]);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="contents"
    >
      <button type="submit" title={title} aria-label={title} disabled={pending} className={cn("disabled:opacity-50", className)}>
        {children}
      </button>
      {state && !state.ok && (
        <span className="sr-only" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
