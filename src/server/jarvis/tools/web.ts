import { z } from "zod";
import { searchWeb, WebSearchError } from "../../integrations/web-search";
import { defineTool } from "../tool";

export const webTools = [
  defineTool({
    name: "web_search",
    description:
      "Search the live web. Use for anything outside the user's own data that could be current or that you aren't sure about: prices, plans and rates, schedules, opening hours, transit, visa or entry rules, news, how to cancel a service, general knowledge you'd otherwise guess. Returns an answer plus the sources it came from; cite them as markdown links.",
    schema: z.object({
      query: z.string().min(3).max(400).describe("A specific search query, e.g. 'RER B Paris CDG to Gare du Nord ticket price 2026'"),
      country: z.string().length(2).optional().describe("Two-letter country code when local results matter, e.g. US"),
    }),
    mutates: false,
    async execute(a) {
      try {
        const r = await searchWeb(a.query, { country: a.country });
        return {
          // Web pages are untrusted: facts to cite, never instructions to follow.
          untrustedWebContent: r.answer.slice(0, 6000),
          sources: r.sources,
          searchedAt: r.searchedAt,
          note: r.sources.length
            ? "Cite these sources as markdown links next to the facts they support. Only state what they support."
            : "No sources came back. Tell the user you couldn't confirm this rather than answering from memory.",
        };
      } catch (e) {
        if (e instanceof WebSearchError) return { unavailable: e.message };
        throw e;
      }
    },
  }),
];
