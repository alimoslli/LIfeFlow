"use client";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { NewPasswordField } from "@/components/password-field";
import { FormError } from "@/components/ui/field";
import { resetPasswordAction, type ResetState } from "../actions";

const input =
  "h-12 w-full rounded-2xl bg-surface px-4 text-[15px] text-text shadow-soft placeholder:text-muted transition-shadow focus:shadow-lift focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

export function ResetForm() {
  const [state, action, pending] = useActionState<ResetState, FormData>(resetPasswordAction, null);
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setToken(window.location.hash.slice(1) || "");
      // Keep the token out of the address bar and history once read.
      history.replaceState(null, "", window.location.pathname);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  if (token === "")
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-[34px] leading-[1.05] font-medium tracking-tight">This link isn&apos;t complete.</h1>
        <p className="text-[15px] text-text-2">Open the link from the email again, or ask for a new one.</p>
        <Link href="/forgot-password" className="font-medium text-accent">
          Send a new link
        </Link>
      </div>
    );
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="mb-3">
        <h1 className="font-display text-[38px] leading-[1.05] font-medium tracking-tight">Choose a new password.</h1>
        <p className="mt-2 text-[15px] text-muted">You&apos;ll be signed out everywhere else, then you can sign in with it.</p>
      </div>
      <FormError message={state?.error} />
      <input type="hidden" name="token" value={token ?? ""} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-2">New password</span>
        <NewPasswordField id="password" name="password" required minLength={10} maxLength={200} className={input} />
      </label>
      <button
        type="submit"
        disabled={pending || !token}
        className="mt-2 flex h-12 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-medium text-accent-text shadow-soft active:scale-[0.98] disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} Save new password
      </button>
      {state?.error && (
        <Link href="/forgot-password" className="text-center text-sm font-medium text-accent">
          Send a new link
        </Link>
      )}
    </form>
  );
}
