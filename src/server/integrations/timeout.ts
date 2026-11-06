/**
 * Every call to a provider (Google, Microsoft) gets a time limit per attempt, so a slow provider can't
 * hold a request, or a confirmed action, open for minutes. The pending-action "lost" limit
 * (jarvis/executor.ts) is set above attempts x this timeout.
 */
export const providerTimeoutMs = () => Number(process.env.PROVIDER_TIMEOUT_MS) || 20_000;

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
