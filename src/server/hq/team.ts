import type { HqRole } from "../db/schema";

/**
 * LifeFlow HQ's five employees (ADR 0024). They are the face of the owner's real Claude Code chats and of plain app
 * logic: none of them is an AI model of its own, and nothing here runs a model. The founder (the owner) has a room
 * too but is not an employee.
 */
export type Employee = {
  role: HqRole;
  /** What the owner sees on the door. */
  title: string;
  /** Three or four words on what they do. */
  tagline: string;
  /** The jobs from the owner's brief, shown on the employee page. */
  jobs: string[];
  /** What they look like doing their job, used for the "Working" line. */
  workingLine: string;
  /** Their main chat, by title, so the page can explain an empty mapping. */
  chatTitle: string | null;
};

export const EMPLOYEES: readonly Employee[] = [
  {
    role: "developer",
    title: "Developer",
    tagline: "Build · Fix · Protect",
    jobs: ["Keeps the current app running", "Fixes bugs", "Improves speed", "Debugs connections", "Runs the tests", "Reviews code quality"],
    workingLine: "Coding at the desk",
    chatTitle: "LF Main",
  },
  {
    role: "designer",
    title: "Designer / V3",
    tagline: "Timeline · Concepts · UX",
    jobs: ["Builds LifeFlow V3", "Explores the timeline", "Refines the experience", "Works on new concepts", "Keeps V3 on its own branch"],
    workingLine: "Sketching on the tablet",
    chatTitle: "LF V3",
  },
  {
    role: "researcher",
    title: "Researcher",
    tagline: "Research · Audits · Tests",
    jobs: [
      "Researches competitors",
      "Looks into new tech and connections",
      "Reads real complaints",
      "Audits the app",
      "Runs the automated tests",
      "Keeps a backlog with sources",
    ],
    workingLine: "Reading with the magnifier",
    chatTitle: "LF V3 — Agents",
  },
  {
    role: "marketing",
    title: "Marketing",
    tagline: "Content · Growth · Community",
    jobs: ["Marketing plan", "Social posts and videos", "Trends and competitor campaigns", "Scheduling and analytics", "Comments, messages and feedback"],
    workingLine: "Filming at the ring light",
    chatTitle: "LF Marketing",
  },
  {
    role: "assistant",
    title: "HQ Assistant",
    tagline: "Tasks · Approvals · Summaries",
    jobs: ["Keeps missions organised", "Tells you what needs your yes", "Watches deadlines", "Writes the weekly summary"],
    workingLine: "Sorting the inbox",
    chatTitle: null,
  },
];

export const employee = (role: HqRole): Employee => EMPLOYEES.find((e) => e.role === role)!;

export const isHqRole = (v: unknown): v is HqRole => typeof v === "string" && EMPLOYEES.some((e) => e.role === v);

/** Weekly usage plan (owner's brief, section 9): aim for 35–40% of the week for automated work, never above 50%. */
export const USAGE_PLAN = { targetLow: 35, target: 40, ceiling: 50, split: { engineering: 25, marketing: 15, reserve: 10 } } as const;

/** Opens a real Claude Code session (the supported way to continue a chat: claude.ai or the Claude app). */
export const chatUrl = (sessionId: string) => `https://claude.ai/code/${encodeURIComponent(sessionId)}`;
