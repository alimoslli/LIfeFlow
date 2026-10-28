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

// ---- Web search (non-streaming requests that use the hosted web_search tool).
// Fixture data on example.com domains so nothing here can be mistaken for real prices.
const WEB = {
  default: {
    text: "Per Example Transit, the airport train runs every 10 minutes, takes 35 minutes and costs $11.45.",
    sources: [{ url: "https://transit.example.com/fares", title: "Fares | Example Transit" }],
  },
};

function webSearchResponse(body) {
  const id = `resp_${n++}`;
  const fmt = body.text?.format;
  const query = typeof body.input === "string" ? body.input : JSON.stringify(body.input);
  let text = WEB.default.text;
  let sources = WEB.default.sources;
  if (fmt?.type === "json_schema" && fixtures[fmt.name]) ({ text, sources } = fixtures[fmt.name](query));
  return {
    id,
    object: "response",
    status: "completed",
    output: [
      {
        type: "web_search_call",
        id: `ws_${id}`,
        status: "completed",
        action: { type: "search", query, sources: sources.map((s) => ({ type: "url", url: s.url })) },
      },
      {
        type: "message",
        id: `msg_${id}`,
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text,
            annotations: sources.map((s) => ({ type: "url_citation", url: s.url, title: s.title, start_index: 0, end_index: Math.min(10, text.length) })),
          },
        ],
      },
    ],
  };
}

// Structured searches the app makes (savings finder, cancel help), keyed by schema name.
const fixtures = {
  // Two sourced cheaper plans, plus one whose price page wasn't cited (the app must drop it).
  savings_options: () => ({
    text: JSON.stringify({
      options: [
        {
          provider: "Example Mobile",
          plan: "Unlimited Basic",
          monthly_price_usd: 30,
          source_url: "https://mobile.example.com/plans",
          details: "Price with autopay; taxes extra.",
        },
        {
          provider: "Sample Wireless",
          plan: "15GB",
          monthly_price_usd: 20,
          source_url: "https://wireless.example.net/15gb",
          details: "12-month promo, then $25.",
        },
        { provider: "Unsourced Co", plan: "Cheap", monthly_price_usd: 5, source_url: "https://not-cited.example.org", details: "" },
      ],
    }),
    sources: [
      { url: "https://mobile.example.com/plans", title: "Plans | Example Mobile" },
      { url: "https://wireless.example.net/15gb", title: "15GB plan | Sample Wireless" },
    ],
  }),
};
globalThis.__lfWebFixtures = fixtures;

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
      const body = JSON.parse(raw);
      if (!body.stream && (body.tools ?? []).some((t) => t.type === "web_search")) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify(webSearchResponse(body)));
      }
      sse(res, respond(body));
    });
  })
  .listen(port, "127.0.0.1", () => console.log(`fake openai on ${port}`));
