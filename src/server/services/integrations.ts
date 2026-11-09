import { and, desc, eq, isNull } from "drizzle-orm";
import { courses, financialAccounts, integrations, syncJobs, workShifts, type IntegrationProvider } from "../db/schema";
import { series } from "../db/series";
import type { UserScope } from "../db/with-user";

export type ProviderInfo = {
  provider: IntegrationProvider;
  name: string;
  module: string;
  description: string;
  /** What the server operator must configure before users can connect. */
  requires: string[];
  configured: boolean;
  docsUrl: string;
  /** Honest description of what exists in this build. */
  availability: "available" | "awaiting_credentials" | "planned";
};

/** Integrations are listed from server configuration — nothing here claims a live connection. */
export function providerCatalog(env: NodeJS.ProcessEnv = process.env): ProviderInfo[] {
  const has = (...keys: string[]) => keys.every((k) => !!env[k]);
  return [
    {
      provider: "plaid",
      name: "Plaid (banks & investments)",
      module: "Finances · Wealth",
      description:
        "Read-only bank, card, loan and investment data: balances, transactions, holdings, interest rates. LifeFlow never sees bank passwords and can't move money.",
      requires: ["PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_ENV"],
      configured: has("PLAID_CLIENT_ID", "PLAID_SECRET"),
      docsUrl: "https://plaid.com/docs/",
      availability: has("PLAID_CLIENT_ID", "PLAID_SECRET") ? "available" : "awaiting_credentials",
    },
    {
      provider: "canvas",
      name: "Canvas LMS",
      module: "School",
      description: "Assignments, due dates and class events from your Canvas Calendar Feed link, or the Canvas API with a token where your school allows it.",
      requires: ["CANVAS_BASE_URL", "per-user access token"],
      configured: has("CANVAS_BASE_URL"),
      docsUrl: "https://canvas.instructure.com/doc/api/",
      availability: "planned",
    },
    {
      provider: "ukg",
      name: "UKG Pro",
      module: "Work",
      description: "Employer-issued API access is usually required; a personal login is not API access. Use schedule import meanwhile.",
      requires: ["Employer-provided API credentials"],
      configured: false,
      docsUrl: "https://developer.ukg.com/",
      availability: "planned",
    },
    {
      provider: "google",
      name: "Google (Gmail + Calendar)",
      module: "Email · Calendar",
      description: "Your skyling can search and read your email, draft replies in Gmail, send with your confirmation, and sync your Google Calendar.",
      requires: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      configured: has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
      docsUrl: "https://developers.google.com/workspace/gmail/api",
      availability: has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET") ? "available" : "awaiting_credentials",
    },
    {
      provider: "outlook",
      name: "Microsoft Teams and Outlook",
      module: "Calendar",
      description: "Read-only: your Outlook calendar and Teams meetings (with their join links) show in your plan. School, work and personal accounts.",
      requires: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
      configured: has("MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"),
      docsUrl: "https://learn.microsoft.com/graph/api/user-list-calendarview",
      availability: has("MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET") ? "available" : "awaiting_credentials",
    },
  ];
}

export async function integrationStatus(scope: UserScope) {
  const rows = await scope.tx.select().from(integrations).where(eq(integrations.userId, scope.userId));
  const jobs = await scope.tx.select().from(syncJobs).where(eq(syncJobs.userId, scope.userId)).orderBy(desc(syncJobs.createdAt)).limit(20);
  return providerCatalog().map((p) => {
    const connections = rows
      .filter((r) => r.provider === p.provider)
      .map((r) => ({ id: r.id, status: r.status, displayName: r.displayName, lastSyncedAt: r.lastSyncedAt, lastError: r.lastError }));
    return {
      ...p,
      connections,
      status: connections.length ? (connections.some((c) => c.status === "error") ? "error" : "connected") : "not_connected",
      recentJobs: jobs.filter((j) => connections.some((c) => c.id === j.integrationId)).slice(0, 3),
    };
  });
}

/** What the skyling can see for this account, for the empty chat's "I know your ..." line. Only areas with real rows. */
export async function whatAssistantKnows(scope: UserScope) {
  const [classes, shifts, money] = await series(
    () =>
      scope.tx
        .select({ id: courses.id })
        .from(courses)
        .where(and(eq(courses.userId, scope.userId), isNull(courses.archivedAt)))
        .limit(1),
    () => scope.tx.select({ id: workShifts.id }).from(workShifts).where(eq(workShifts.userId, scope.userId)).limit(1),
    () =>
      scope.tx
        .select({ id: financialAccounts.id })
        .from(financialAccounts)
        .where(and(eq(financialAccounts.userId, scope.userId), isNull(financialAccounts.archivedAt)))
        .limit(1),
  );
  return [classes.length && "classes", shifts.length && "shifts", money.length && "money"].filter((x): x is string => !!x);
}

/** What isn't connected yet, in plain words, for Jarvis to suggest after onboarding (bank, Canvas, calendar). */
export async function missingConnections(scope: UserScope) {
  const rows = await scope.tx.select({ provider: integrations.provider }).from(integrations).where(eq(integrations.userId, scope.userId));
  const have = new Set(rows.map((r) => r.provider));
  return [
    !have.has("plaid") && "your bank",
    !have.has("canvas") && "Canvas",
    !have.has("google") && !have.has("google_calendar") && !have.has("outlook") && "Google Calendar or Microsoft Teams",
  ].filter((x): x is string => !!x);
}
