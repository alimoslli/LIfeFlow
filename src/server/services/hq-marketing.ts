import type { Admin } from "../auth/admin";
import type { Database } from "../db/client";
import type { HqContentKind, HqContentStatus, HqLink, HqNetwork, HqRoundSwitches } from "../db/schema";
import type { ContentItem, HqControls, MarketingView, MarketingWeek } from "../hq/types";
import type { HqActor } from "./hq";

/**
 * LifeFlow HQ marketing and controls (ADR 0025). Content, research and real metrics arrive from the owner's chats
 * (the weekly marketing round, through /api/hq/report); the owner approves, drops and controls the rounds here.
 * Nothing is published from HQ: an approved post is put into Metricool "for review" by the next marketing round.
 *
 * CONTRACT STUB: signatures are fixed; bodies are filled in by the backend build step.
 */

export type ContentInput = {
  kind: HqContentKind;
  title: string;
  hook?: string | null;
  body?: string | null;
  platforms?: HqNetwork[];
  status?: Extract<HqContentStatus, "idea" | "draft">;
  scheduledFor?: string | null; // ISO
  links?: HqLink[];
  sessionId?: string | null;
  /** Ask the owner: creates a "publish" approval for this item and sets it to "waiting". */
  ask?: boolean;
};
export type ContentPatch = Partial<{
  title: string;
  hook: string | null;
  body: string | null;
  platforms: HqNetwork[];
  status: HqContentStatus;
  scheduledFor: string | null;
  publishedUrl: string | null;
  externalId: string | null;
  links: HqLink[];
}>;
export type MetricInput = { takenOn: string; network: HqNetwork; metric: string; value: number; contentId?: string | null };
export type ControlsPatch = Partial<{ autonomous: boolean; rounds: Partial<HqRoundSwitches>; creditBudget: number }>;

const notBuilt = (): never => {
  throw new Error("HQ marketing service not built yet");
};

export async function marketingView(db: Database, now?: Date): Promise<MarketingView> {
  return notBuilt();
}
/** Max 200, newest first. */
export async function listContent(db: Database, filter?: { status?: HqContentStatus[]; kind?: HqContentKind[] }): Promise<ContentItem[]> {
  return notBuilt();
}
export async function getContent(db: Database, id: string): Promise<ContentItem | null> {
  return notBuilt();
}
export async function createContent(db: Database, actor: HqActor, input: ContentInput): Promise<ContentItem> {
  return notBuilt();
}
export async function updateContent(db: Database, actor: HqActor, id: string, patch: ContentPatch): Promise<ContentItem> {
  return notBuilt();
}
/** Upserts real readings (max 200 per call). Returns how many were saved. */
export async function recordMetrics(db: Database, actor: HqActor, rows: MetricInput[]): Promise<{ saved: number }> {
  return notBuilt();
}
export async function getControls(db: Database): Promise<HqControls> {
  return notBuilt();
}
/** Owner only (called after requireAdmin). Writes hq_activity and admin_actions. */
export async function saveControls(db: Database, admin: Admin, patch: ControlsPatch): Promise<HqControls> {
  return notBuilt();
}
export async function marketingWeek(db: Database, from: Date, to: Date): Promise<MarketingWeek> {
  return notBuilt();
}
