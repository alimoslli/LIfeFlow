"use client";
import { useEffect, useState } from "react";
import { ClipboardCopy } from "lucide-react";

/**
 * Copies an instruction to the clipboard, then opens the real chat in a new tab for the owner to paste.
 * HQ cannot type into the chat for them: this is the supported way to hand over a task.
 */
export function CopyAndOpen({
  url,
  defaultText,
  editable = false,
  label = "Copy and open",
}: {
  url: string;
  defaultText: string;
  editable?: boolean;
  label?: string;
}) {
  const [text, setText] = useState(defaultText);
  const [msg, setMsg] = useState("");
  async function go() {
    // Open first, synchronously, so browsers still count it as the tap.
    window.open(url, "_blank", "noopener,noreferrer");
    try {
      await navigator.clipboard.writeText(text);
      setMsg("Copied. Paste it into the chat.");
    } catch {
      setMsg("Couldn't copy. Select the text above and copy it by hand.");
    }
  }
  return (
    <div className="flex flex-col gap-2">
      {editable ? (
        <label className="flex flex-col gap-1.5 text-[0.8125rem] font-medium text-text-2">
          What to tell them
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={2000}
            className="min-h-20 w-full rounded-xl border border-border/80 bg-surface px-3.5 py-2 text-sm font-normal text-text focus:border-accent focus:ring-2 focus:ring-[var(--ring)] focus:outline-none"
          />
        </label>
      ) : (
        <p className="rounded-xl bg-surface-2 px-3.5 py-2 text-sm break-words whitespace-pre-wrap text-text-2">{text}</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={go}
          disabled={!text.trim()}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-accent-text disabled:opacity-50"
        >
          <ClipboardCopy className="h-4 w-4" aria-hidden /> {label}
        </button>
        <span role="status" className="text-xs text-text-2">
          {msg}
        </span>
      </div>
    </div>
  );
}

/** Forgets the one-time key cookie right after it was shown (a plain request, so the page keeps showing the key until you leave). */
export function ClearOnce({ url }: { url: string }) {
  useEffect(() => {
    void fetch(url, { method: "POST", credentials: "same-origin" }).catch(() => undefined);
  }, [url]);
  return null;
}
