import { beforeEach, describe, expect, it } from "vitest";
import { handOff, takeHandoff } from "@/lib/ask-handoff";

/** The question a button hands to the chat page lives in the tab, once, for a few seconds (never in the address). */
describe("handing a question to the chat page", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage;
  });

  it("is taken once, with whether to send it", () => {
    handOff("What should I do first today?", true);
    expect(takeHandoff()).toEqual({ prompt: "What should I do first today?", send: true });
    expect(takeHandoff()).toBeNull();
    handOff("Plan my week", false);
    expect(takeHandoff()).toEqual({ prompt: "Plan my week", send: false });
  });

  it("goes stale after a few seconds, so a later visit never sends it by itself", () => {
    handOff("Delete my old to-dos", true);
    expect(takeHandoff(Date.now() + 60_000)).toBeNull();
    // and it is gone either way
    expect(takeHandoff()).toBeNull();
  });
});
