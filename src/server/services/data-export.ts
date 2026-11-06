import { and, asc, eq, getTableColumns, gt } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../db/schema";
import { withUser } from "../db/with-user";

type UserTable = PgTable & { userId: PgColumn; id: PgColumn };

/**
 * "Download my data": every table that holds a person's records, by the key it has in the file.
 * A new table that points at a user must be added here or to NOT_EXPORTED (tests/unit/data-export.test.ts).
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
  health: schema.healthSamples,
  notifications: schema.notificationLog,
  recentlyDeleted: schema.trash,
  feedback: schema.feedback,
  activity: schema.auditEvents,
} as const satisfies Record<string, UserTable>;

/**
 * Tables about a person that are left out on purpose: sign-in secrets and keys (never their hashes), and the
 * operational logs and owner copies that aren't the person's own content. Keep this list short.
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
  sync_jobs: "the background sync log, a row every 30 minutes per connection; operational, and each connection's state is in integrations",
  owner_inbox: "the owner's copy of feedback this person sent; the feedback itself is exported as feedback",
  admin_actions: "the owner's log of admin actions on accounts (ADR 0022); operational, and it names the admin",
};

/** Columns that are secrets, hashes or internal, by table. The rest of each row is exported as stored. */
const OMIT_COLUMNS: Partial<Record<keyof typeof EXPORT_TABLES, string[]>> = {
  integrations: ["encryptedCredentials"],
  notes: ["searchVector"],
  // The file itself stays out (it can be large); its name, type, size and date are exported.
  attachments: ["dataBase64", "sha256"],
  inboxSenders: ["codeHash"],
};

/** Rows read per query. Each batch is its own short transaction, so a slow download never holds a database connection. */
export const EXPORT_BATCH = 500;

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
 * The export as JSON text, piece by piece: the profile, then each table in batches of EXPORT_BATCH rows in id order.
 * Every batch runs in its own withUser transaction, so row-level security limits every read to this person.
 * Memories come back decrypted by their column type, as everywhere else in the app.
 */
export async function* exportChunks(userId: string, profile: ExportProfile, batch = EXPORT_BATCH): AsyncGenerator<string> {
  const head = {
    exportedAt: new Date().toISOString(),
    profile: { name: profile.name, email: profile.email, timezone: profile.timezone, preferences: exportablePreferences(profile.preferences) },
  };
  yield JSON.stringify(head).slice(0, -1); // the object stays open for the tables
  for (const [key, table] of Object.entries(EXPORT_TABLES) as [keyof typeof EXPORT_TABLES, UserTable][]) {
    const omit = OMIT_COLUMNS[key] ?? [];
    yield `,${JSON.stringify(key)}:[`;
    let after: string | null = null;
    let first = true;
    for (;;) {
      const rows = (await withUser(userId, (s) =>
        s.tx
          .select()
          .from(table)
          .where(and(eq(table.userId, s.userId), after === null ? undefined : gt(table.id, after)))
          .orderBy(asc(table.id))
          .limit(batch),
      )) as Record<string, unknown>[];
      if (!rows.length) break;
      yield (first ? "" : ",") + rows.map((r) => JSON.stringify(strip(r, omit))).join(",");
      first = false;
      after = rows[rows.length - 1].id as string;
      if (rows.length < batch) break;
    }
    yield "]";
  }
  yield "}";
}

/** exportChunks as a byte stream for the response; reads the next batch only when the client is ready for it. */
export function exportStream(userId: string, profile: ExportProfile, batch = EXPORT_BATCH): ReadableStream<Uint8Array> {
  const chunks = exportChunks(userId, profile, batch);
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await chunks.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      } catch (e) {
        // A broken download, never a file that looks complete. The cause is in the server log.
        console.error("[export]", e);
        controller.error(e);
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
}
