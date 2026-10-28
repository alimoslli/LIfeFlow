// A tiny stand-in for the OpenAI Responses API used only by end-to-end tests.
// It speaks the real streaming wire format, so the app's actual OpenAI SDK
// code path is exercised. Behaviour is deterministic:
//   - a user message containing lines "/tool <name> <json>" -> function calls
//   - after tool outputs -> a text reply summarising them
//   - anything else -> a short canned reply
import http from "node:http";

const port = Number(process.env.FAKE_OPENAI_PORT ?? 4010);
let n = 0;

function sse(res, events) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const e of events) res.write(`event: ${e.type}\ndata: ${JSON.stringify({ sequence_number: n++, ...e })}\n\n`);
  res.end();
}

function respond(body) {
  const input = body.input ?? [];
  const last = input[input.length - 1];
  const id = `resp_${n}`;
  const message = (text) => ({
    type: "message",
    id: `msg_${n}`,
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text, annotations: [] }],
  });
  const done = (output) => ({ type: "response.completed", response: { id, object: "response", status: "completed", output } });
  const textEvents = (text) => [
    ...text
      .match(/[\s\S]{1,24}/g)
      .map((delta) => ({ type: "response.output_text.delta", delta, item_id: `msg_${n}`, output_index: 0, content_index: 0, logprobs: [] })),
    done([message(text)]),
  ];
  if (last?.type === "function_call_output") {
    const outputs = input.filter((i) => i.type === "function_call_output").slice(-5);
    const lines = outputs.map((o) => {
      const r = JSON.parse(o.output);
      return r.ok ? `Done: ${JSON.stringify(r.data).slice(0, 300)}` : `Problem: ${r.error ?? JSON.stringify(r.data)}`;
    });
    return textEvents(lines.join("\n\n"));
  }
  const text = (last?.content ?? [])
    .filter((c) => c.type === "input_text")
    .map((c) => c.text)
    .join("\n");
  const calls = text
    .split("\n")
    .map((l) => l.match(/^\/tool\s+([a-z_]+)\s*(.*)$/))
    .filter(Boolean);
  if (calls.length) {
    return [
      done(
        calls.map((m, i) => ({
          type: "function_call",
          id: `fc_${n}_${i}`,
          call_id: `call_${n}_${i}`,
          name: m[1],
          arguments: m[2] || "{}",
          status: "completed",
        })),
      ),
    ];
  }
  return textEvents(`Hello from the test model. You said: ${text.slice(0, 120)}`);
}

http
  .createServer((req, res) => {
    if (req.method === "GET") return res.end("ok");
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (req.headers.authorization !== "Bearer sk-e2e-test") {
        res.writeHead(401, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "bad key" } }));
      }
      if (req.url?.includes("/realtime/client_secrets")) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ value: "ek_e2e_test", expires_at: Math.floor(Date.now() / 1000) + 120, session: JSON.parse(raw).session }));
      }
      sse(res, respond(JSON.parse(raw)));
    });
  })
  .listen(port, "127.0.0.1", () => console.log(`fake openai on ${port}`));
