/**
 * LifeFlow HQ command line (ADR 0024): how the owner's Claude Code chats and night rounds report to HQ.
 * Deterministic, no AI. Env: HQ_URL (the app's base URL) and HQ_KEY (sent as a Bearer key; never printed).
 * Usage: npx tsx scripts/hq.ts checkin|mission|approval|activity|inbox|import ...
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Parsed = { positional: string[]; flags: Record<string, string[]> };

/** `--name value`, `--name=value` and bare `--flag` (value "true"). Repeated flags collect. */
export function parseArgs(argv: string[]): Parsed {
  const positional: string[] = [];
  const flags: Record<string, string[]> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    let name: string;
    let value: string;
    if (eq > 0) {
      name = a.slice(2, eq);
      value = a.slice(eq + 1);
    } else {
      name = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        value = next;
        i++;
      } else value = "true";
    }
    (flags[name] ??= []).push(value);
  }
  return { positional, flags };
}

const one = (p: Parsed, n: string) => p.flags[n]?.[p.flags[n].length - 1];

/** "label=https://…" or a bare url. */
export function parseLink(s: string): { label: string; url: string } {
  const i = s.indexOf("=");
  if (i > 0 && !/^https?:/i.test(s.slice(0, i)) && !s.startsWith("/")) return { label: s.slice(0, i).trim(), url: s.slice(i + 1).trim() };
  return { label: s.length > 40 ? s.slice(0, 40) : s, url: s };
}

/** CLAUDE_CODE_REMOTE_SDK_URL like https://host/v1/code/sessions/cse_XXX → session_XXX. Null when absent. */
export function sessionIdFromEnv(env: Record<string, string | undefined>): string | null {
  const m = /\/sessions\/(?:cse|session)_([A-Za-z0-9]{10,64})(?:[/?#]|$)/.exec(env.CLAUDE_CODE_REMOTE_SDK_URL ?? "");
  return m ? `session_${m[1]}` : null;
}

export type UsageFile = { fiveHourPct?: number; sevenDayPct?: number; sevenDayResetsAt?: string };

/** The status line's saved readings. Null when missing, malformed or older than 6 hours. */
export function parseUsageFile(raw: string, nowMs: number, maxAgeMs = 6 * 3_600_000): UsageFile | null {
  let j: { saved_at?: unknown; five_hour?: { used_percentage?: unknown }; seven_day?: { used_percentage?: unknown; resets_at?: unknown } };
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }
  const savedAt = typeof j.saved_at === "number" ? j.saved_at * (j.saved_at < 1e12 ? 1000 : 1) : null;
  if (savedAt === null || nowMs - savedAt > maxAgeMs || savedAt - nowMs > 3_600_000) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const out: UsageFile = {};
  const five = num(j.five_hour?.used_percentage);
  const seven = num(j.seven_day?.used_percentage);
  const resets = num(j.seven_day?.resets_at);
  if (five !== undefined) out.fiveHourPct = five;
  if (seven !== undefined) out.sevenDayPct = seven;
  if (resets !== undefined) out.sevenDayResetsAt = new Date(resets * (resets < 1e12 ? 1000 : 1)).toISOString();
  return Object.keys(out).length ? out : null;
}

/** Turns parsed args into the request body for a command. Throws Error with a one-line message on bad input. */
export function buildRequest(
  cmd: string,
  p: Parsed,
  extra: { sessionId?: string | null; branch?: string | null; commit?: string | null; usage?: UsageFile | null } = {},
) {
  const need = (n: string) => {
    const v = one(p, n);
    if (!v || v === "true") throw new Error(`Missing --${n}`);
    return v;
  };
  const links = (p.flags.link ?? []).map(parseLink);
  switch (cmd) {
    case "checkin": {
      const phase = one(p, "phase");
      if (phase && !["round_start", "round_end"].includes(phase)) throw new Error("--phase must be round_start or round_end");
      const status = one(p, "status");
      if (status && !["working", "idle", "blocked"].includes(status)) throw new Error("--status must be working, idle or blocked");
      if (!extra.sessionId) throw new Error("No chat id");
      return {
        method: "POST" as const,
        path: "/api/hq/report",
        body: {
          type: "checkin",
          sessionId: extra.sessionId,
          ...(one(p, "title") ? { title: one(p, "title") } : {}),
          ...(extra.branch ? { branch: extra.branch } : {}),
          ...(extra.commit ? { commit: extra.commit } : {}),
          ...(status ? { status } : {}),
          ...(one(p, "summary") ? { summary: one(p, "summary") } : {}),
          ...(one(p, "needs") ? { needsAction: one(p, "needs") } : {}),
          ...(extra.usage ? { usage: { ...extra.usage, ...(phase ? { phase } : {}) } } : {}),
        },
      };
    }
    case "mission add":
      return {
        method: "POST" as const,
        path: "/api/hq/report",
        body: {
          type: "mission",
          role: need("role"),
          title: need("title"),
          ...(one(p, "detail") ? { detail: one(p, "detail") } : {}),
          ...(one(p, "priority") ? { priority: one(p, "priority") } : {}),
          ...(one(p, "due") ? { dueOn: one(p, "due") } : {}),
          ...(links.length ? { links } : {}),
        },
      };
    case "mission update": {
      const id = p.positional[2];
      if (!id) throw new Error("Usage: mission update <id> [--status S] ...");
      return {
        method: "POST" as const,
        path: "/api/hq/report",
        body: {
          type: "mission",
          id,
          ...(one(p, "status") ? { status: one(p, "status") } : {}),
          ...(one(p, "progress") ? { progress: one(p, "progress") } : {}),
          ...(one(p, "result") ? { result: one(p, "result") } : {}),
          ...(one(p, "blocked") ? { blockedReason: one(p, "blocked") } : {}),
          ...(one(p, "branch") ? { branch: one(p, "branch") } : {}),
          ...(links.length ? { links } : {}),
        },
      };
    }
    case "approval":
      return {
        method: "POST" as const,
        path: "/api/hq/report",
        body: {
          type: "approval",
          role: need("role"),
          kind: need("kind"),
          title: need("title"),
          summary: need("summary"),
          ...(links.length ? { links } : {}),
          ...(one(p, "mission") ? { missionId: one(p, "mission") } : {}),
        },
      };
    case "activity":
      return {
        method: "POST" as const,
        path: "/api/hq/report",
        body: {
          type: "activity",
          role: need("role"),
          text: need("text"),
          ...(one(p, "link") ? { link: one(p, "link") } : {}),
          ...(extra.sessionId ? { sessionId: extra.sessionId } : {}),
        },
      };
    case "inbox": {
      const q = new URLSearchParams();
      if (one(p, "role")) q.set("role", one(p, "role")!);
      if (one(p, "since")) q.set("since", one(p, "since")!);
      return { method: "GET" as const, path: `/api/hq/inbox${q.size ? `?${q}` : ""}`, body: undefined };
    }
    default:
      throw new Error(`Unknown command "${cmd}". Try checkin, mission add|update, approval, activity, inbox, import.`);
  }
}

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }).trim() || null;
  } catch {
    return null;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const p = parseArgs(argv);
  const [a, b] = p.positional;
  const cmd = a === "mission" ? `mission ${b ?? ""}`.trim() : a;
  const quiet = !!p.flags.quiet;
  const base = process.env.HQ_URL?.trim().replace(/\/+$/, "");
  if (!base) {
    if (cmd === "checkin") return;
    console.error("HQ_URL is not set.");
    process.exit(1);
  }
  try {
    const sessionId = sessionIdFromEnv(process.env);
    let req: { method: "GET" | "POST"; path: string; body: unknown };
    if (cmd === "import") {
      const file = p.positional[1];
      if (!file) throw new Error("Usage: import <file.json>");
      req = { method: "POST", path: "/api/hq/report", body: { type: "import", seed: JSON.parse(readFileSync(file, "utf8")) } };
    } else if (cmd === "checkin") {
      if (!sessionId) return;
      let usage: UsageFile | null = null;
      try {
        const f = join(process.env.HOME ?? homedir(), ".claude", "hq-usage.json");
        statSync(f);
        usage = parseUsageFile(readFileSync(f, "utf8"), Date.now());
      } catch {
        usage = null;
      }
      req = buildRequest(cmd, p, { sessionId, branch: git(["rev-parse", "--abbrev-ref", "HEAD"]), commit: git(["rev-parse", "--short", "HEAD"]), usage });
    } else {
      req = buildRequest(cmd, p, { sessionId });
    }
    const res = await fetch(`${base}${req.path}`, {
      method: req.method,
      headers: { authorization: `Bearer ${process.env.HQ_KEY ?? "lfq_proxy"}`, ...(req.body ? { "content-type": "application/json" } : {}) },
      body: req.body ? JSON.stringify(req.body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (!res.ok) {
      if (!quiet) console.error(`HQ said ${res.status}: ${text.slice(0, 200)}`);
      process.exit(quiet ? 0 : 1);
    }
    if (!quiet) console.log(text);
  } catch (e) {
    if (!quiet) console.error(e instanceof Error ? e.message : "HQ request failed");
    process.exit(quiet ? 0 : 1);
  }
}

if (process.argv[1]?.endsWith("hq.ts")) void main();
