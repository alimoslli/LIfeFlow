import { AssistantName } from "@/components/assistant-name";
import type { Metadata } from "next";
import { CopyText } from "@/components/jarvis/idea-button";
import { LIFE_IMPORT_PROMPT } from "@/lib/life-import";
import { ImportReview } from "./import-review";

export const metadata: Metadata = { title: "Import from another AI" };

/** Bring what another AI knows: run our prompt there, paste the answer here, tick what to keep. */
export default function ImportMemoryPage() {
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6">
      <header>
        <h1 className="font-display text-[2.125rem] leading-tight font-medium tracking-tight">Import from another AI</h1>
        <p className="mt-1 text-sm text-text-2">
          Already told ChatGPT or another AI about your life? Bring it here so <AssistantName /> knows you from day one.
        </p>
      </header>
      <ol className="flex flex-col gap-3">
        <li className="flex flex-col gap-3 rounded-3xl bg-surface p-5 shadow-soft">
          <p className="text-sm font-semibold">1. Copy this and send it to your other AI</p>
          <p className="text-[0.9375rem] whitespace-pre-line text-text-2">{LIFE_IMPORT_PROMPT}</p>
          <CopyText text={LIFE_IMPORT_PROMPT} />
        </li>
        <li className="rounded-3xl bg-surface p-5 shadow-soft">
          <p className="mb-3 text-sm font-semibold">2. Paste its answer and choose what to keep</p>
          <ImportReview />
        </li>
      </ol>
      <p className="text-xs text-muted">
        Passwords and account numbers are left out automatically. Untick anything you&apos;d rather keep to yourself; you can delete anything later.
      </p>
    </div>
  );
}
