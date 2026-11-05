import { describe, expect, it, vi } from "vitest";
import { friendlyProviderError } from "@/server/jarvis/agent";
import { UNNAMED_ASSISTANT } from "@/lib/assistant";

/** A provider error the way the SDK throws them: a status and a raw, technical message. */
const withStatus = (status: number, message: string) => Object.assign(new Error(message), { status });
const RAW = "Incorrect API key provided: sk-proj-abc123. You can find your API key at https://platform.openai.com/account/api-keys.";

const BRANCHES: [string, unknown][] = [
  ["401", withStatus(401, RAW)],
  ["404", withStatus(404, "The model `gpt-9-turbo` does not exist or you do not have access to it.")],
  ["429", withStatus(429, "You exceeded your current quota, please check your plan and billing details.")],
  ["5xx", withStatus(503, "upstream connect error or disconnect/reset before headers")],
  ["network", new TypeError("fetch failed: getaddrinfo ENOTFOUND api.openai.com")],
  ["unknown", new Error('Unexpected token < in JSON at position 0: "<html>Bad Gateway</html>" OPENAI_BASE_URL')],
  ["not an error", { detail: "thrown by a dependency" }],
];

describe("chat error messages", () => {
  it.each(BRANCHES)("%s: plain words with the user's own name, nothing technical", (_branch, err) => {
    const m = friendlyProviderError(err, "Nova");
    expect(m).toMatch(/\bNova\b/);
    expect(m).not.toMatch(/jarvis|openai|model|server|key/i);
    // No raw error text, not even a fragment of it.
    const raw = err instanceof Error ? err.message : JSON.stringify(err);
    for (const piece of raw.split(/[\s:`"<>]+/).filter((w) => w.length >= 6)) expect(m).not.toContain(piece);
    expect(m).not.toMatch(/—/); // no em dash
    expect(m.length).toBeLessThan(120);
  });

  it.each(BRANCHES)("%s: says 'your assistant' before they choose a name", (_branch, err) => {
    const m = friendlyProviderError(err, UNNAMED_ASSISTANT);
    expect(m).toMatch(/your assistant/i);
    expect(m).not.toMatch(/jarvis|openai|model|server|key/i);
    // A sentence never starts in lower case.
    expect(m).not.toMatch(/(^|[.!?]\s+)your assistant/);
  });

  it("each kind of failure reads differently, and busy/unavailable tell them to try again", () => {
    const out = BRANCHES.slice(0, 6).map(([, e]) => friendlyProviderError(e, "Nova"));
    expect(out[2]).toMatch(/busy/i); // 429
    for (const m of out) expect(m).toMatch(/try again/i);
  });

  it("is the user's name by default when none is passed", () => {
    expect(friendlyProviderError(withStatus(401, RAW))).toMatch(/^Your assistant /);
  });

  it("never logs from the wording function itself (the turn logs the details once)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    friendlyProviderError(withStatus(500, RAW), "Nova");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
