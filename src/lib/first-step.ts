/**
 * "Start it with me" (owner, 2026-11-22, the ADHD helps, item 1; docs/backlog/2026-11-22-adhd-six.md): the first move
 * on a piece of work, small enough to begin. Chosen by our code from what the thing is (its kind, then words in its
 * title), never by a model, and never a guess about the work itself: every step is one anyone can do in a minute.
 */

export type StartKind = "assignment" | "exam" | "quiz" | "project" | "reading" | "lab" | "discussion" | "other" | "task";

/** How long the first sitting is: short enough to say yes to. */
export const FIRST_MINUTES = 5;
/** After "Keep going" (no set end, research 2026-11-22), the check-in counts from this many minutes. */
export const KEEP_GOING_MINUTES = 25;

const WRITE = /\b(essay|paper|report|reflection|response|summary|proposal|draft|thesis|letter|blog|write|writing|journal)\b/i;
const READ = /\b(read|reading|chapter|ch\.|article|pages?)\b/i;
const PROBLEMS = /\b(problem set|pset|homework|hw|worksheet|exercises?|problems?|questions?|math|calc)\b/i;
const SLIDES = /\b(presentation|slides?|deck|pitch)\b/i;
const STUDY = /\b(study|review|flashcards?|prep|revise)\b/i;
const POST = /\b(discussion|post|forum|reply)\b/i;
const EMAIL = /\b(email|e-mail|message|text|call)\b/i;
const CLEAN = /\b(clean|laundry|dishes|tidy|room)\b/i;

/** The one small first step for this thing. */
export function firstStep(kind: StartKind | string, title: string): string {
  const t = title.toLowerCase();
  if (kind === "exam" || kind === "quiz" || STUDY.test(t)) return "Open your notes and read the first page.";
  if (kind === "reading" || READ.test(t)) return "Open to the first page and read one paragraph.";
  if (kind === "discussion" || POST.test(t)) return "Open the prompt and write one sentence back.";
  if (SLIDES.test(t)) return "Make the first slide with just a title.";
  if (WRITE.test(t)) return "Open a doc and type the title.";
  if (kind === "lab") return "Open the lab sheet and read the first step.";
  if (PROBLEMS.test(t)) return "Write out the first problem.";
  if (kind === "project") return "Write down the very first thing it needs.";
  if (EMAIL.test(t)) return "Open a new message and write the first line.";
  if (CLEAN.test(t)) return "Pick up five things.";
  return `Do the first ${FIRST_MINUTES} minutes. That's all.`;
}

/** What Today's "Start it" works on, from an agenda key: work you do, never a class, shift or meeting you attend. */
export function startable(key: string): { origin: "assignment" | "task"; id: string } | null {
  const m = /^(assignment|task):([0-9a-f-]{36})$/i.exec(key);
  return m ? { origin: m[1].toLowerCase() as "assignment" | "task", id: m[2] } : null;
}

/** The focus screen's address for a thing. */
export const focusHref = (key: string) => `/focus?item=${encodeURIComponent(key)}`;
