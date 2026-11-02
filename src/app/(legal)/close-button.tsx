"use client";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

/** Leaves the page: back to where you came from, or home when it was opened directly (installed app, shared link). */
export function CloseButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Close"
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-text shadow-soft hover:shadow-lift"
    >
      <X className="h-5 w-5" />
    </button>
  );
}
