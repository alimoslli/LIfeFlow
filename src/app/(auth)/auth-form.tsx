"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { SignInOptions } from "@/components/auth/sign-in-options";
import { NewPasswordField } from "@/components/password-field";
import { FormError } from "@/components/ui/field";
import { login, signup, type AuthState } from "./actions";

const input =
  "h-12 w-full rounded-2xl bg-surface px-4 text-[15px] text-text shadow-soft placeholder:text-muted transition-shadow focus:shadow-lift focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

export function AuthForm({
  mode,
  next,
  apple = false,
  notice,
  email,
}: {
  mode: "login" | "signup";
  next?: string;
  apple?: boolean;
  /** A message above the form (e.g. "Password changed. Sign in."). */
  notice?: { text: string; tone: "info" | "danger" };
  email?: string;
}) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? login : signup, null);
  // The browser's time zone, written straight to the hidden input after hydration.
  const tzRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (tzRef.current) tzRef.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }, []);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="mb-3">
        <h1 className="font-display text-[38px] leading-[1.05] font-medium tracking-tight">{mode === "login" ? "Welcome back." : "Let's get started."}</h1>
        <p className="mt-2 text-[15px] text-muted">
          {mode === "login" ? "Sign in to see your day." : "Create your account. You can add everything else later."}
        </p>
      </div>
      {notice && !state?.error && (
        <p
          role={notice.tone === "danger" ? "alert" : "status"}
          className={
            notice.tone === "danger" ? "rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger" : "rounded-2xl bg-accent-soft px-4 py-3 text-sm text-text"
          }
        >
          {notice.text}
        </p>
      )}
      <FormError message={state?.error} />
      <SignInOptions mode={mode} apple={apple} next={next} />
      {mode === "signup" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-2">Your name</span>
          <input id="name" name="name" autoComplete="name" required maxLength={80} className={input} />
        </label>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-2">Email</span>
        <input
          id="email"
          name="email"
          type="email"
          // "webauthn" lets the browser offer saved passkeys right in this field.
          autoComplete={mode === "login" ? "username webauthn" : "email"}
          required
          defaultValue={state?.email ?? email}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-2">Password</span>
        {mode === "signup" ? (
          <NewPasswordField id="password" name="password" required minLength={10} maxLength={200} className={input} />
        ) : (
          <input id="password" name="password" type="password" autoComplete="current-password" required className={input} />
        )}
      </label>
      {mode === "login" && (
        <Link href="/forgot-password" className="-mt-1 self-end py-2 text-sm font-medium text-accent">
          Forgot password?
        </Link>
      )}
      <input ref={tzRef} type="hidden" name="timezone" defaultValue="UTC" />
      {mode === "signup" && (
        <p className="text-xs text-muted">
          By creating an account, you agree to the{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-text">
            Terms of Use
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-text">
            Privacy Policy
          </Link>
          .
        </p>
      )}
      {next && <input type="hidden" name="next" value={next} />}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 flex h-12 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-medium text-accent-text shadow-soft transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {mode === "login" ? "Sign in" : "Create account"}
      </button>
      <p className="mt-2 text-center text-sm text-muted">
        {mode === "login" ? "New here? " : "Already have an account? "}
        <Link href={mode === "login" ? "/signup" : "/login"} className="font-medium text-accent">
          {mode === "login" ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </form>
  );
}
