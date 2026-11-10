/** One word for what Jarvis is doing, from the tool he's running. */
export function statusWord(tool?: string) {
  if (!tool) return "Thinking";
  if (/web|search|research|price|cancel_help/.test(tool)) return "Researching";
  if (
    /^(add|create|update|set|delete|move|categorize|recategorize|edit|log|save|remember|complete|apply|contribute|import|schedule|sync|send|draft|plan_paycheck)/.test(
      tool,
    )
  )
    return "Updating";
  if (/agenda|calendar|life_load|free_time|plan|schedule|shift/.test(tool)) return "Planning";
  return "Checking";
}

/**
 * Three pixel stars twinkling, with one word, beside the skyling who walks in place while it works (chat.tsx).
 * Shown only while it works; the reply replaces it.
 */
export function JarvisStatus({ word }: { word: string }) {
  return (
    <div className="flex min-h-9 items-center gap-2.5 text-muted" role="status" aria-label={`${word}…`}>
      <span className="lf-twinkle flex items-end gap-1 text-dawn-3" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span key={word} className="animate-fade-in text-[0.875rem]">
        {word}…
      </span>
    </div>
  );
}
