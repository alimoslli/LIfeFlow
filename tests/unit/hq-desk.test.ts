import { describe, expect, it } from "vitest";
import { deskLink, firstPrompt, nextPrompt } from "@/server/hq/desk";
import { deskStatus } from "@/server/services/hq-desk";
import { deskPromptOf, parseArgs } from "../../scripts/hq";

const ID = "6f1c2c1e-6a43-4b3a-9a59-0d7c2f8f0a11";
const task = { id: ID, title: "Finish Twilio", deskPrompt: "Check the SMS path & fix it.\nThen 100% done?", sessionId: null };

describe("desk links (ADR 0029)", () => {
  it("a file with no chat opens a new Claude Code chat in the LifeFlow repo with the first prompt typed in", () => {
    const l = deskLink(task);
    expect(l.kind).toBe("new");
    expect(l.href.startsWith("https://claude.ai/code/new?q=")).toBe(true);
    expect(l.href.endsWith("&repo=alimoslli%2FLIfeFlow")).toBe(true);
    // Encoded with %20 (never "+"), so every reader decodes spaces and symbols the same way.
    expect(l.href).not.toMatch(/\+/);
    const q = new URL(l.href).searchParams.get("q")!;
    expect(q).toBe(firstPrompt(task));
    expect(q.split("\n")[0]).toBe("Desk task: Finish Twilio");
    expect(q).toContain(`npx tsx scripts/hq.ts mission update ${ID} --status doing`);
    expect(q).toContain("Check the SMS path & fix it.\nThen 100% done?");
    expect(q).toContain(`mission update ${ID} --status done --result`);
  });

  it("a file whose chat exists reopens that chat and carries the next prompt to copy", () => {
    const l = deskLink({ ...task, sessionId: "session_01ABCdefGHIjklMNOpqr" });
    expect(l).toEqual({ kind: "open", href: "https://claude.ai/code/session_01ABCdefGHIjklMNOpqr", prompt: nextPrompt(task) });
    expect(l.prompt).toContain('Back on "Finish Twilio"');
  });

  it("keeps the link a sensible length at the 1,500-character prompt cap", () => {
    expect(deskLink({ ...task, deskPrompt: "word ".repeat(300) }).href.length).toBeLessThan(8000);
  });

  it("says where a task is in one plain line", () => {
    const m = { status: "todo" as const, sessionId: null, progress: null, blockedReason: null };
    expect(deskStatus(m)).toBe("Not started");
    expect(deskStatus({ ...m, sessionId: "session_x" })).toBe("Chat started");
    expect(deskStatus({ ...m, status: "doing" })).toBe("In its chat");
    expect(deskStatus({ ...m, status: "doing", progress: "Fixing the webhook" })).toBe("Fixing the webhook");
    expect(deskStatus({ ...m, status: "waiting" })).toBe("Ready for your look");
    expect(deskStatus({ ...m, status: "blocked", blockedReason: "The Twilio number" })).toBe("Waiting on you: The Twilio number");
  });

  it("the CLI takes --desk-prompt, and nothing when it's absent", () => {
    expect(deskPromptOf(parseArgs(["mission", "add", "--desk-prompt", "Do the thing"]))).toEqual({ deskPrompt: "Do the thing" });
    expect(deskPromptOf(parseArgs(["mission", "add", "--title", "x"]))).toEqual({});
  });
});
