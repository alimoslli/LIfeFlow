import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { CopyText } from "@/components/jarvis/idea-button";
import { SubmitButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { IMPORT_PROMPT } from "@/server/services/memory";
import { importMemoriesAction } from "../../actions";

export const metadata: Metadata = { title: "Import memory" };

/** Bring what another AI knows: run our prompt there, paste the answer here. Every fact waits for the user's OK. */
export default function ImportMemoryPage() {
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6">
      <header>
        <h1 className="font-display text-[34px] leading-tight font-medium tracking-tight">Import memory</h1>
        <p className="mt-1 text-sm text-text-2">Copy this into a chat with your other AI assistant, then paste its answer below.</p>
      </header>
      <div className="flex flex-col gap-3 rounded-3xl bg-surface p-5 shadow-soft">
        <p className="text-[15px] text-text-2">{IMPORT_PROMPT}</p>
        <CopyText text={IMPORT_PROMPT} />
      </div>
      <ActionForm action={importMemoriesAction} className="flex flex-col gap-3">
        <label htmlFor="import-text" className="text-[15px] font-medium">
          Paste the answer here
        </label>
        <Textarea id="import-text" name="text" rows={8} required maxLength={20000} placeholder="Paste your info here…" />
        <SubmitButton>Add as suggestions</SubmitButton>
        <p className="text-xs text-muted">Each fact shows up under Memory for you to keep or dismiss. Nothing is used until you approve it.</p>
      </ActionForm>
    </div>
  );
}
