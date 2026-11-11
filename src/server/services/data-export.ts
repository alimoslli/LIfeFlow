import { and, asc, eq, getTableColumns, gt, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../db/schema";
import { getDb } from "../db/client";
import { withUser, type UserScope } from "../db/with-user";
import { friendCounts, waitlistPlace } from "./waitlist";

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
  promises: schema.promises,
  voice_sessions: schema.voiceSessions,
  voice_tool_calls: schema.voiceToolCalls,
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
  skyRewards: schema.skyRewards,
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
  email_confirmations: "a keyed hash of the 6-digit code emailed to confirm their email, kept up to 10 minutes; a one-time code, not exported",
  waitlist_referrals:
    "rows tying an inviter to a friend's one-way keyed email hash, kept so one email can't count twice; what applies to the person (place, invite code, dates, whether they joined through a link, how many friends counted) is in the profile",
  remembered_devices: "phones and computers that skip the two-step code (hashes of cookie tokens)",
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

/** Rows read per query. All the batches of one export read one snapshot (`openSnapshot`). */
export const EXPORT_BATCH = 500;

/** How long a download may go unread before its snapshot is let go: the download then fails, never looking complete. */
export const EXPORT_IDLE_MS = 60_000;

/** The longest one download may hold its snapshot (and a pool connection), however steadily it is read. Then it fails cleanly. */
export const EXPORT_DEADLINE_MS = 120_000;

/** No single read of a batch runs longer than this, so a stuck query can't hold the snapshot's locks. */
export const EXPORT_STATEMENT_TIMEOUT_MS = 15_000;

/** The users with a download open right now (one per user, so a few slow readers can't take the whole connection pool). */
const openExports = new Map<string, number>();
/** Open until it finishes or is cancelled; a download whose response was dropped without either lapses after its total time. */
export const exportBusy = (userId: string) => (openExports.get(userId) ?? 0) > Date.now();

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
 * One read-only REPEATABLE READ transaction for a whole export, as this user (`withUser`, so row-level security
 * still limits every read). Every batch reads the same snapshot, so a bank sync during a long download can't leave
 * out a transaction it re-posted under a new id, or add one whose account isn't in the file. The connection goes
 * back to the pool on `close`, or once no batch has been read for `idleMs` (a download nobody is reading).
 */
export function openSnapshot(userId: string, idleMs: number, deadlineMs = EXPORT_DEADLINE_MS) {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let scope!: Promise<UserScope>;
  // Settles once the transaction has ended and its connection is back in the pool. It only reads, so how it ends doesn't matter.
  const ended = new Promise<void>((settled) => {
    scope = new Promise<UserScope>((opened, failed) => {
      withUser(
        userId,
        async (s) => {
          await s.tx.execute(sql`select set_config('statement_timeout', ${String(EXPORT_STATEMENT_TIMEOUT_MS)}, true)`);
          opened(s);
          return held;
        },
        getDb(),
        { isolationLevel: "repeatable read", accessMode: "read only" },
      ).then(settled, (e) => {
        failed(e); // couldn't open: the first read fails with it
        settled();
      });
    });
  });
  scope.catch(() => {}); // closed before any read: nothing left to report
  let closed = false;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const close = async () => {
    closed = true;
    clearTimeout(idle);
    clearTimeout(deadline);
    release();
    await ended;
  };
  // Unread from the start counts as idle, and the whole download has a total time.
  idle = setTimeout(() => void close(), idleMs);
  const deadline = setTimeout(() => void close(), deadlineMs);
  return {
    async read<T>(fn: (s: UserScope) => Promise<T>): Promise<T> {
      clearTimeout(idle);
      if (closed) throw new Error("export: the download stopped being read");
      try {
        return await fn(await scope);
      } finally {
        if (!closed) idle = setTimeout(() => void close(), idleMs);
      }
    },
    close,
  };
}

/**
 * The export as JSON text, piece by piece: the profile, then each table in batches of EXPORT_BATCH rows in id order,
 * all from one snapshot (`openSnapshot`), whose connection is let go when the generator finishes, fails or is closed early.
 * Memories come back decrypted by their column type, as everywhere else in the app.
 */
export async function* exportChunks(
  userId: string,
  profile: ExportProfile,
  batch = EXPORT_BATCH,
  idleMs = EXPORT_IDLE_MS,
  deadlineMs = EXPORT_DEADLINE_MS,
): AsyncGenerator<string> {
  if (exportBusy(userId)) throw new Error("export: a download is already open for this account");
  openExports.set(userId, Date.now() + deadlineMs + idleMs);
  try {
    yield* exportBody(userId, profile, batch, idleMs, deadlineMs);
  } finally {
    openExports.delete(userId);
  }
}

async function* exportBody(userId: string, profile: ExportProfile, batch: number, idleMs: number, deadlineMs: number): AsyncGenerator<string> {
  // their own place in the waitlist and what the account row holds about it (account data, no row-level security)
  const db = getDb();
  const [me] = await db
    .select({
      access: schema.users.access,
      acceptedAt: schema.users.acceptedAt,
      emailVerifiedAt: schema.users.emailVerifiedAt,
      inviteCode: schema.users.inviteCode,
      invitedBy: schema.users.invitedBy,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  const head = {
    exportedAt: new Date().toISOString(),
    profile: {
      name: profile.name,
      email: profile.email,
      timezone: profile.timezone,
      preferences: exportablePreferences(profile.preferences),
      waitlist: me
        ? {
            place: await waitlistPlace(db, userId),
            access: me.access,
            acceptedAt: me.acceptedAt,
            emailVerifiedAt: me.emailVerifiedAt,
            inviteCode: me.inviteCode,
            // whether they joined through someone's link (never who), and how many of their own friends counted
            joinedThroughALink: !!me.invitedBy,
            friendsCounted: (await friendCounts(db, userId)).friends,
          }
        : null,
    },
  };
  yield JSON.stringify(head).slice(0, -1); // the object stays open for the tables
  const snapshot = openSnapshot(userId, idleMs, deadlineMs);
  try {
    for (const [key, table] of Object.entries(EXPORT_TABLES) as [keyof typeof EXPORT_TABLES, UserTable][]) {
      const omit = OMIT_COLUMNS[key] ?? [];
      yield `,${JSON.stringify(key)}:[`;
      let after: string | null = null;
      let first = true;
      for (;;) {
        const rows = (await snapshot.read((s) =>
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
  } finally {
    await snapshot.close();
  }
  yield "}";
}

/** exportChunks as a byte stream for the response; reads the next batch only when the client is ready for it. */
export function exportStream(
  userId: string,
  profile: ExportProfile,
  batch = EXPORT_BATCH,
  idleMs = EXPORT_IDLE_MS,
  deadlineMs = EXPORT_DEADLINE_MS,
): ReadableStream<Uint8Array> {
  const chunks = exportChunks(userId, profile, batch, idleMs, deadlineMs);
  const encoder = new TextEncoder();
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await chunks.next();
        if (cancelled) return; // the client left while this batch was read
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      } catch (e) {
        // A broken download, never a file that looks complete. The cause is in the server log.
        console.error("[export]", e);
        controller.error(e);
      }
    },
    // The client disconnected (Next cancels the body): ends the snapshot, so the connection goes back to the pool.
    async cancel() {
      cancelled = true;
      await chunks.return(undefined);
    },
  });
}
