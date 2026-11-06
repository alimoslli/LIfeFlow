import type { HqRole } from "../db/schema";

/**
 * LifeFlow HQ's seven employees (ADR 0024, 0026): the Chief of Staff and six departments. They are the face of the owner's real
 * Claude Code chats: none of them is an AI model of its own, and nothing here runs a model. The founder (the owner) has a room
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
  /**
   * Whether this department has its own Claude Code chat. QA and Customer Success don't: the Chief of Staff starts
   * them inside its rounds, so "no chat" is normal and never means offline (ADR 0026).
   */
  ownChat: boolean;
};

export const EMPLOYEES: readonly Employee[] = [
  {
    role: "assistant",
    title: "Chief of Staff",
    tagline: "Runs the team · Reports to you",
    jobs: [
      "Runs every scheduled round and decides the order of work",
      "Hands work between departments",
      "Makes the decisions you have delegated, and logs them",
      "Brings you one short brief per round",
      "Tells you what needs your yes and what to do next",
    ],
    workingLine: "Running the team",
    chatTitle: "LF Chief of Staff",
    ownChat: true,
  },
  {
    role: "developer",
    title: "Engineering",
    tagline: "Fixes · Tests · Reliability",
    jobs: ["Keeps the current app running", "Fixes bugs", "Improves speed and reliability", "Debugs connections and integrations", "Runs the tests"],
    workingLine: "Coding at the desk",
    chatTitle: "LF Main",
    ownChat: true,
  },
  {
    role: "designer",
    title: "Product & Design",
    tagline: "V3 · Prototypes · UX",
    jobs: ["Builds LifeFlow V3 on its own branch", "Draws prototypes as pictures", "Writes UX proposals for your yes", "Refines the experience"],
    workingLine: "Sketching on the tablet",
    chatTitle: "LF V3",
    ownChat: true,
  },
  {
    role: "researcher",
    title: "Research & Insights",
    tagline: "Competitors · Needs · Situations",
    jobs: ["Researches competitors", "Reads real complaints and needs", "Looks into new tech and connections", "Grows the situation library", "Keeps a backlog with sources"],
    workingLine: "Reading with the magnifier",
    chatTitle: "LF V3 — Agents",
    ownChat: true,
  },
  {
    role: "marketing",
    title: "Marketing & Growth",
    tagline: "Content · Social · Analytics",
    jobs: ["Marketing plan", "Concepts, scripts and drafts", "Schedules approved posts for your review", "Reads the real numbers", "Comments, messages and feedback"],
    workingLine: "Filming at the ring light",
    chatTitle: "LF Marketing",
    ownChat: true,
  },
  {
    role: "qa",
    title: "Quality & Security",
    tagline: "Audits · Reviews · Tests",
    jobs: ["Audits the app on phone and web", "Runs the end-to-end tests", "Reviews money, security and data changes", "Hands fixes to Engineering"],
    workingLine: "Testing every screen",
    chatTitle: null,
    ownChat: false,
  },
  {
    role: "support",
    title: "Customer Success",
    tagline: "Errors · Patterns · Fixes",
    jobs: ["Reads the app's error reports", "Spots what keeps breaking for people", "Turns errors into fixes for Engineering", "Never reads anyone's private content"],
    workingLine: "Reading the error feed",
    chatTitle: null,
    ownChat: false,
  },
];

export const employee = (role: HqRole): Employee => EMPLOYEES.find((e) => e.role === role)!;

export const isHqRole = (v: unknown): v is HqRole => typeof v === "string" && EMPLOYEES.some((e) => e.role === v);

/** Weekly usage plan (owner's brief, section 9): aim for 35–40% of the week for automated work, never above 50%. */
export const USAGE_PLAN = { targetLow: 35, target: 40, ceiling: 50, split: { engineering: 25, marketing: 15, reserve: 10 } } as const;

/** Opens a real Claude Code session (the supported way to continue a chat: claude.ai or the Claude app). */
export const chatUrl = (sessionId: string) => `https://claude.ai/code/${encodeURIComponent(sessionId)}`;
