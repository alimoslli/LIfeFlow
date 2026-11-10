/**
 * Words before a tool that only say what's about to happen ("Let me check…", "One sec:"), cleared once the tool starts.
 * A finished sentence ("That's a promise. I'll check in tonight at 8.") is an answer and stays.
 */
export function isNarration(text: string) {
  const t = text.trim();
  if (!t) return false;
  return /(…|\.\.\.|:)$/.test(t) || /^(let me|let's see|one (sec|second|moment)|just a (sec|second|moment)|checking|looking|give me a)/i.test(t);
}
