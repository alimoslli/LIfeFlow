"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { login, signup, type AuthState } from "./actions";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? login : signup, null);
  // The browser's time zone, written straight to the hidden input after hydration.
  const tzRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (tzRef.current) tzRef.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }, []);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="mb-2">
        <h1 className="font-display text-3xl font-medium tracking-tight">{mode === "login" ? "Welcome back" : "Create your BudgetFlow"}</h1>
        <p className="mt-1 text-sm text-muted">{mode === "login" ? "Sign in to continue." : "It takes a minute. You can connect accounts later."}</p>
      </div>
      <FormError message={state?.error} />
      {mode === "signup" && (
        <Field label="Your name" htmlFor="name">
          <Input id="name" name="name" autoComplete="name" required maxLength={80} />
        </Field>
      )}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.email} />
      </Field>
      <Field label="Password" htmlFor="password" hint={mode === "signup" ? "At least 10 characters." : undefined}>
        <Input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "signup" ? 10 : 1} />
      </Field>
      <input ref={tzRef} type="hidden" name="timezone" defaultValue="UTC" />
      {next && <input type="hidden" name="next" value={next} />}
      <Button type="submit" loading={pending} className="mt-1 h-10">
        {mode === "login" ? "Sign in" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href="/signup" className="font-medium text-accent hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-accent hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
