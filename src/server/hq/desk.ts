import { chatUrl } from "./team";

/**
 * The CEO's desk (ADR 0029): each task file opens a Claude Code chat for that task. HQ only builds links: it never starts,
 * reads or drives a chat, and never uses the owner's claude.ai login.
 *
 * First click (no chat yet): a new chat in the LifeFlow repo with the first prompt typed in; the owner presses send. That
 * prompt starts by telling HQ which chat took the task (`mission update <id> --status doing` sends this chat's id).
 * Later clicks: the task's own chat. A link can't type into an existing chat, so the page copies the next prompt first.
 */
export const DESK_REPO = "alimoslli/LIfeFlow";
export const CLAUDE_NEW_CHAT = "https://claude.ai/code/new";

export type DeskTask = { id: string; title: string; deskPrompt: string | null; sessionId: string | null };
export type DeskLink = { kind: "new" | "open"; href: string; prompt: string };

const hq = (args: string) => `npx tsx scripts/hq.ts mission update ${args}`;

/** The first prompt: claim the task in HQ, then the task itself. */
export function firstPrompt(t: DeskTask): string {
  return [
    `Desk task: ${t.title}`,
    `First tell HQ this chat has it (run npm ci first if node_modules is missing): ${hq(`${t.id} --status doing`)}`,
    "",
    (t.deskPrompt ?? "").trim(),
    "",
    `When it's finished: ${hq(`${t.id} --status done --result "<one line on what changed>"`)}. If you're stuck on me: ${hq(`${t.id} --status blocked --blocked "<what you need>"`)}.`,
  ].join("\n");
}

/** The prompt copied when the task's chat already exists. */
export function nextPrompt(t: DeskTask): string {
  return `Back on "${t.title}". In two lines: where it stands and what's next. Then do the next step. When it's finished: ${hq(`${t.id} --status done --result "<one line>"`)}.`;
}

/** Where a click on the file goes, and the prompt it carries (typed in for a new chat, copied for an existing one). */
export function deskLink(t: DeskTask): DeskLink {
  if (t.sessionId) return { kind: "open", href: chatUrl(t.sessionId), prompt: nextPrompt(t) };
  const prompt = firstPrompt(t);
  return { kind: "new", href: `${CLAUDE_NEW_CHAT}?q=${encodeURIComponent(prompt)}&repo=${encodeURIComponent(DESK_REPO)}`, prompt };
}
