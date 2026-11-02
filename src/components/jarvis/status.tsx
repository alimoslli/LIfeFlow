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
 * The logo's three connected dots, gently pulsing in turn, with one word.
 * Shown only while Jarvis works; the reply replaces it.
 */
export function JarvisStatus({ word }: { word: string }) {
  return (
    <div className="flex items-center gap-2.5 py-1 text-muted" role="status" aria-label={`${word}…`}>
      <svg viewBox="0 0 24 24" className="lf-dots h-5 w-5 text-accent" aria-hidden>
        <path d="M8.5 13.5 L15.5 7.5 M8.5 13.5 L16.5 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" className="lf-dots-link" />
        <circle cx="7.5" cy="14" r="4" fill="currentColor" />
        <circle cx="16.5" cy="6.5" r="2.6" fill="currentColor" />
        <circle cx="17.5" cy="17.5" r="2.1" fill="currentColor" />
      </svg>
      <span key={word} className="animate-fade-in text-[0.875rem]">
        {word}…
      </span>
    </div>
  );
}
