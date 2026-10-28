import OpenAI from "openai";
import type { Response as OpenAIResponse } from "openai/resources/responses/responses";
import { env } from "../env";

/**
 * Live web search through OpenAI's hosted web_search tool (Responses API).
 *
 * Sources are taken only from what the search itself returned (url_citation
 * annotations and the search call's source list), never from URLs the model
 * writes in its text, so a source shown to the user is one that was actually
 * read. Results are untrusted web content: callers pass them on as data.
 */

export type WebSource = { title: string; url: string };
export type WebAnswer = { answer: string; sources: WebSource[]; searchedAt: string };

export class WebSearchError extends Error {}

export type SearchClient = { client: OpenAI; model: string };

export function webSearchClient(): SearchClient | null {
  const e = env();
  if (!e.OPENAI_API_KEY) return null;
  return {
    client: new OpenAI({ apiKey: e.OPENAI_API_KEY, baseURL: e.OPENAI_BASE_URL, maxRetries: 1, timeout: 60_000 }),
    model: e.OPENAI_SEARCH_MODEL ?? e.OPENAI_MODEL,
  };
}

const httpUrl = (u: unknown): u is string => {
  if (typeof u !== "string") return false;
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:";
  } catch {
    return false;
  }
};

/** Pulls the answer text and the real sources out of a Responses API result. */
export function parseSearchResponse(res: Pick<OpenAIResponse, "output">): { answer: string; sources: WebSource[] } {
  const sources = new Map<string, WebSource>();
  let answer = "";
  for (const item of res.output ?? []) {
    if (item.type === "message") {
      for (const c of item.content) {
        if (c.type !== "output_text") continue;
        answer += c.text;
        for (const a of c.annotations ?? []) {
          if (a.type === "url_citation" && httpUrl(a.url)) sources.set(a.url, { url: a.url, title: (a.title || new URL(a.url).hostname).slice(0, 200) });
        }
      }
    } else if (item.type === "web_search_call") {
      const action = (item as { action?: { sources?: { url?: string; title?: string }[] } }).action;
      for (const s of action?.sources ?? [])
        if (httpUrl(s.url) && !sources.has(s.url)) sources.set(s.url, { url: s.url, title: (s.title || new URL(s.url).hostname).slice(0, 200) });
    }
  }
  return { answer: answer.trim(), sources: [...sources.values()].slice(0, 12) };
}

const BASE_INSTRUCTIONS =
  "Search the live web and answer from what you find. Use only facts you found in sources, and cite them. If you can't find something, say so plainly. Never guess prices, times or links. Today's date is ";

/** Runs one search. With `json`, the answer must be JSON matching the schema (still searched and cited). */
export async function searchWeb(
  query: string,
  opts: { instructions?: string; json?: { name: string; schema: Record<string, unknown> }; search?: SearchClient | null; country?: string } = {},
): Promise<WebAnswer> {
  const search = opts.search === undefined ? webSearchClient() : opts.search;
  if (!search) throw new WebSearchError("Live web search isn't set up on this server yet (OPENAI_API_KEY is missing).");
  const today = new Date().toISOString().slice(0, 10);
  let res;
  try {
    res = await search.client.responses.create({
      model: search.model,
      instructions: `${BASE_INSTRUCTIONS}${today}.${opts.instructions ? ` ${opts.instructions}` : ""}`,
      input: query.slice(0, 2000),
      tools: [{ type: "web_search", ...(opts.country && { user_location: { type: "approximate", country: opts.country } }) }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      store: false,
      ...(opts.json && { text: { format: { type: "json_schema", name: opts.json.name, schema: opts.json.schema, strict: true } } }),
    });
  } catch (e) {
    throw new WebSearchError(e instanceof Error ? `The web search failed: ${e.message.slice(0, 200)}` : "The web search failed.");
  }
  const { answer, sources } = parseSearchResponse(res);
  if (!answer) throw new WebSearchError("The web search returned nothing.");
  return { answer, sources, searchedAt: new Date().toISOString() };
}
