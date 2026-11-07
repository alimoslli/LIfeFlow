/**
 * Only words the app itself wrote reach people. Browsers and proxies word their own failures ("Load failed", "The string
 * did not match the expected pattern.", "Unexpected token '<'"), so this is an allowlist, never a list of bad phrases:
 * a message is shown only if the app threw it as a PlainError, or if it came from the JSON body of a deliberate error
 * response (the API's own 4xx/503 words). Everything else gets the caller's calm fallback.
 */
export class PlainError extends Error {}

/** The response's JSON body, or null when it isn't JSON (an HTML error page from a proxy, an empty body, a broken one). */
export async function jsonOf<T = Record<string, unknown>>(res: Response | null | undefined): Promise<T | null> {
  if (!res || !(res.headers.get("content-type") ?? "").includes("application/json")) return null;
  return (await res.json().catch(() => null)) as T | null;
}

/** The words the API wrote for people in a failed response; the fallback for a crash ("Internal error", 500) or anything that isn't the API's own JSON. */
export async function serverWords(res: Response | null | undefined, fallback: string): Promise<string> {
  if (!res || res.ok || (res.status >= 500 && res.status !== 503)) return fallback;
  const body = await jsonOf<{ error?: unknown }>(res);
  const t = typeof body?.error === "string" ? body.error.trim() : "";
  return t && t.length <= 300 ? t : fallback;
}
