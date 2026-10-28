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
      description: "Bank accounts, transactions, balances. Investment holdings need the separate Investments product.",
      requires: ["PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_ENV"],
      configured: has("PLAID_CLIENT_ID", "PLAID_SECRET"),
      docsUrl: "https://plaid.com/docs/",
      availability: "planned",
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
      provider: "google_calendar",
      name: "Google Calendar",
      module: "Calendar",
      description: "Two-way calendar sync via Google OAuth.",
      requires: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      configured: has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
      docsUrl: "https://developers.google.com/calendar/api",
      availability: "planned",
    },
    {
      provider: "gmail",
      name: "Gmail",
      module: "Email",
      description: "Search, summarize and draft replies. Sending always requires your confirmation.",
      requires: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "Google OAuth verification for restricted scopes"],
      configured: has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
      docsUrl: "https://developers.google.com/gmail/api",
      availability: "planned",
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
