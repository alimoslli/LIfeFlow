import OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { parseSearchResponse, searchWeb, WebSearchError } from "@/server/integrations/web-search";

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("web search", () => {
  it("takes sources only from citations and the search's own source list, never from URLs in the text", () => {
    const r = parseSearchResponse({
      output: [
        {
          type: "web_search_call",
          id: "ws1",
          status: "completed",
          action: { type: "search", query: "q", sources: [{ type: "url", url: "https://b.example.com/page" }] },
        },
        {
          type: "message",
          id: "m1",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: "Plan A is $25/mo (see https://made-up.example.org).",
              annotations: [
                { type: "url_citation", url: "https://a.example.com/plans", title: "Plans", start_index: 0, end_index: 6 },
                { type: "url_citation", url: "javascript:alert(1)", title: "bad", start_index: 0, end_index: 1 },
              ],
            },
          ],
        },
      ],
    } as never);
    expect(r.answer).toBe("Plan A is $25/mo (see https://made-up.example.org).");
    expect(r.sources.map((s) => s.url)).toEqual(["https://b.example.com/page", "https://a.example.com/plans"]);
  });

  it("calls the Responses API with the hosted web_search tool and store:false", async () => {
    let sent: Record<string, unknown> = {};
    const client = new OpenAI({
      apiKey: "sk-test",
      baseURL: "http://fake.local/v1",
      fetch: (async (_url: string, init?: RequestInit) => {
        sent = JSON.parse(String(init?.body));
        return reply({
          id: "r1",
          object: "response",
          status: "completed",
          output: [
            {
              type: "message",
              id: "m",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: "Found it.",
                  annotations: [{ type: "url_citation", url: "https://x.example.com", title: "X", start_index: 0, end_index: 5 }],
                },
              ],
            },
          ],
        });
      }) as typeof fetch,
    });
    const r = await searchWeb("cheapest unlimited phone plan", { search: { client, model: "gpt-test" }, country: "US" });
    expect(r.sources).toEqual([{ url: "https://x.example.com", title: "X" }]);
    expect(sent).toMatchObject({
      model: "gpt-test",
      store: false,
      tool_choice: "required",
      tools: [{ type: "web_search", user_location: { type: "approximate", country: "US" } }],
    });
  });

  it("says plainly when it isn't set up or fails", async () => {
    await expect(searchWeb("x", { search: null })).rejects.toThrow(WebSearchError);
    const client = new OpenAI({
      apiKey: "sk",
      baseURL: "http://fake.local/v1",
      maxRetries: 0,
      fetch: (async () => reply({ error: { message: "boom" } }, 500)) as typeof fetch,
    });
    await expect(searchWeb("x", { search: { client, model: "m" } })).rejects.toThrow(/web search failed/);
  });
});
