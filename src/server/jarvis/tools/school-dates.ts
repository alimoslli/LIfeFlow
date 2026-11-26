import { z } from "zod";
import { searchWeb, WebSearchError } from "../../integrations/web-search";
import { cleanDates, DATES_INSTRUCTIONS, DATES_SCHEMA } from "../../services/school-dates";
import { defineTool } from "../tool";

/** Gamechanger 6 (owner, 2026-11-26): the term's admin dates, found and cited; saved only after they pick them. */
export const schoolDateTools = [
  defineTool({
    name: "find_school_dates",
    description:
      "Find the official upcoming admin dates for the user's school (registration, add/drop, tuition, financial aid, scholarships) on the web, each with its source. Use when they ask about these dates, or once a term when they say yes to it. Show them as a short list with the source links and ask which to save; save only the ones they pick, as to-dos with create_tasks. Never add a date that isn't in the result.",
    schema: z.object({ school: z.string().min(2).max(120).describe("The school's name as they say it, e.g. 'Valencia College'") }),
    mutates: false,
    async execute(a, ctx) {
      let found;
      try {
        found = await searchWeb(
          `Official upcoming academic calendar and financial aid deadlines for ${a.school}`,
          { userId: ctx.userId, door: "chat_tool" },
          {
            instructions: DATES_INSTRUCTIONS,
            json: DATES_SCHEMA,
            country: "US",
          },
        );
      } catch (e) {
        if (e instanceof WebSearchError) return { unavailable: e.message };
        throw e;
      }
      let raw: unknown = null;
      try {
        raw = JSON.parse(found.answer);
      } catch {
        raw = null;
      }
      const dates = cleanDates(raw, found.sources, ctx.today);
      return dates.length
        ? { school: a.school, untrustedDates: dates, note: "Each date is from its source page. Ask which to save; never save one they didn't pick." }
        : { none: true, note: "No dates the search could confirm. Say so and point them to their school's calendar; never guess one." };
    },
  }),
];
