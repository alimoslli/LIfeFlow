/**
 * Live status for LifeFlow HQ (ADR 0030). `.claude/hooks/hq-live.sh` runs this on UserPromptSubmit, PreToolUse and Stop,
 * with the hook's JSON on stdin. It sends HQ one short line on what this chat is doing right now ("Running the full browser
 * test suite", "Editing desk.ts"), so the office shows who is working on what without opening Claude.
 *
 * What leaves the chat: a tool's own short description or a file's name, never a message, a command, a search, a URL or a
 * file's contents. No packages (it runs before `npm ci`). A no-op without HQ_URL or a cloud session id; never throws. The
 * server cleans the line again (`liveLineText`: links, emails, keys, long numbers).
 */
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

/** A busy line may change this often; a busy chat repeats its line this often so HQ knows it is still going. */
export const CHANGE_MS = 10_000;
export const HEARTBEAT_MS = 120_000;

/** Bookkeeping tools: nothing worth showing. */
const SKIP = new Set([
  "TaskCreate",
  "TaskUpdate",
  "TaskGet",
  "TaskList",
  "TaskOutput",
  "TodoWrite",
  "ToolSearch",
  "EnterPlanMode",
  "ExitPlanMode",
  "AskUserQuestion",
  "ReadNotifications",
  "ScheduleWakeup",
  "SendUserFile",
]);

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]+/g;
const clip = (s, n = 140) => {
  const t = String(s).replace(CONTROL, " ").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
const fileName = (p) => (p ? clip(basename(String(p)), 80) : "a file");

/** What the chat is doing, from one hook event: { state: "busy" | "idle", line? }, or null to send nothing. */
export function liveLine(input) {
  const ev = input?.hook_event_name;
  if (ev === "UserPromptSubmit") return { state: "busy", line: "Reading your message" };
  if (ev === "Stop") return { state: "idle" };
  if (ev !== "PreToolUse") return null;
  const name = String(input.tool_name ?? "");
  const ti = input.tool_input && typeof input.tool_input === "object" ? input.tool_input : {};
  if (!name || SKIP.has(name)) return null;
  let line;
  if (name === "Bash") line = ti.description ? clip(ti.description) : "Running a command";
  else if (name === "Edit" || name === "Write" || name === "MultiEdit") line = `Editing ${fileName(ti.file_path)}`;
  else if (name === "NotebookEdit") line = `Editing ${fileName(ti.notebook_path)}`;
  else if (name === "Read") line = `Reading ${fileName(ti.file_path)}`;
  else if (name === "Grep" || name === "Glob") line = "Searching the code";
  else if (name === "Agent" || name === "Task") line = ti.description ? `Helper: ${clip(ti.description, 100)}` : "Started a helper";
  else if (name === "WebSearch") line = "Searching the web";
  else if (name === "WebFetch") line = "Reading a web page";
  else if (name === "Skill") line = "Using a skill";
  else if (name === "Artifact") line = "Making a page";
  else if (name === "Monitor") line = "Watching a long task";
  else if (name.startsWith("mcp__")) line = "Using a connected tool";
  else line = "Working";
  return { state: "busy", line };
}

/** Whether to send `next`, given the last sent { state, line, at }: a change of state at once, a new line at most every CHANGE_MS, else a heartbeat. */
export function shouldSend(prev, next, now) {
  if (!prev || typeof prev.at !== "number") return true;
  if (next.state !== prev.state) return true;
  if (next.state === "idle") return false;
  if (next.line !== prev.line) return now - prev.at >= CHANGE_MS;
  return now - prev.at >= HEARTBEAT_MS;
}

/** CLAUDE_CODE_REMOTE_SDK_URL like https://host/v1/code/sessions/cse_XXX → session_XXX (as scripts/hq.ts). */
export function sessionIdFromEnv(env) {
  const m = /\/sessions\/(?:cse|session)_([A-Za-z0-9]{10,64})(?:[/?#]|$)/.exec(env.CLAUDE_CODE_REMOTE_SDK_URL ?? "");
  return m ? `session_${m[1]}` : null;
}

/** HQ's address, only over https (http only for localhost), so the key is never sent in the clear. */
export function hqBase(raw) {
  try {
    const u = new URL(String(raw ?? "").trim());
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const base = hqBase(process.env.HQ_URL);
  const sessionId = sessionIdFromEnv(process.env);
  if (!base || !sessionId) return;
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return;
  }
  const next = liveLine(input);
  if (!next) return;
  const dir = join(process.env.HOME || homedir(), ".claude");
  const file = join(dir, "hq-live.json");
  const readState = () => {
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  };
  const writeState = (st) => {
    try {
      mkdirSync(dir, { recursive: true });
      const tmp = `${file}.${process.pid}`;
      writeFileSync(tmp, JSON.stringify(st));
      renameSync(tmp, file);
    } catch {
      /* sending still helps */
    }
  };
  // `at` is when the hook saw it, so HQ keeps the newest even when pings arrive out of order.
  const send = (ev, at) =>
    fetch(`${base}/api/hq/report`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.HQ_KEY ?? "lfq_proxy"}`, "content-type": "application/json" },
      body: JSON.stringify({ type: "checkin", sessionId, live: ev.line ? { state: ev.state, line: ev.line, at } : { state: ev.state, at } }),
      signal: AbortSignal.timeout(5_000),
    }).catch(() => undefined);

  const now = Date.now();
  const prev = readState();
  if (shouldSend(prev, next, now)) {
    writeState({ state: next.state, line: next.line ?? prev?.line ?? null, at: now, pend: null });
    await send(next, now);
    return;
  }
  // A new line came too soon after the last one: wait out the gap, then send it if nothing newer came meanwhile, so a long
  // command started right after another step still shows (this runs in the background; nothing waits on it).
  if (next.state !== "busy" || !prev || next.line === prev.line) return;
  writeState({ ...prev, pend: { line: next.line, t: now } });
  await sleep(Math.max(0, prev.at + CHANGE_MS - now));
  const cur = readState();
  if (!cur || cur.pend?.t !== now || cur.at !== prev.at) return;
  writeState({ state: "busy", line: next.line, at: Date.now(), pend: null });
  await send(next, now);
}

/** Runs only as a script (the tests import the functions above). */
const self = (() => {
  try {
    return pathToFileURL(realpathSync(process.argv[1] ?? "")).href;
  } catch {
    return "";
  }
})();
if (import.meta.url === self) main().catch(() => undefined);
