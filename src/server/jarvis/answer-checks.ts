import { formatIn } from "@/lib/dates";

/**
 * Checks that an answer fits the clock, the facts it was given and the owner's standard, with no model involved.
 *
 * Where they come from: on 2026-11-25 eight readers went through 396 answers of the skyling's own-model teacher and found two
 * big families no rule had caught, "wrong about the clock" (a class at 11 AM spoken of as still ahead at 9:20 PM, a check-in
 * saved for a time already gone) and "specifics from nowhere" (an invented price sent to the affordability check, "you said
 * you study best in the afternoons" when nobody said it). On 2026-11-26 the owner graded real answers and gave his own
 * standard: a quick message gets a quick answer, stop after a promise is saved, never ask what a look would answer, never
 * "try again in a bit", no "items". The same checks guard the training examples (scripts/gpu/chat-eval/reality_checks.py on
 * claude/skill-router-pilot); the cases in tests/unit/answer-checks.test.ts are the same cases, so the two stay in step.
 *
 * Nothing here reads or stores anything: text in, short notes out. A note is written for the model (it says what to do
 * instead); a code is what gets counted on the run.
 */
export const CHECK_CODES = [
  "past_save",
  "invented_amount",
  "past_time",
  "said_from_nowhere",
  "comes_back",
  "claims_change",
  "internal_id",
  "too_long",
  "after_promise",
  "too_many_questions",
  "asks_lookup",
  "works_later",
  "vague_word",
] as const;
export type CheckCode = (typeof CHECK_CODES)[number];
export type CheckNote = { code: CheckCode; note: string };

export type CheckContext = {
  now: Date;
  tz: string;
  /** What the person sent this turn. */
  asked: string;
  /** Everything a fact may come from: the prompt's own context (their memories and settings), what they wrote, every tool result. */
  sources: string[];
  /** Tools already called in this turn, in order. */
  used: string[];
  /** The soft ceiling for a quick message, in words (60; a person who asked for detailed answers gets more). */
  quickLimit?: number;
  /** This turn carries a photo or a file: the answer reads it back, so length is not judged. */
  hasFiles?: boolean;
};

export type CallToCheck = { name: string; arguments: string };

const CLOCK = /\b(\d{1,2})(?::(\d\d))? ?([AP])\.?M\.?\b/gi;
const WRITES = /^(create|make|save|update|set|add|log|resolve|delete|remove|draft|send|contribute|shift|schedule|complete|mark|import|cancel|forget|undo)_/;
const OTHER_DAY =
  /\b(tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|next week|last night|last week|weekend|every|each|usually|weekdays|weeknights|nightly|daily|that (day|morning|afternoon|evening|night)|the day (before|after)|(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]* \d{1,2})\b/i;
const PAST_TALK =
  /\b(was|were|had|ended|finished|wrapped|got off|already|earlier|since|ago|missed|passed|overdue|done|did|went|came in|landed|posted|charged|spent|started at|began|worked|studied|slept|woke|took|paid|bought|submitted|handed in|turned in|would have|could have|should have)\b/i;
const AHEAD_TALK =
  /\b(want me to|should i|shall i|i can|i could|i'?ll|let'?s|you have|you'?ve got|you'?d miss|you would miss|you'?ll miss|before your|until|starts? at|is at|coming up|still|later today|tonight|this (afternoon|evening)|free (from|at|until|till)|block|book|move|open (from|at|until)|head to|get to|make it to|in time for)\b/i;
const OFFER = /\b(want me to|should i|shall i|i can|i could|i'?ll|let'?s|block|book|put|set up|schedule)\b/i;
const TODAY_TALK = /\b(today|tonight|right now|this (morning|afternoon|evening)|later today)\b/i;
const SAID = /\byou (?:said|told me|mentioned|did say)(?: that)?\s+(?!that\b|this\b|so\b|it\b|me\b)([^.,;:?!\n]{6,80})/gi;
const COME_BACK = /\bI(?:'ll| will)\s+(?:also\s+|then\s+)?(remind|nudge|ping|check in|check back|follow up|circle back|look again|look it up again)\b/i;
const UNDONE =
  /\b(taken back|undone|took (it|that) back|it'?s gone|i'?ve removed|i removed|removed (it|that)|deleted (it|that)|i'?ve cancell?ed|cancell?ed (it|that)|moved (it|that) to)\b/i;
const STOP = new Set(
  "that this with from your you're have will would could about them they their there what when where which while were been being into just than then also very much more most some such only over after before best like really always never usually need want going".split(
    " ",
  ),
);
/** A record's own id (a memory's, a to-do's) written out to the person. */
const INTERNAL_ID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

// the owner's own standard, from his grades of 2026-11-26
const ASKS_ALL =
  /\b(what('?s| is| are) (due|on|left)|everything|all (my|of)|list|what can (wait|slide|i (drop|push|skip))|push off|has to give|my (bills|subscriptions|week|schedule|day)|this week|plan my|map out|where is my money|forgetting|worst)\b/i;
const DEPTH =
  /\b(explain|how (do|does|can|should|would|to)\b|walk me through|help me (understand|with|write|study|prepare|figure|plan|decide|get)|break\w* (it|this|that|the|my|down)|steps?|plan\b|tips|advice|why\b|tell me (more|about)|in detail|detail|options|compare|difference|teach|quiz me|study guide|outline|draft|summar|what (should|do) i (know|need)|where do i (even )?(start|begin)|what (does|is) [a-z ]{3,40} mean)\b/i;
const LATER =
  /\b(try|check|search|look)( it| that| this)?( up)?( again)? (in a (bit|few|minute|moment|while)|later|soon|tomorrow)\b|\bretry\b|\bwhen (it|search|that|the search|web search)('?s| is| comes) back\b|\bonce (it|search|the search)('?s| is) (back|working|up)\b/i;
const VAGUE = /\bitems?\b/i;
const COULD_LOOK =
  /\b(which|what) (class|course|exam|test|midterm|quiz|assignment|project|paper)\b[^.?!]*\?|\bwhen(('?s| is) (the|your|it)|\s+is it)\b[^.?!]{0,40}\?/i;
const LOOKS = new Set([
  "get_daily_briefing",
  "list_assignments",
  "list_tasks",
  "get_agenda",
  "life_load",
  "tonight",
  "list_courses",
  "find_free_time",
  "list_projects",
  "school_dates",
  "recall_memories",
]);
/** A reply to someone in real distress (INSTRUCTIONS, "When someone is struggling") is never judged or sent back. */
const CRISIS = /\b988\b|\b911\b|emergency (number|services)/i;

export const QUICK_WORDS = 60;

/**
 * No fixed limit (owner, 2026-11-26: "there shouldn't be a strict cap to messages as some do require a big response for
 * help, same for the breakdown and steps"). Only a quick message has a soft ceiling: one that asks for no explanation, no
 * plan, no breakdown and not for all of something. null = as long as it needs.
 */
export function wordLimit(asked: string, quick = QUICK_WORDS): number | null {
  if (ASKS_ALL.test(asked) || DEPTH.test(asked)) return null;
  // they wrote a lot themselves (a pasted list, a whole week told at once): the answer reports on it
  if (words(asked) > 60) return null;
  return quick;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function saidClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** The person's own date and minutes since midnight. */
function clockOf(ctx: CheckContext): { today: string; minute: number } {
  const [h, m] = formatIn(ctx.now, ctx.tz, "H:mm").split(":").map(Number);
  return { today: formatIn(ctx.now, ctx.tz, "yyyy-MM-dd"), minute: h * 60 + m };
}

function knownNumbers(sources: string[]): Set<number> {
  const seen = new Set<number>();
  for (const t of sources) {
    for (const x of t.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) {
      const n = Number(x.replace(/,/g, ""));
      if (Number.isFinite(n)) seen.add(Math.round(n * 100) / 100);
    }
    for (const c of t.matchAll(/[Cc]ents"?:\s*(-?\d+)/g)) seen.add(Math.round(Math.abs(Number(c[1]))) / 100);
  }
  return seen;
}

function argsOf(call: CallToCheck): unknown {
  try {
    return JSON.parse(call.arguments || "{}");
  } catch {
    return {};
  }
}

const SAVES_AT_A_TIME = new Set(["create_events", "create_tasks", "make_promise", "update_event", "update_task"]);

/** Something saved for a day or a time that is already gone (a check-in "tonight at 9 PM" saved at 11:30 PM). */
function pastSaves(calls: CallToCheck[], ctx: CheckContext): string[] {
  const { today, minute } = clockOf(ctx);
  const out: string[] = [];
  const walk = (v: unknown, tool: string) => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, tool));
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const day = ["date", "dueDate", "due", "checkInDate", "startDate"].map((k) => o[k]).find((x): x is string => typeof x === "string") ?? "";
    const k = day.match(/^(\d{4}-\d\d-\d\d)(?:[ T](\d\d):(\d\d))?/);
    if (k) {
      let at: number | null = k[2] ? Number(k[2]) * 60 + Number(k[3]) : null;
      // a block still running is not past: its end decides
      for (const key of ["endTime", "time", "dueTime", "checkInTime", "startTime"]) {
        const t = String(o[key] ?? "").match(/^(\d\d):(\d\d)/);
        if (t && at == null) at = Number(t[1]) * 60 + Number(t[2]);
      }
      const name = String(o.title ?? o.text ?? "that").slice(0, 60);
      if (k[1] < today && (tool === "create_events" || tool === "make_promise")) out.push(`"${name}" is saved for ${k[1]}, a day that is already over`);
      else if (k[1] === today && at != null && at <= minute) out.push(`"${name}" is saved for ${saidClock(at)} today, and it is already ${saidClock(minute)}`);
    }
    for (const x of Object.values(o)) walk(x, tool);
  };
  for (const c of calls) if (SAVES_AT_A_TIME.has(c.name)) walk(argsOf(c), c.name);
  return out;
}

/** A money figure sent to a tool that the person never gave and no result shows (an invented $1,200 rent). */
function inventedAmounts(calls: CallToCheck[], ctx: CheckContext): string[] {
  const known = knownNumbers([ctx.asked, ...ctx.sources]);
  const out: string[] = [];
  const walk = (v: unknown, tool: string) => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, tool));
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (/amount|price|cost/i.test(k) && typeof x === "number" && x) {
        const val = Math.round((Math.abs(x) / (/cents/i.test(k) ? 100 : 1)) * 100) / 100;
        if (!known.has(val)) out.push(`${tool} was called with ${x} for "${k}"`);
      } else walk(x, tool);
    }
  };
  for (const c of calls) walk(argsOf(c), c.name);
  return out;
}

/**
 * A clock time already gone today, spoken of as still ahead ("you've got a study block at 2:15 PM" at 6:45 PM). A sentence
 * is read clause by clause, so "the quiz is due at 11:59 PM, and you've got a study block at 2:15 PM" is caught: the first
 * clause is still ahead, the second is not.
 */
function pastTimes(text: string, ctx: CheckContext): string[] {
  const { minute } = clockOf(ctx);
  const out: string[] = [];
  // "Tomorrow you have BIO at 10 AM. Want me to block 8 to 9:30 AM?": the second sentence is still about tomorrow
  let otherDay = false;
  for (const s of text.split(/(?<=[.?!])\s+|\n+/)) {
    if (OTHER_DAY.test(s)) {
      otherDay = true;
      continue;
    }
    if (TODAY_TALK.test(s)) otherDay = false;
    else if (otherDay) continue;
    let hit = false;
    if (AHEAD_TALK.test(s)) {
      for (const clause of s.split(/,\s+|;\s+|:\s+|\s+(?:and|then|but|so)\s+/)) {
        const times = [...clause.matchAll(CLOCK)].map((k) => ((Number(k[1]) % 12) + (k[3].toUpperCase() === "P" ? 12 : 0)) * 60 + Number(k[2] ?? 0));
        // a range counts by its end (a block still running is not past), and so does anything that began in the last 45 minutes
        if (times.length && Math.max(...times) < minute - 45 && !PAST_TALK.test(clause)) {
          out.push(`"${clause.trim().slice(0, 110)}": ${saidClock(Math.max(...times))} is already past, it is ${saidClock(minute)} now`);
          hit = true;
          break;
        }
      }
    }
    if (hit) continue;
    if (OFFER.test(s) && !PAST_TALK.test(s)) {
      const hasTime = [...s.matchAll(CLOCK)].length > 0;
      const said = `"${s.trim().slice(0, 110)}"`;
      if (/\bthis afternoon\b/i.test(s) && minute >= 18 * 60) out.push(`${said}: the afternoon is over, it is ${saidClock(minute)} now`);
      else if (/\b(this evening|tonight)\b/i.test(s) && minute >= 23 * 60 && !hasTime)
        out.push(`${said}: it is ${saidClock(minute)}, there is no evening left to plan`);
      else if (/\bthis morning\b/i.test(s) && minute >= 12 * 60) out.push(`${said}: the morning is over, it is ${saidClock(minute)} now`);
    }
  }
  return out;
}

/** "You said you study best in the afternoons" when nothing the person wrote and nothing saved about them says so. */
function saidFromNowhere(text: string, ctx: CheckContext): string[] {
  const theirs = [ctx.asked, ...ctx.sources].join(" ").toLowerCase();
  const out: string[] = [];
  for (const k of text.matchAll(SAID)) {
    const ws = (k[1].toLowerCase().match(/[a-z']{4,}/g) ?? []).filter((w) => !STOP.has(w));
    if (ws.length >= 2 && ws.filter((w) => theirs.includes(w.slice(0, 5))).length / ws.length < 0.5) out.push(k[0].trim().slice(0, 110));
  }
  return out;
}

/**
 * Before a step's tool calls run: a save for a time already gone, or a made-up amount. The call is not run; the note goes
 * back to the model as that call's result, and it picks a time still ahead, uses the real figure, or asks.
 */
export function checkToolCalls(ctx: CheckContext, calls: CallToCheck[]): CheckNote[] {
  const notes: CheckNote[] = [];
  const late = pastSaves(calls, ctx);
  if (late.length)
    notes.push({ code: "past_save", note: `${late[0]}. Nothing can be saved in the past. Pick a time that is still ahead (say which day), or ask them.` });
  const madeUp = inventedAmounts(calls, ctx);
  if (madeUp.length)
    notes.push({
      code: "invented_amount",
      note: `${madeUp[0]}, a figure they never gave and no result shows. Never invent a price or an amount: use the figure from their message or a result, or ask them for it in one short line.`,
    });
  return notes;
}

/** Which of a step's calls a note is about: the ones that carry the late time or the made-up figure. */
export function flaggedCalls(ctx: CheckContext, calls: CallToCheck[]): Map<CallToCheck, CheckNote> {
  const out = new Map<CallToCheck, CheckNote>();
  for (const c of calls) {
    const [first] = checkToolCalls(ctx, [c]);
    if (first) out.set(c, first);
  }
  return out;
}

/** The final answer of a turn: empty when nothing is wrong. */
export function checkAnswer(ctx: CheckContext, answer: string): CheckNote[] {
  const text = answer.trim();
  if (!text || CRISIS.test(text)) return [];
  const notes: CheckNote[] = [];
  const late = pastTimes(text, ctx);
  if (late.length)
    notes.push({
      code: "past_time",
      note: `${late[0]}. Do not speak of something already past as still ahead and do not offer time that is gone. Say what is still ahead, and name the day when you mean another day.`,
    });
  const nowhere = saidFromNowhere(text, ctx);
  if (nowhere.length)
    notes.push({
      code: "said_from_nowhere",
      note: `You wrote "${nowhere[0]}", but nothing they wrote and nothing saved about them says that. Take it out. Only repeat back what is in their messages, their saved memories or a result.`,
    });
  const wrote = ctx.used.some((n) => WRITES.test(n));
  if (COME_BACK.test(text) && !wrote)
    notes.push({
      code: "comes_back",
      note: "You said you will come back to them, but you saved nothing in this message, and you cannot come back on your own. Either save it now (a to-do with a reminder, or make_promise for something they gave their word on) or offer to, and promise nothing.",
    });
  if (UNDONE.test(text) && !wrote)
    notes.push({
      code: "claims_change",
      note: "You wrote that something was changed, removed or taken back, but you called no tool in this message, so nothing changed. Make the change with the tool first, or say plainly that there was nothing of yours to undo.",
    });
  if (INTERNAL_ID.test(text)) notes.push({ code: "internal_id", note: "You wrote out a record's internal id. Name the thing in words; never show an id." });

  // the owner's standard
  const count = words(text);
  const limit = ctx.hasFiles ? null : wordLimit(ctx.asked, ctx.quickLimit);
  if (limit && count > limit)
    notes.push({
      code: "too_long",
      note: `They sent a quick message and your answer is ${count} words. People hate reading. Write it again in about ${Math.round(limit * 0.7)} words: the one thing that matters with its real time or figure, one next step, then stop. (Had they asked for an explanation, a plan or a list, length would be fine.)`,
    });
  if (ctx.used.includes("make_promise") && (count > 30 || text.includes("?")))
    notes.push({
      code: "after_promise",
      note: "They gave their word and you saved it. Confirm in one short line with when you will check in, and stop: nothing about what is due and no offer.",
    });
  if ((text.match(/\?/g) ?? []).length > 2)
    notes.push({
      code: "too_many_questions",
      note: "You asked more than two questions. People hate typing. One open question at most and one yes-or-no offer at most.",
    });
  if (COULD_LOOK.test(text) && !ctx.used.some((u) => LOOKS.has(u)))
    notes.push({
      code: "asks_lookup",
      note: "You asked them something their records can answer. Look first (get_daily_briefing or list_assignments): the nearest exam or deadline is usually the one they mean, so name it. Ask only if the records cannot tell you.",
    });
  if (LATER.test(text))
    notes.push({
      code: "works_later",
      note: "Do not say it will work later and do not offer to retry: it works here or it does not. Say plainly that you cannot do that here, and give the next best thing now.",
    });
  if (VAGUE.test(text) && !VAGUE.test(ctx.asked))
    notes.push({ code: "vague_word", note: '"Items" says nothing. Name what they are: the quizzes, the lab report, the three things due Sunday.' });
  return notes;
}

/** What the model is told when its answer is sent back once. Its first answer was never shown to the person. */
export function fixNote(notes: CheckNote[]): string {
  return `Your answer was checked before the person saw it and was not shown to them. Fix this and answer again, as if for the first time (do not mention this check or apologise for it):\n${notes
    .slice(0, 3)
    .map((n) => `- ${n.note}`)
    .join("\n")}`;
}

export type AnswerChecksMode = "off" | "watch" | "fix";
