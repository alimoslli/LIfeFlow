import type { JarvisModule } from "../db/schema";
import type { ChatItem } from "./providers/types";
import type { SkillFile } from "./skills";
import { groupOf, TOOL_GROUPS, type ToolGroup } from "./tool-groups";

/**
 * Which tool groups a request needs: the page it came from, the skills it routed to, words in the message,
 * and whatever this chat used recently (so "ok, book it" still has the calendar). Core is always on.
 * Attachments get everything: reading a syllabus or a receipt can touch any area.
 */

const MODULE_GROUPS: Partial<Record<JarvisModule, ToolGroup[]>> = {
  home: ["calendar"],
  calendar: ["calendar"],
  tasks: ["calendar"],
  finances: ["money", "savings"],
  wealth: ["savings", "money"],
  school: ["school", "calendar"],
  work: ["work", "calendar"],
  notes: ["notes"],
};

const WORDS: [ToolGroup, RegExp][] = [
  [
    "money",
    /\$\s?\d|\bmoney|spen[dt]|budget|\bbank|account|balance|transaction|charge|\bbills?\b|subscri|afford|\brent\b|\bpaid\b|\bcosts?\b|price|\bcard\b|\bcash\b|income|refund|venmo|zelle|paypal|categor|purchase|\bbuy|\bbroke\b|\bowe|groceries|netflix|spotify/,
  ],
  ["savings", /\bsav(e|es|ed|ing|ings)\b|\bgoals?\b|\bdebt|\bloans?\b|invest|emergency fund|paycheck|stocks?\b|crypto|\broth\b|401k|retire|credit score/],
  [
    "school",
    /\bclass|course|assignment|homework|\bhw\b|\bexams?\b|midterm|\bfinals?\b|\bquiz|\btests?\b|\bgrades?\b|\bgpa\b|canvas|syllabus|professor|\bprof\b|lecture|\bstudy|studying|essay|\blabs?\b|\bdue\b|semester|school|college|tutor/,
  ],
  // Plain dates ("Friday", "this weekend") don't count: the briefing already covers a day. These are about the schedule itself.
  [
    "calendar",
    /schedul|calendar|\bevents?\b|free time|\bbusy|meeting|appointment|\bbook\b|\bplan\b|when can|\d\s?(am|pm)\b|hardest|busiest|heaviest|my week|my day|\bfind (me )?(time|\d+ hours?)|block (time|off)|\bclash|conflict/,
  ],
  ["work", /\bwork(ing|ed)?\b|\bshifts?\b|\bjobs?\b|\bboss\b|hours (do|am) i|paycheck|pay rate|hourly|overtime|manager|clock(ed)? (in|out)|\btips\b|employer/],
  ["notes", /\bnotes?\b|wrote down|\bjot/],
  ["email", /e-?mail|gmail|inbox|\bmail\b|google calendar/],
  ["health", /\bsleep|\bsteps\b|workout|exercise|health|heart rate|\bweight\b|calories|\bgym\b/],
  ["habits", /\bhabits?\b|streak|daily routine/],
  ["projects", /\bprojects?\b/],
  ["memory", /\bforget\b|memor|what do you (know|remember)|know about me/],
];

/** A change, not a lookup: with money in play, the editing tools come too. */
const EDIT =
  /\b(add|edit|change|fix|delete|remove|update|categori[sz]e|recategori[sz]e|mark|set|track|move|rename|split|undo|wrong|cancel|sync|connect|link)\b/;

export function selectToolGroups(i: { text: string; module?: string | null; skills: SkillFile[]; history: ChatItem[] }): ToolGroup[] {
  const last = [...i.history].reverse().find((h) => h.type === "user");
  if (last?.type === "user" && (last.images?.length || last.files?.length)) return [...TOOL_GROUPS];

  const want = new Set<ToolGroup>(["core"]);
  for (const g of MODULE_GROUPS[i.module as JarvisModule] ?? []) want.add(g);
  for (const s of i.skills) for (const t of s.tools) want.add(groupOf(t) ?? "core");
  const text = i.text.toLowerCase();
  for (const [g, re] of WORDS) if (re.test(text)) want.add(g);
  if (want.has("money") && EDIT.test(text)) want.add("money_edit");
  // Tools this chat already used, and groups it loaded: follow-ups ("ok, book it") keep them, and every
  // earlier tool call in the history still has its tool on the list.
  for (const h of i.history) {
    if (h.type !== "tool_call") continue;
    want.add(groupOf(h.name) ?? "core");
    if (h.name === "load_tools") {
      try {
        for (const g of (JSON.parse(h.arguments) as { groups?: string[] }).groups ?? [])
          if ((TOOL_GROUPS as readonly string[]).includes(g)) want.add(g as ToolGroup);
      } catch {}
    }
  }
  // A plain "hi" or "what can you do" still gets the schedule, the most common next question.
  if (want.size === 1) want.add("calendar");
  return TOOL_GROUPS.filter((g) => want.has(g));
}
