"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type InputHTMLAttributes } from "react";

/**
 * A search box that filters as you type, from the first letter: it updates `?q=` in the URL (other params kept)
 * a moment after each keystroke, so the server page re-renders with the results. Still a normal form field, so
 * Enter and no-JavaScript keep working.
 */
export function LiveSearchInput({
  name = "q",
  defaultValue = "",
  delayMs = 200,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "onChange" | "value"> & { name?: string; defaultValue?: string; delayMs?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(defaultValue);
  const [, startTransition] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const v = value.trim();
      if (v) params.set(name, v);
      else params.delete(name);
      const qs = params.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    }, delayMs);
    return () => clearTimeout(t);
  }, [value, name, delayMs, pathname, router]);

  return <input {...rest} name={name} value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />;
}
