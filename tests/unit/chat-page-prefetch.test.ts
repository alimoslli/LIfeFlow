import { describe, expect, it } from "vitest";
import { isChatPage } from "@/lib/app-routes";

// The full-screen chat is never prefetched (lib/app-routes.ts): its content is the live state of the chat, and a prefetched
// copy would be reused for five minutes after a chat starts on Today.
describe("the chat page is never prefetched", () => {
  it("counts the chat, with or without a chat in its address", () => {
    expect(isChatPage("/jarvis")).toBe(true);
    expect(isChatPage("/jarvis?c=3f9c2a10-7b1e-4c2d-9a8f-1234567890ab")).toBe(true);
    expect(isChatPage("/jarvis?ask=help")).toBe(true);
  });

  it("leaves the skyling's own pages and every other page alone", () => {
    expect(isChatPage("/jarvis/says")).toBe(false);
    expect(isChatPage("/jarvis/profile")).toBe(false);
    expect(isChatPage("/jarvis/memory")).toBe(false);
    expect(isChatPage("/jarvis/ideas")).toBe(false);
    expect(isChatPage("/")).toBe(false);
    expect(isChatPage("/money")).toBe(false);
  });
});
