import type { HqContentKind, HqContentStatus, HqNetwork, HqRoundSwitches } from "../db/schema";
import type { HqLink, HqRole } from "../db/schema";
import type { EmployeeState } from "./state";

/**
 * The shapes HQ pages read (ADR 0024). Services in services/hq.ts return these; pages and components only render
 * them. Dates are Date objects (server components) and every list has a hard limit.
 */

export type MissionStatus = "todo" | "doing" | "waiting" | "blocked" | "done" | "dropped";
export type MissionPriority = "high" | "normal" | "low";
export type ApprovalKind =
  "deploy" | "v3_merge" | "feature" | "design" | "publish" | "outbound" | "paid" | "subscription" | "destructive" | "security" | "other";
export type ApprovalStatus = "pending" | "approved" | "declined" | "changes";
export type ChatStatus = "working" | "idle" | "blocked" | "archived" | "unknown";

export type Mission = {
  id: string;
  role: HqRole;
  title: string;
  detail: string | null;
  priority: MissionPriority;
  status: MissionStatus;
  progress: string | null;
  blockedReason: string | null;
  result: string | null;
  links: HqLink[];
  sessionId: string | null;
  branch: string | null;
  source: "owner" | "agent" | "import";
  dueOn: string | null; // yyyy-mm-dd
  startedAt: Date | null;
  doneAt: Date | null;
  seenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Approval = {
  id: string;
  role: HqRole;
  missionId: string | null;
  kind: ApprovalKind;
  title: string;
  summary: string;
  links: HqLink[];
  status: ApprovalStatus;
  decisionNote: string | null;
  decidedAt: Date | null;
  source: "owner" | "agent" | "import";
  createdAt: Date;
};

export type Activity = {
  id: string;
  actor: "owner" | "agent" | "system";
  role: HqRole | "founder" | null;
  kind: string;
  text: string;
  missionId: string | null;
  approvalId: string | null;
  sessionId: string | null;
  link: string | null;
  createdAt: Date;
};

export type Chat = {
  id: string; // session id
  role: HqRole | null;
  title: string;
  isPrimary: boolean;
  branch: string | null;
  lastCommit: string | null;
  status: ChatStatus;
  summary: string | null;
  needsAction: string | null;
  lastCheckinAt: Date | null;
  url: string; // chatUrl(id)
};

/** The weekly budget tile. Null numbers mean "not measured yet": never show a made-up value. */
export type Budget = {
  /** The account's whole 7-day usage at the last reading (includes the owner's own chats). */
  weekPct: number | null;
  /** The share used by automated rounds this week (sum of round_end minus round_start). */
  roundsPct: number | null;
  target: number;
  ceiling: number;
  asOf: Date | null;
  resetsAt: Date | null;
};

export type EmployeeCard = {
  role: HqRole;
  title: string;
  tagline: string;
  state: EmployeeState;
  /** One plain line: the reason for the state (blocked reason, current mission, "Resting"). */
  line: string;
  /** When the data behind the state was last updated (latest check-in or mission change), for "as of". */
  asOf: Date | null;
  pendingApprovals: number;
  currentMission: Mission | null;
  primaryChat: Chat | null;
};

export type OfficeSnapshot = {
  now: Date;
  employees: EmployeeCard[];
  founder: { pendingApprovals: number };
  counts: { working: number; done: number; waiting: number; asleep: number; blocked: number; offline: number };
  /** Pending approvals, oldest first (max 20). */
  approvals: Approval[];
  /** Newest first (max 12). */
  activity: Activity[];
  /** This week's board strip: open missions by priority, then this week's done ones (max 8). */
  weekMissions: Mission[];
  doneThisWeek: number;
  budget: Budget;
};

export type EmployeeDetail = {
  card: EmployeeCard;
  jobs: string[];
  chats: Chat[];
  current: Mission[]; // doing, blocked, waiting
  pending: Mission[]; // todo
  done: Mission[]; // newest first, max 20
  approvals: Approval[]; // pending for this role
  decided: Approval[]; // decided, newest first, max 10
  activity: Activity[]; // newest first, max 20
};

export type WeeklySummary = {
  from: Date;
  to: Date;
  done: Mission[];
  started: number;
  blocked: Mission[];
  approvalsDecided: Approval[];
  approvalsPending: number;
  overdue: Mission[];
  dueSoon: Mission[]; // due in the next 7 days, not done
  budget: Budget;
  marketing: MarketingWeek;
  /** Plain lines the HQ Assistant puts at the top, built from the numbers above (no AI). */
  headline: string[];
};

// --- marketing and controls (ADR 0025) -----------------------------------------------------------------------------

export type ContentItem = {
  id: string;
  kind: HqContentKind;
  title: string;
  hook: string | null;
  body: string | null;
  platforms: HqNetwork[];
  status: HqContentStatus;
  scheduledFor: Date | null;
  publishedUrl: string | null;
  externalId: string | null;
  links: HqLink[];
  approvalId: string | null;
  sessionId: string | null;
  source: "owner" | "agent" | "import";
  createdAt: Date;
  updatedAt: Date;
};

/** One network's latest real readings. Empty `latest` means no numbers have arrived for it yet. */
export type NetworkPerformance = {
  network: HqNetwork;
  latest: { metric: string; value: number; takenOn: string; previous: number | null }[];
  asOf: string | null; // yyyy-mm-dd of the newest reading
};

export type MarketingView = {
  now: Date;
  /** Scheduled, approved or waiting items dated in the next 14 days, soonest first (max 30). */
  week: ContentItem[];
  /** Drafts and ideas with no date yet, newest first (max 20). */
  unscheduled: ContentItem[];
  /** Items waiting for the owner's yes, with their publish approval (max 20). */
  waiting: { content: ContentItem; approval: Approval | null }[];
  /** Sourced research findings, newest first (max 20). */
  research: ContentItem[];
  /** Published in the last 30 days, newest first (max 20). */
  published: ContentItem[];
  /** Every network in HQ_NETWORKS, in that order. */
  performance: NetworkPerformance[];
};

export type HqControls = { autonomous: boolean; rounds: HqRoundSwitches; creditBudget: number; updatedAt: Date | null; updatedByEmail: string | null };

export type MarketingWeek = { drafted: number; approved: number; scheduled: number; published: number };
