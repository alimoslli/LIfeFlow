import { eq, getTableColumns } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../db/schema";
import type { UserScope } from "../db/with-user";

type UserTable = PgTable & { userId: PgColumn };

/**
 * "Download my data": every table that holds a person's records, by the key it has in the file.
 * A new table with a `user_id` column must be added here or to NOT_EXPORTED (tests/unit/data-export.test.ts).
 */
export const EXPORT_TABLES = {
  accounts: schema.financialAccounts,
  transactions: schema.transactions,
  categories: schema.categories,
  categoryRules: schema.categoryRules,
  budgets: schema.budgets,
  recurring: schema.recurringItems,
  goals: schema.financialGoals,
  goalContributions: schema.goalContributions,
  netWorthSnapshots: schema.netWorthSnapshots,
  holdings: schema.holdings,
  savingsOpportunities: schema.savingsOpportunities,
  personalGoals: schema.personalGoals,
  goalCheckins: schema.goalCheckins,
  milestones: schema.lifeMilestones,
  habits: schema.habits,
  habitChecks: schema.habitChecks,
  courses: schema.courses,
  assignments: schema.assignments,
  materials: schema.courseMaterials,
  events: schema.calendarEvents,
  tasks: schema.tasks,
  projects: schema.projects,
  notes: schema.notes,
  employers: schema.employers,
  shifts: schema.workShifts,
  paychecks: schema.paychecks,
  memories: schema.memories,
  conversations: schema.conversations,
  messages: schema.messages,
  attachments: schema.attachments,
  pendingActions: schema.pendingActions,
  assistantMessages: schema.jarvisMessages,
  jarvisRuns: schema.jarvisRuns,
  inboxItems: schema.inboxItems,
  inboxSenders: schema.inboxSenders,
  gmailMessages: schema.gmailMessages,
  integrations: schema.integrations,
  syncJobs: schema.syncJobs,
  health: schema.healthSamples,
  notifications: schema.notificationLog,
  recentlyDeleted: schema.trash,
  feedback: schema.feedback,
  activity: schema.auditEvents,
} as const satisfies Record<string, UserTable>;

/**
 * Tables with a `user_id` that are left out on purpose: sign-in secrets and keys, never their hashes.
 * Keep this list short; anything a person wrote or that describes them belongs in EXPORT_TABLES.
 */
export const NOT_EXPORTED: Record<string, string> = {
  sessions: "sign-in sessions (id is a hash of the cookie token)",
  recovery_codes: "two-step backup codes (hashes)",
  passkeys: "passkey credentials (public keys and credential ids)",
  auth_challenges: "single-use sign-in challenges",
  oauth_identities: "Apple and Google sign-in links (provider account ids)",
  password_resets: "password reset links (hashes)",
  login_challenges: "two-step sign-in in progress",
  health_tokens: "Apple Health keys (hashes)",
  push_subscriptions: "this device's push keys",
  connection_registry: "internal routing for connections; the connections themselves are exported as integrations",
};

/** Columns that are secrets, hashes or internal, by table. The rest of each row is exported as stored. */
const OMIT_COLUMNS: Partial<Record<keyof typeof EXPORT_TABLES, string[]>> = {
  integrations: ["encryptedCredentials"],
  notes: ["searchVector"],
  // The file itself stays out (it can be large); its name, type, size and date are exported.
  attachments: ["dataBase64", "sha256"],
  inboxSenders: ["codeHash"],
};

/** Exported column names (database names) per table, for the test that no secret or hash slips in. */
export function exportedColumns(key: keyof typeof EXPORT_TABLES): string[] {
  const omit = new Set(OMIT_COLUMNS[key] ?? []);
  return Object.entries(getTableColumns(EXPORT_TABLES[key]))
    .filter(([prop]) => !omit.has(prop))
    .map(([, col]) => (col as PgColumn).name);
}

function strip(row: Record<string, unknown>, omit: string[]) {
  const out = { ...row };
  for (const k of omit) delete out[k];
  return out;
}

/** Preferences without the SMS verification code hash. */
function exportablePreferences(prefs: schema.UserPreferences | undefined) {
  if (!prefs) return {};
  const { sms, ...rest } = prefs;
  if (!sms) return rest;
  const { codeHash: _h, ...smsRest } = sms;
  return { ...rest, sms: smsRest };
}

export type ExportProfile = { name: string; email: string; timezone: string; preferences?: schema.UserPreferences };

/**
 * Everything the person has stored, as plain JSON. Runs inside withUser, so row-level security limits every read to them.
 * Memories come back decrypted by their column type, as everywhere else in the app.
 */
export async function exportUserData(s: UserScope, profile: ExportProfile) {
  const out: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    profile: { name: profile.name, email: profile.email, timezone: profile.timezone, preferences: exportablePreferences(profile.preferences) },
  };
  for (const [key, table] of Object.entries(EXPORT_TABLES) as [keyof typeof EXPORT_TABLES, UserTable][]) {
    const rows = (await s.tx.select().from(table).where(eq(table.userId, s.userId))) as Record<string, unknown>[];
    const omit = OMIT_COLUMNS[key] ?? [];
    out[key] = rows.map((r) => strip(r, omit));
  }
  return out;
}
