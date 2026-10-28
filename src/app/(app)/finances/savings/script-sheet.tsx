"use client";
import { useState } from "react";
import { Copy } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toaster";

/** The negotiation script, ready to copy. Jarvis never sends it. */
export function ScriptSheet({ provider, script }: { provider: string; script: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 rounded-full bg-surface-2 px-4 text-sm font-medium">
        Negotiation script
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="What to say">
        <p className="mb-3 text-sm text-text-2">
          Call or chat with your provider and use this. Mentioning {provider}&apos;s price often gets a better offer from the retention team.
        </p>
        <pre className="rounded-2xl bg-surface-2 p-4 text-[15px] leading-relaxed whitespace-pre-wrap">{script}</pre>
        <button
          type="button"
          onClick={() =>
            navigator.clipboard?.writeText(script).then(
              () => toast("Copied."),
              () => toast("Couldn't copy. Select the text instead.", { tone: "danger" }),
            )
          }
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent font-medium text-accent-text"
        >
          <Copy className="h-4 w-4" /> Copy
        </button>
        <p className="mt-3 text-xs text-muted">Jarvis never contacts anyone for you.</p>
      </Sheet>
    </>
  );
}
