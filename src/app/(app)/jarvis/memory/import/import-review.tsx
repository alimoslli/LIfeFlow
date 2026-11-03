"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Button, SubmitButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { parseLifeImport, type ImportItem } from "@/lib/life-import";
import { saveLifeImportAction } from "../../actions";

const FACT_LABEL = { fact: "About you", preference: "Preference", routine: "Routine" } as const;
const GROUPS: { kind: ImportItem["kind"]; title: string; hint: string }[] = [
  { kind: "fact", title: "About you", hint: "Jarvis uses these to fit his help to you." },
  { kind: "milestone", title: "Milestones", hint: "Saved to your life milestones." },
  { kind: "goal", title: "Goals", hint: "Added to your goals." },
];

/** Paste → sorted list with checkboxes → save only what's ticked. Nothing is saved before "Save". */
export function ImportReview() {
  const [text, setText] = useState("");
  const [items, setItems] = useState<(ImportItem & { keep: boolean })[] | null>(null);

  if (!items)
    return (
      <div className="flex flex-col gap-3">
        <label htmlFor="import-text" className="text-[0.9375rem] font-medium">
          Paste the answer here
        </label>
        <Textarea id="import-text" rows={9} maxLength={20000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your info here…" />
        <Button type="button" disabled={text.trim().length < 3} onClick={() => setItems(parseLifeImport(text).map((i) => ({ ...i, keep: true })))}>
          Sort it for me
        </Button>
        <p className="text-xs text-muted">Next you&apos;ll see each line sorted, and you choose what to keep. Nothing is saved until you tap Save.</p>
      </div>
    );

  const chosen = items.filter((i) => i.keep);
  if (!items.length)
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-surface-2 p-4">
        <p className="text-[0.9375rem]">Nothing to add from that text.</p>
        <Button type="button" variant="secondary" onClick={() => setItems(null)}>
          Paste something else
        </Button>
      </div>
    );
  return (
    <ActionForm action={saveLifeImportAction} reset={false} className="flex flex-col gap-4">
      <input type="hidden" name="items" value={JSON.stringify(chosen.map(({ keep: _k, ...i }) => i))} />
      {GROUPS.map((g) => {
        const rows = items.map((it, idx) => ({ it, idx })).filter((r) => r.it.kind === g.kind);
        if (!rows.length) return null;
        return (
          <section key={g.kind} className="rounded-2xl bg-surface-2 p-4" aria-label={g.title}>
            <h2 className="text-[1.0625rem] font-semibold">
              {g.title} <span className="text-sm font-normal text-muted">({rows.length})</span>
            </h2>
            <p className="text-xs text-muted">{g.hint}</p>
            <ul className="mt-2 divide-y divide-border">
              {rows.map(({ it, idx }) => (
                <li key={idx}>
                  <label className="flex min-h-12 cursor-pointer items-start gap-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={it.keep}
                      onChange={(e) => setItems(items.map((x, j) => (j === idx ? { ...x, keep: e.target.checked } : x)))}
                      className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.9375rem] break-words">{it.text}</span>
                      <span className="block text-xs text-muted">
                        {it.kind === "fact"
                          ? FACT_LABEL[it.category]
                          : it.kind === "milestone"
                            ? [it.when, it.category[0].toUpperCase() + it.category.slice(1)].filter(Boolean).join(" · ")
                            : "Goal"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <SubmitButton disabled={!chosen.length} pendingText="Saving…">
        Save {chosen.length} {chosen.length === 1 ? "item" : "items"}
      </SubmitButton>
      <Button type="button" variant="ghost" onClick={() => setItems(null)}>
        Back to the text
      </Button>
    </ActionForm>
  );
}
