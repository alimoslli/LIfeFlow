/**
 * Only words the app itself wrote reach people. A browser's fetch failure ("Load failed", "Failed to fetch"), a bare
 * server label ("Internal error") or a status line is replaced by `fallback`.
 */
const RAW =
  /load failed|failed to fetch|networkerror|typeerror|internal error|internal server error|request failed|^\s*(error|failed|undefined|null)\s*$|\(\s*[45]\d\d\s*\)|status [45]\d\d|\bat \S+\.(js|ts)/i;

export function plainMessage(text: unknown, fallback: string): string {
  if (typeof text !== "string") return fallback;
  const t = text.trim();
  if (!t || t.length > 300 || RAW.test(t)) return fallback;
  return t;
}
