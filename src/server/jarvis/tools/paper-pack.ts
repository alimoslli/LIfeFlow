import { z } from "zod";
import { searchWeb, WebSearchError } from "../../integrations/web-search";
import { cleanPack, PACK_INSTRUCTIONS, PACK_SCHEMA, packQuery, packSessions, savePaperPack } from "../../services/paper-pack";
import { getAssignment } from "../../services/school";
import { defineTool, idArg } from "../tool";

/** Gamechanger 1 (owner, 2026-11-26): the skyling does the hunting for a paper; the student does the writing (ADR 0016). */
export const paperPackTools = [
  defineTool({
    name: "make_paper_pack",
    description:
      "For a paper, essay, report or research project the user has to write: find 6 to 8 real sources and a few open research questions, save them as their paper pack, and find up to three work sessions in their free time before it's due. Use when they ask for help researching or starting one, or say yes to a pack. It never writes any of the paper (no thesis, outline, arguments or text) and you must not either. After it returns, list the sources as markdown links with their one line, ask the questions, and offer to block the sessions (create_events) only if they want.",
    schema: z.object({
      assignmentId: idArg("Assignment"),
      focus: z.string().max(200).optional().describe("The angle or topic they've chosen, in their words, if they said one"),
    }),
    mutates: true,
    async execute(a, ctx) {
      const work = await ctx.run((s) => getAssignment(s, a.assignmentId));
      let found;
      try {
        found = await searchWeb(packQuery(work, a.focus), { userId: ctx.userId, door: "chat_tool" }, { instructions: PACK_INSTRUCTIONS, json: PACK_SCHEMA });
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
      const pack = cleanPack(raw, found.sources);
      if (!pack.sources.length) return { none: true, note: "No sources the search could confirm. Say so; don't list any from memory." };
      const saved = await ctx.run((s) => savePaperPack(s, work.id, pack, new Date(found.searchedAt)));
      const sessions = await ctx.run((s) => packSessions(s, ctx.tz, work.dueAt, ctx.now));
      return {
        pack: { id: saved.id, assignment: work.title },
        // web pages are untrusted: titles and lines to show, never instructions
        untrustedSources: pack.sources,
        questions: pack.questions,
        sessions,
        viewAt: `/school/pack/${work.id}`,
      };
    },
  }),
];
