import { errorKindOf } from "./metrics";

/**
 * What HQ's error feed gets when a turn fails in the catch-all branch of the agent loop (the user only reads "Something went
 * wrong"). Content-free on purpose: the error's class name, its message with every quoted value and anything after a query's
 * parameters cut away (a database or schema error can repeat the user's own words), and where in our code it was thrown.
 * Never the user's text or a tool's arguments.
 */
export function turnFailureReport(e: unknown, kind?: string): { route: string; message: string } {
  const k = kind ?? errorKindOf(e, false);
  const name = e instanceof Error ? e.constructor?.name || e.name || "Error" : typeof e;
  const raw = e instanceof Error ? e.message : "";
  const msg = raw
    .split(/\bparams?:/i)[0]
    .split("\n")[0]
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "?")
    .trim()
    .slice(0, 160);
  const frame = firstFrameInSrc(e);
  return { route: `jarvis.turn.${k}`, message: `${name}: ${msg || "no message"}${frame ? ` at ${frame}` : ""}` };
}

/** "src/server/jarvis/tools/x.ts:12:5" for the first stack line in our own code; a built chunk's file name when the stack has no source paths. */
export function firstFrameInSrc(e: unknown): string | null {
  const stack = e instanceof Error ? e.stack : undefined;
  if (!stack) return null;
  const lines = stack.split("\n").slice(1);
  for (const line of lines) {
    const m = line.match(/[\\/](src[\\/][^\s):]+?:\d+(?::\d+)?)/);
    if (m && !/node_modules/.test(line)) return m[1].replace(/\\/g, "/");
  }
  for (const line of lines) {
    const m = line.match(/[\\/](\.next[\\/]server[\\/][^\s):]+?:\d+(?::\d+)?)/);
    if (m) return m[1].replace(/\\/g, "/");
  }
  return null;
}
