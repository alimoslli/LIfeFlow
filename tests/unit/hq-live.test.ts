import { describe, expect, it } from "vitest";
import { CHANGE_MS, HEARTBEAT_MS, hqBase, liveLine, sessionIdFromEnv, shouldSend } from "../../scripts/hq-live.mjs";

const pre = (tool_name: string, tool_input: Record<string, unknown> = {}) => liveLine({ hook_event_name: "PreToolUse", tool_name, tool_input });

describe("the live line a chat sends HQ (ADR 0030)", () => {
  it("says what the chat is doing in plain words, never the command, the message or a file's contents", () => {
    expect(pre("Bash", { command: "curl -H 'Authorization: Bearer sk-secret' https://x", description: "Run the full browser test suite" })).toEqual({
      state: "busy",
      line: "Run the full browser test suite",
    });
    expect(pre("Bash", { command: "rm -rf /tmp/x && echo sk-secret" })).toEqual({ state: "busy", line: "Running a command" });
    expect(pre("Edit", { file_path: "/workspace/LIfeFlow/src/server/hq/desk.ts", old_string: "secret", new_string: "x" })).toEqual({
      state: "busy",
      line: "Editing desk.ts",
    });
    expect(pre("Write", { file_path: "/workspace/LIfeFlow/.env.local", content: "OPENAI_API_KEY=sk-x" })?.line).toBe("Editing .env.local");
    expect(pre("Read", { file_path: "/a/b/plaid.ts" })?.line).toBe("Reading plaid.ts");
    expect(pre("Grep", { pattern: "password" })?.line).toBe("Searching the code");
    expect(pre("WebSearch", { query: "my private question" })?.line).toBe("Searching the web");
    expect(pre("WebFetch", { url: "https://example.com/?token=abc" })?.line).toBe("Reading a web page");
    expect(pre("Agent", { description: "Review the money change", prompt: "secret details" })?.line).toBe("Helper: Review the money change");
    expect(pre("mcp__github__get_file_contents", { path: "x" })?.line).toBe("Using a connected tool");
    expect(liveLine({ hook_event_name: "UserPromptSubmit", prompt: "my private message" })).toEqual({ state: "busy", line: "Reading your message" });
    expect(liveLine({ hook_event_name: "Stop" })).toEqual({ state: "idle" });
  });

  it("skips bookkeeping tools and unknown events, and cleans and shortens a description", () => {
    for (const t of ["TaskCreate", "TaskUpdate", "TodoWrite", "ToolSearch", "AskUserQuestion"]) expect(pre(t)).toBeNull();
    expect(liveLine({ hook_event_name: "PostToolUse", tool_name: "Bash" })).toBeNull();
    expect(liveLine(null)).toBeNull();
    const long = pre("Bash", { description: `Run\u0000 the‮   tests ${"x".repeat(300)}` })!.line as string;
    expect(long.length).toBeLessThanOrEqual(140);
    expect(long.startsWith("Run the tests")).toBe(true);
    expect(long.endsWith("…")).toBe(true);
  });

  it("sends a change of state at once, a new line at most every 10 s, and a heartbeat every 2 minutes", () => {
    const t = 1_000_000;
    const busy = { state: "busy", line: "Editing desk.ts", at: t };
    expect(shouldSend(null, { state: "busy", line: "x" }, t)).toBe(true);
    expect(shouldSend(busy, { state: "idle" }, t + 1)).toBe(true);
    expect(shouldSend({ ...busy, state: "idle" }, { state: "idle" }, t + HEARTBEAT_MS * 5)).toBe(false);
    expect(shouldSend({ ...busy, state: "idle" }, { state: "busy", line: "Reading your message" }, t + 1)).toBe(true);
    expect(shouldSend(busy, { state: "busy", line: "Running the tests" }, t + CHANGE_MS - 1)).toBe(false);
    expect(shouldSend(busy, { state: "busy", line: "Running the tests" }, t + CHANGE_MS)).toBe(true);
    expect(shouldSend(busy, { state: "busy", line: "Editing desk.ts" }, t + HEARTBEAT_MS - 1)).toBe(false);
    expect(shouldSend(busy, { state: "busy", line: "Editing desk.ts" }, t + HEARTBEAT_MS)).toBe(true);
  });

  it("knows its own chat id and only sends to HQ over https", () => {
    expect(sessionIdFromEnv({ CLAUDE_CODE_REMOTE_SDK_URL: "https://h/v1/code/sessions/cse_01Mhcz6BtYDPTHBytp9oyjLZ" })).toBe(
      "session_01Mhcz6BtYDPTHBytp9oyjLZ",
    );
    expect(sessionIdFromEnv({})).toBeNull();
    expect(hqBase("https://lifeflowweb.com/")).toBe("https://lifeflowweb.com");
    expect(hqBase("http://lifeflowweb.com")).toBeNull();
    expect(hqBase("http://localhost:3100")).toBe("http://localhost:3100");
    expect(hqBase(undefined)).toBeNull();
  });
});
