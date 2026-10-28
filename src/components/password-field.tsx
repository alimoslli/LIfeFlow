"use client";
import { useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import type { PasswordStrength } from "@/lib/password-strength";

const BAR = ["bg-danger", "bg-danger", "bg-warning", "bg-success", "bg-success"];

/**
 * A new-password input with a live strength meter. The checker (and its
 * word lists) loads on first keystroke, so pages that never type a new
 * password don't pay for it. The server enforces the same rule.
 */
export function NewPasswordField({ className, context = [], ...props }: InputHTMLAttributes<HTMLInputElement> & { context?: string[] }) {
  const [strength, setStrength] = useState<PasswordStrength | null>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <input
        {...props}
        type="password"
        autoComplete="new-password"
        className={className}
        onChange={async (e) => {
          props.onChange?.(e);
          const value = e.target.value;
          if (!value) return setStrength(null);
          const { checkPassword } = await import("@/lib/password-strength");
          setStrength(checkPassword(value, context));
        }}
      />
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", strength && strength.score > i ? BAR[strength.score] : "bg-surface-3")} />
        ))}
      </div>
      <span className={cn("text-xs", strength && !strength.ok ? "text-warning" : "text-muted")} aria-live="polite">
        {strength ? strength.message : "At least 10 characters. A few unrelated words works well."}
      </span>
    </div>
  );
}
