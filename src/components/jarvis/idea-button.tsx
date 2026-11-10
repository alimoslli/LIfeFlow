"use client";
import { useShell } from "@/components/shell/app-shell";
import { toast } from "@/components/ui/toaster";
import type { Idea } from "@/lib/ideas";
import { PixelIcon } from "@/components/pixel/pixel-icon";

/** An idea row: opens Jarvis with the idea in the box, so the user can add a file or details before sending. */
export function IdeaButton({ idea }: { idea: Idea }) {
  const { openJarvis } = useShell();
  return (
    <button type="button" onClick={() => openJarvis(idea.prompt)} className="flex w-full gap-4 py-4 text-left">
      <PixelIcon name={idea.icon} className="h-7 w-7 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[1rem] leading-snug font-semibold">{idea.title}</span>
        <span className="mt-1 block text-sm text-text-2">{idea.detail}</span>
      </span>
    </button>
  );
}

export function CopyText({ text, label = "Copy" }: { text: string; label?: string }) {
  return (
    <button type="button" onClick={() => navigator.clipboard?.writeText(text).then(() => toast("Copied."))} className="lf-sb lf-sb-app lf-sb-sm self-start">
      <PixelIcon name="copy" className="h-4 w-4" /> {label}
    </button>
  );
}
