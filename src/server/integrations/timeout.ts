/**
 * Every call to a provider (Google, Microsoft) gets a time limit per attempt, so a slow provider can't
 * hold a request, or a confirmed action, open for minutes. The pending-action "lost" limit
 * (jarvis/executor.ts) is set above attempts x this timeout.
 */
export const DEFAULT_PROVIDER_TIMEOUT_MS = 20_000;

/** The per-attempt limit. Only outside production can PROVIDER_TIMEOUT_MS change it (tests use tiny values); junk falls back to the default. */
export function providerTimeoutMs(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === "production") return DEFAULT_PROVIDER_TIMEOUT_MS;
  const n = Number(env.PROVIDER_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PROVIDER_TIMEOUT_MS;
}

export class ProviderTimeout extends Error {}

type Fetch = typeof fetch;

/** `f(url, init)` with a time limit; throws ProviderTimeout when it runs out. */
export async function fetchWithTimeout(f: Fetch, url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await f(url, { ...init, signal: init.signal ?? AbortSignal.timeout(providerTimeoutMs()) });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) throw new ProviderTimeout("The provider took too long to answer.");
    throw e;
  }
}

/**
 * Reads a JSON body. A body cut off by the time limit, or unreadable, throws (via `err`) unless the answer
 * was already an error status, where the body is only for logging.
 */
export type JsonBody = { error?: { status?: string; message?: unknown; code?: string }; [key: string]: unknown };

export async function readJson(res: Response, err: (message: string) => Error): Promise<JsonBody> {
  try {
    return await res.json();
  } catch (e) {
    if (!res.ok) return {};
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError"))
      throw err("The provider took too long to send its answer. Nothing was changed; try again in a minute.");
    throw err("The provider sent an answer that couldn't be read. Nothing was changed; try again in a minute.");
  }
}
