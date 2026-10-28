"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** A text field that shows how many characters are left once you get close to the limit. */
export function CountedInput({
  max,
  className,
  multiline,
  ...props
}: { max: number; multiline?: boolean } & React.InputHTMLAttributes<HTMLInputElement> & { rows?: number }) {
  const [len, setLen] = useState(String(props.defaultValue ?? "").length);
  const near = len >= max - 50;
  const field = multiline ? (
    <textarea
      {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
      maxLength={max}
      onChange={(e) => setLen(e.target.value.length)}
      className={cn("w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-[16px] focus:border-accent focus:outline-none", className)}
    />
  ) : (
    <input {...props} maxLength={max} onChange={(e) => setLen(e.target.value.length)} className={className} />
  );
  return (
    <span className="relative block w-full">
      {field}
      <span aria-live="polite" className={cn("mt-1 block text-right text-xs", len >= max ? "text-danger" : "text-muted", !near && "sr-only")}>
        {len >= max ? `That's the ${max}-character limit.` : `${max - len} characters left`}
      </span>
    </span>
  );
}
