import type { ChatItem, ModelProvider, ModelTurn, ToolCall } from "./types";

/**
 * Deterministic provider for automated tests, injected directly into
 * runJarvisTurn. The app itself only ever uses the OpenAI provider.
 *
 * Protocol: a user message of the form
 *   /tool <name> <json-args>
 * (one per line) makes it call those tools; it then replies with a summary
 * built only from the tool results. Anything else gets a canned reply.
 * Tests can also install a custom responder.
 */
export type ScriptStep = { text?: string; toolCalls?: { name: string; args: unknown }[] };
export type Responder = (ctx: { history: ChatItem[]; step: number; results: { callId: string; output: string }[] }) => ScriptStep;

let customResponder: Responder | null = null;
export function setScriptedResponder(r: Responder | null) {
  customResponder = r;
}

export const defaultResponder: Responder = ({ history, step, results }) => {
  const lastUser = [...history].reverse().find((h) => h.type === "user");
  const text = lastUser?.type === "user" ? lastUser.text : "";
  if (step === 0) {
    const calls = text
      .split("\n")
      .map((l) => l.match(/^\/tool\s+([a-z_]+)\s*(.*)$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => ({ name: m[1], args: m[2] ? JSON.parse(m[2]) : {} }));
    if (calls.length) return { toolCalls: calls };
    return { text: `Scripted test reply to: ${text.slice(0, 200)}` };
  }
  const lines = results.map((r) => {
    const parsed = JSON.parse(r.output) as { ok: boolean; error?: string; data?: unknown };
    return parsed.ok ? `OK: ${JSON.stringify(parsed.data).slice(0, 400)}` : `FAILED: ${parsed.error ?? JSON.stringify(parsed.data)}`;
  });
  return { text: lines.join("\n") };
};

let counter = 0;

export class ScriptedProvider implements ModelProvider {
  readonly name = "scripted";
  constructor(private responder?: Responder) {}

  startTurn({ history }: { history: ChatItem[] }): ModelTurn {
    let step = 0;
    const responder = this.responder ?? customResponder ?? defaultResponder;
    return {
      async *step(toolResults) {
        const out = responder({ history, step: step++, results: toolResults ?? [] });
        const toolCalls: ToolCall[] = (out.toolCalls ?? []).map((c) => ({ callId: `call_${++counter}`, name: c.name, arguments: JSON.stringify(c.args) }));
        if (out.text) {
          for (const chunk of out.text.match(/[\s\S]{1,40}/g) ?? []) yield { type: "text_delta", delta: chunk };
        }
        yield { type: "step_done", text: out.text ?? "", toolCalls };
      },
    };
  }
}
