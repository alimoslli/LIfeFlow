"use client";
import { useEffect } from "react";
import { isNoise } from "@/lib/error-noise";

/** Sends one report per distinct error per page load (no personal details; the server scrubs too). */
const sent = new Set<string>();
export function reportError(message: string, digest?: string | null) {
  const route = window.location.pathname;
  const key = `${route}|${message}`;
  if (sent.has(key) || sent.size > 20) return;
  sent.add(key);
  void fetch("/api/errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: message.slice(0, 2000), route, digest: digest ?? null }),
    keepalive: true,
  }).catch(() => undefined);
}

/** Catches errors nothing else handled, anywhere in the app. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (isNoise(e.message)) return;
      reportError(`${e.error?.name ?? "Error"}: ${e.message}`);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      reportError(r instanceof Error ? `${r.name}: ${r.message}` : `Unhandled rejection: ${String(r).slice(0, 300)}`);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
