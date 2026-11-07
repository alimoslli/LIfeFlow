import type { HqContentKind, HqContentStatus, HqDelegations, HqNetwork, HqRoundSwitches } from "../db/schema";
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
  /** The decision card (ADR 0028). `card` is null on an old request, which shows as "being rewritten". */
  card: DecisionCardFields | null;
  threadId: string | null;
  version: number;
  changedSinceNote: string | null;
  supersededAt: Date | null;
  /** The mission that builds an approved ask (set when the Chief of Staff links it). */
  buildMissionId: string | null;
};

export type ApprovalEffort = "small" | "medium" | "large";
export type DecisionCardFields = {
  why: string;
  changes: string[];
  onYes: string;
  onNo: string;
  effort: ApprovalEffort;
  risk: string;
  recommendation: string;
  previews: { fileId: string; label: string | null }[];
};

/** Where an approved card is, taken from its linked mission (never stored twice). */
export type LifecycleStage = "approved" | "built" | "look" | "live";
export type Lifecycle = {
  stage: LifecycleStage;
  /** The date each step happened; null when HQ has no record of it. */
  dates: Record<LifecycleStage, Date | null>;
  /** Why the build mission was dropped, when it was; the card shows "Stopped: ...". */
  stopped: string | null;
  mission: { id: string; title: string; status: MissionStatus; blockedReason: string | null; result: string | null; links: HqLink[] } | null;
};

/** One ask over time: every version, the owner's notes between them, and where it is now. */
export type DecisionThread = {
  threadId: string;
  role: HqRole;
  versions: Approval[];
  /** The newest version. */
  latest: Approval;
  state: "waiting" | "revising" | "approved" | "declined";
  lifecycle: Lifecycle | null;
};

export type SinceLine = { text: string; at: Date; href: string | null; commitUrl: string | null; role: HqRole | null };
export type SinceLooked = {
  since: Date;
  fixed: SinceLine[];
  found: SinceLine[];
  changed: SinceLine[];
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
  /** The Chief of Staff's latest brief, or null before the first one. */
  brief: Brief | null;
  /** The Chief of Staff's delegated decisions (activity kind "decision"), newest first (max 5). */
  decisions: Activity[];
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
  /** Only for the Chief of Staff: its briefs, newest first (max 10). */
  briefs?: Brief[];
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
  /** Approved or scheduled posts that aren't in `week` (no date, a past date, or more than 14 days out), soonest first (max 20). */
  queued: ContentItem[];
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

export type HqControls = {
  autonomous: boolean;
  rounds: HqRoundSwitches;
  creditBudget: number;
  delegations: HqDelegations;
  updatedAt: Date | null;
  updatedByEmail: string | null;
};

/** The Chief of Staff's latest brief to the CEO. */
export type Brief = { id: string; body: string; needsYou: number; sessionId: string | null; createdAt: Date };

/** An app error group as the admin page shows it: already scrubbed of personal details (services/error-reports.ts). */
export type ErrorGroup = {
  fingerprint: string;
  source: "server" | "client";
  route: string;
  message: string;
  count: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

export type MarketingWeek = { drafted: number; approved: number; scheduled: number; published: number };
