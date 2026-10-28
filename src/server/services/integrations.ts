import { desc, eq } from "drizzle-orm";
import { integrations, syncJobs, type IntegrationProvider } from "../db/schema";
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
      description: "Courses, assignments and due dates via your school's Canvas API (requires a token your school permits).",
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
      description: "Your assistant can search and read your email, draft replies in Gmail, send with your confirmation, and sync your Google Calendar.",
      requires: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      configured: has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
      docsUrl: "https://developers.google.com/workspace/gmail/api",
      availability: has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET") ? "available" : "awaiting_credentials",
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
