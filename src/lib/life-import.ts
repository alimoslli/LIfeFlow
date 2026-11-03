/**
 * Sorts text pasted from another AI assistant into what LifeFlow keeps: facts about the user
 * (memories), life milestones and goals. Pure, so the page can show it for review before
 * anything is saved; the server validates again when it saves.
 */

export type ImportFactCategory = "fact" | "preference" | "routine";
export type ImportMilestoneCategory = "school" | "work" | "money" | "health" | "travel" | "family" | "personal";

export type ImportItem =
  | { kind: "fact"; text: string; category: ImportFactCategory }
  | { kind: "milestone"; text: string; when: string | null; category: ImportMilestoneCategory }
  | { kind: "goal"; text: string };

/** The prompt the user runs in their other AI assistant. Its headings are what parseLifeImport reads. */
export const LIFE_IMPORT_PROMPT = `Tell me everything you know about me that would help a personal assistant. Use exactly these headings, one short line per item:

ABOUT ME: school, major, job, the city I live in, important people, interests.
PREFERENCES: how I like to study, work, plan and be talked to.
ROUTINES: things I do regularly, with days and times.
MILESTONES: things I've done or achieved, each starting with the year, like "2022 - Graduated from high school".
GOALS: things I'm working toward.

Leave out passwords, account numbers, health details and anything you're not sure about.`;

type Section = "fact" | "preference" | "routine" | "milestone" | "goal";

const HEADINGS: [RegExp, Section][] = [
  [/^(about me|about|facts?|background|who i am|personal info(rmation)?)$/, "fact"],
  [/^(preferences?|likes?( and dislikes)?|how i like.*)$/, "preference"],
  [/^(routines?|habits?|schedule|weekly routine)$/, "routine"],
  [/^(milestones?|life milestones?|achievements?|accomplishments?|things i'?ve done)$/, "milestone"],
  [/^(goals?|current goals?|working toward|plans?)$/, "goal"],
];

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

/** "2022 - Graduated", "May 2022: Graduated", "Graduated (2022)", "Graduated in 2022". */
export function splitWhen(line: string): { text: string; when: string | null } {
  let m = line.match(new RegExp(`^((?:${MONTH}\\.?\\s+)?(?:19|20)\\d{2})\\s*[-:–—,]\\s*(.+)$`, "i"));
  if (m) return { text: m[2].trim(), when: m[1].trim() };
  m = line.match(new RegExp(`^(.+?)\\s*\\(((?:${MONTH}\\.?\\s+)?(?:19|20)\\d{2})\\)\\.?$`, "i"));
  if (m) return { text: m[1].trim(), when: m[2].trim() };
  m = line.match(new RegExp(`^(.+?)\\s+in\\s+((?:${MONTH}\\.?\\s+)?(?:19|20)\\d{2})\\.?$`, "i"));
  if (m) return { text: m[1].trim(), when: m[2].trim() };
  return { text: line, when: null };
}

const MILESTONE_WORDS: [RegExp, ImportMilestoneCategory][] = [
  [/graduat|diploma|degree|dean'?s list|honor roll|scholarship|admitted|accepted (in|to)|enrolled|gpa|school|college|universit|class of/i, "school"],
  [/\bjob\b|hired|promot|intern|started (at|work)|employee|raise|business|career|work/i, "work"],
  [/saved|paid off|debt|bought|\$\d|credit score|invest|emergency fund/i, "money"],
  [/marathon|\b(5|10)k\b|half marathon|gym|lost \d+|weight|sober|quit smoking|ran\b|race|fitness/i, "health"],
  [/trip|travel|visited|vacation|abroad|moved (to|out)|flew|road trip/i, "travel"],
  [/married|engaged|baby|born|family|wedding|sister|brother|son|daughter|mom|dad|parent/i, "family"],
];
export const milestoneCategory = (text: string): ImportMilestoneCategory => MILESTONE_WORDS.find(([re]) => re.test(text))?.[1] ?? "personal";

const clean = (l: string) =>
  l
    .replace(/\*\*|__/g, "")
    .replace(/^\s*(?:[-*•▪◦]|\d+[.)])\s*/, "")
    .trim();

export function parseLifeImport(text: string): ImportItem[] {
  const out: ImportItem[] = [];
  let section: Section | null = null;
  let sawHeading = false;
  for (const raw of text.split(/\r?\n/)) {
    let line = clean(raw).replace(/^#+\s*/, "");
    if (!line) continue;
    // "ABOUT ME:" or "## Milestones" or "MILESTONES: 2022 - Graduated" (heading and first item on one line).
    const h = line.match(/^([A-Za-z' ]{3,40}?)\s*:\s*(.*)$/);
    const asHeading = HEADINGS.find(([re]) => re.test((h ? h[1] : line).toLowerCase().trim()));
    if (asHeading) {
      section = asHeading[1];
      sawHeading = true;
      line = h ? clean(h[2]) : "";
      if (!line) continue;
    }
    // Long answers are split into sentences, but only for facts; milestones and goals stay one per line.
    const pieces = (section ?? "fact") === "fact" ? line.split(/(?<=[.!?])\s+(?=[A-Z])/) : [line];
    for (const p of pieces) {
      const t = p.trim();
      if (t.length < 3 || t.length > 300) continue;
      const s = section ?? "fact";
      if (s === "milestone") {
        const { text: title, when } = splitWhen(t);
        out.push({ kind: "milestone", text: title.slice(0, 200), when, category: milestoneCategory(title) });
      } else if (s === "goal") out.push({ kind: "goal", text: t.slice(0, 200) });
      else out.push({ kind: "fact", text: t, category: s });
    }
  }
  // Without our headings everything is a fact, as before.
  return sawHeading ? out.slice(0, 120) : out.slice(0, 60);
}
