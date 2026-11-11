import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { COMPANION_KEYS, SKY_CHOICE } from "@/lib/companions";
import { AGE_LINE, BIRTHDAY_NEEDED, CHECK_YEAR, birthDateProblem, isUnderAge } from "@/lib/birthday";
import { todayIn } from "@/lib/dates";
import { ServiceError } from "./errors";
import { emailConfirmations, integrations, ownerInbox, users, waitlistReferrals } from "../db/schema";
import { closeAtProvider, OUTSIDE_PROVIDERS } from "./account-cleanup";
import { provisionalName } from "@/lib/provisional-name";
import type { Database } from "../db/client";
import { withUser, type UserScope } from "../db/with-user";
import { assistantSchema } from "./accounts";
import { lockQueue } from "./waitlist";
import { createManualAccount } from "./finance/accounts";
import { createMemory } from "./memory";
import { createCourse } from "./school";
import { createEmployer, fillRegularShifts, workScheduleSchema } from "./work";

/**
 * First-run setup. Everything the user entered is saved in one transaction
 * through the regular services, so a failed step leaves nothing half-done.
 */
export const onboardingSchema = z.object({
  lifeStage: z.enum(["student", "working", "both", "life"]).optional(),
  courses: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  job: z
    .object({
      name: z.string().trim().min(1).max(200),
      /** Dollars per hour; optional. */
      hourlyRate: z.number().min(0).max(10_000).optional(),
      /** Regular hours, e.g. full-time Mon–Fri 08:00–17:00. Left out when shifts change week to week. */
      schedule: workScheduleSchema.optional(),
    })
    .optional(),
  checking: z
    .object({
      name: z.string().trim().min(1).max(120).default("Checking"),
      /** Current balance in dollars, as the user sees it in their bank app. */
      balance: z.number().min(-10_000_000).max(10_000_000),
    })
    .optional(),
  studyTime: z.enum(["morning", "afternoon", "evening", "night"]).optional(),
  jarvisTone: z.enum(["concise", "balanced", "detailed"]).optional(),
  /** Something the user wants Jarvis to know; saved as a confirmed memory. */
  aboutMe: z.string().trim().max(500).optional(),
  /** Their assistant's name and personality, chosen in "Make it yours". */
  assistant: z
    .object({
      name: assistantSchema.shape.name.optional(),
      style: z.enum(["coach", "friend", "direct"]),
      companion: z.enum([...COMPANION_KEYS, SKY_CHOICE]).optional(),
    })
    .optional(),
});

export type OnboardingInput = z.input<typeof onboardingSchema>;

export async function completeOnboarding(scope: UserScope, input: OnboardingInput, tz = "UTC") {
  const d = onboardingSchema.parse(input);
  const seen = new Set<string>();
  let courses = 0;
  for (const name of d.courses) {
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    await createCourse(scope, { name });
    courses++;
  }
  if (d.job) {
    await createEmployer(scope, {
      name: d.job.name,
      payType: "hourly",
      hourlyRateCents: d.job.hourlyRate == null ? null : Math.round(d.job.hourlyRate * 100),
      schedule: d.job.schedule ?? null,
    });
    if (d.job.schedule) await fillRegularShifts(scope, tz, todayIn(tz));
  }
  if (d.checking) {
    await createManualAccount(scope, {
      name: d.checking.name,
      type: "depository",
      subtype: "checking",
      currentBalanceCents: Math.round(d.checking.balance * 100),
    });
  }
  if (d.aboutMe && d.aboutMe.length >= 3) {
    await createMemory(scope, { content: d.aboutMe, category: "fact" }, "user");
  }
  await finishOnboarding(
    scope,
    {
      lifeStage: d.lifeStage,
      studyTime: d.studyTime,
      jarvisTone: d.jarvisTone,
      assistantName: d.assistant?.name,
      assistantStyle: d.assistant?.style,
      companion: d.assistant?.companion,
    },
    tz,
  );
  return { courses, job: !!d.job, checking: !!d.checking, memory: !!d.aboutMe && d.aboutMe.length >= 3 };
}

/**
 * The welcome saves as it goes (owner, 2026-11-09: their classes come from connecting their school calendar, so the
 * welcome shows how easy connecting is and gets to know them, birthday included). Connecting leaves the page for
 * Google or Microsoft and comes back, so the skyling and "about you" are kept on the account before that.
 */
export const welcomeProgressSchema = z.object({
  assistant: z
    .object({
      name: assistantSchema.shape.name.optional(),
      style: z.enum(["coach", "friend", "direct"]),
      companion: z.enum([...COMPANION_KEYS, SKY_CHOICE]).optional(),
    })
    .optional(),
  name: z.string().trim().min(1, "Tell your skyling what to call you").max(80).optional(),
  birthDate: z.string().trim().optional(),
  lifeStage: z.enum(["student", "working", "both", "life"]).optional(),
  school: z.string().trim().max(120).optional(),
  /** Where they work: kept until setup finishes, which makes it an employer (connecting leaves the page and comes back). */
  job: z.string().trim().max(200).optional(),
});

type Prefs = typeof users.$inferSelect.preferences;
/** A write that must never land over a lock (a parallel save can't clear the flag). */
const notLocked = sql`not (${users.preferences} ? 'ageBlockedAt')`;
/** Their preferences, read for update: a birthday save and a block can't cross each other (two tabs, two taps). */
const prefsOf = async (scope: UserScope) =>
  (await scope.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, scope.userId)).for("update"))[0].preferences;

/**
 * What an age-locked account keeps: the email (on the user row), how they sign in, and the security log (sign-ins and account
 * actions, `audit_events`), as the Privacy Policy's section 9 says. Every other table with a user_id is emptied.
 */
export const KEEP_ON_LOCK = new Set([
  "users",
  "sessions",
  "oauth_identities",
  "passkeys",
  "recovery_codes",
  "login_challenges",
  "auth_challenges",
  "password_resets",
  "audit_events",
]);

/**
 * Tables that point at a user by a column NOT called user_id, so the sweep below can't see them; `blockUnderAge` handles each by
 * name (owner_inbox: their feedback copies deleted; waitlist_referrals: the row where they are the friend deleted, the link on
 * rows where they invited cleared; email_confirmations: their pending code deleted). tests/integration/onboarding.test.ts fails
 * when a table with a foreign key to users is neither swept (user_id), kept, handled here, nor a reviewed exception.
 */
export const HANDLED_ON_LOCK = new Set(["owner_inbox", "waitlist_referrals", "email_confirmations"]);

/**
 * Under 13 (owner, 2026-11-10): one calm line, and the account is locked, during setup or later (a finished account answering
 * on Today or in Settings gets the same, owner 2026-11-10). Nothing they gave is kept (the review of b3effa0): the name goes
 * back to the stand-in from their email, the preferences keep only the lock, every row they own is removed except how they
 * sign in, and so are copies of their feedback in the owner's inbox. A bank or Google link is kept only as the encrypted
 * grant until `closeLockedConnections` closes it at the provider after this commits (no outside call inside the
 * transaction; `ageLockClosing` marks it, and the sync cron retries). A paid plan is flagged for the owner, never cancelled
 * here. The demo account can't be locked.
 * A finished account is only ever locked after the person has seen the date read back and said yes (`saveBirthday`). Returned rather than thrown,
 * so it's committed. The session layer enforces the lock (`ageLocked`, auth/current-user.ts).
 */
async function blockUnderAge(scope: UserScope, prefs: Prefs) {
  await lockQueue(scope.tx); // already held by the callers (taken before the user row's lock); a no-op the second time
  const at = new Date().toISOString();
  const [me] = await scope.tx
    .select({ email: users.email, stripeCustomerId: users.stripeCustomerId, kind: users.accountKind })
    .from(users)
    .where(eq(users.id, scope.userId));
  if (me.kind === "demo") throw new ServiceError("The demo account keeps its birthday.");
  // A paid plan is never cancelled from here (owner, 2026-11-10: flag only; he reviews and ends it himself). The flag is
  // raised by afterAgeLock once this commits (it can email him, so never inside this transaction).
  // a bank link or Google grant has to be closed where it lives (Plaid, Google), like deleting an account does. That's an
  // outside call, so it never runs in this transaction: the row stays as only its encrypted grant (no name, account or
  // metadata) until closeLockedConnections closes it after the commit
  const outside = await scope.tx
    .update(integrations)
    .set({ displayName: null, externalId: null, metadata: {}, scopes: [], lastError: null, status: "disconnected" })
    .where(and(eq(integrations.userId, scope.userId), inArray(integrations.provider, OUTSIDE_PROVIDERS)))
    .returning({ id: integrations.id });
  // copies of their feedback in the owner's inbox go too (that table has no user_id, so the sweep below can't see it)
  await scope.tx.delete(ownerInbox).where(eq(ownerInbox.senderUserId, scope.userId));
  // the waitlist's account tables point at the user by other column names, so the sweep below can't see them: the referral
  // row where they are the friend (it holds a hash of their email), the link on rows where they are the inviter, and a pending confirm code. Moves already
  // made in the queue stay (not personal data).
  await scope.tx.delete(waitlistReferrals).where(eq(waitlistReferrals.inviteeId, scope.userId));
  // rows where they invited someone go too (as when an inviter deletes their account): the friends keep their own accounts
  await scope.tx.delete(waitlistReferrals).where(eq(waitlistReferrals.inviterId, scope.userId));
  await scope.tx.delete(emailConfirmations).where(eq(emailConfirmations.userId, scope.userId));
  // every table that holds their rows, found from the database so a new one can't be missed: a new table with a user_id is
  // emptied unless it is listed in KEEP_ON_LOCK (tests/integration/onboarding.test.ts checks this). Only real tables: a view
  // can't be deleted from, and one must never make this save throw.
  const tables = await scope.tx.execute<{ table_name: string }>(
    sql`select distinct c.table_name from information_schema.columns c
        join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
        where c.column_name = 'user_id' and c.table_schema = current_schema()`,
  );
  for (const { table_name } of tables.rows) {
    if (KEEP_ON_LOCK.has(table_name)) continue;
    if (table_name === "integrations")
      await scope.tx.delete(integrations).where(and(eq(integrations.userId, scope.userId), sql`not (${inArray(integrations.provider, OUTSIDE_PROVIDERS)})`));
    else await scope.tx.execute(sql`delete from ${sql.identifier(table_name)} where user_id = ${scope.userId}`);
  }
  // people they invited no longer point at them (they keep their own accounts)
  await scope.tx.update(users).set({ invitedBy: null }).where(eq(users.invitedBy, scope.userId));
  await scope.tx
    .update(users)
    // nothing of theirs on the account row either: their time zone, forwarding address and texting number go too
    .set({
      name: provisionalName(me.email),
      timezone: "UTC",
      inboxToken: null,
      smsPhone: null,
      // out of the waitlist (the queue ignores a locked account) and no invite link or inviter kept
      inviteCode: null,
      invitedBy: null,
      acceptedAt: null,
      emailVerifiedAt: null,
      preferences: { onboarding: prefs.onboarding, ageBlockedAt: at, ...(outside.length ? { ageLockClosing: true } : {}) },
    })
    .where(eq(users.id, scope.userId));
  return { blocked: true as const };
}

/**
 * After a lock commits: closes each bank link at Plaid and Google grant at Google that the lock kept, then removes its row.
 * Only ever for a locked account. A failure keeps the row and the `ageLockClosing` mark, records a fixed-text error and is
 * retried by the sync cron (`retryLockClosing`); the last one closed clears the mark. Never throws.
 */
/** How many times the sync cron tries to close one link at its provider before keeping nothing of it. */
const CLOSE_TRIES = 10;

export async function closeLockedConnections(db: Database, userId: string, base: typeof fetch = fetch): Promise<{ closed: number; left: number }> {
  const f: typeof fetch = (input, init) => base(input, { ...init, signal: AbortSignal.timeout(8000) });
  try {
    const rows = await withUser(
      userId,
      async (s) => {
        const [me] = await s.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId));
        if (!me?.preferences.ageBlockedAt) return [];
        return s.tx
          .select({
            id: integrations.id,
            provider: integrations.provider,
            encryptedCredentials: integrations.encryptedCredentials,
            metadata: integrations.metadata,
          })
          .from(integrations)
          .where(and(eq(integrations.userId, userId), inArray(integrations.provider, OUTSIDE_PROVIDERS)));
      },
      db,
    );
    let left = 0;
    for (const row of rows) {
      try {
        // a link that never finished connecting has no grant to close
        if (row.encryptedCredentials) await closeAtProvider(row, f);
        await withUser(userId, (s) => s.tx.delete(integrations).where(eq(integrations.id, row.id)), db);
      } catch {
        // retried by the sync cron, but not forever: after CLOSE_TRIES the grant can't be closed from here (a grant that
        // can't be read, a provider that keeps refusing), so nothing more is kept of it and the owner is told once
        const tries = Number(row.metadata?.closeTries ?? 0) + 1;
        const { recordError } = await import("./error-reports");
        if (tries >= CLOSE_TRIES) {
          await withUser(userId, (s) => s.tx.delete(integrations).where(eq(integrations.id, row.id)), db);
          await recordError(db, {
            source: "server",
            route: "age.lock",
            message: "Age lock: a bank or Google link couldn't be closed at the provider after several tries. It was removed here.",
          }).catch(() => {});
          continue;
        }
        left++;
        await withUser(
          userId,
          (s) =>
            s.tx
              .update(integrations)
              .set({ metadata: { closeTries: tries } })
              .where(eq(integrations.id, row.id)),
          db,
        );
        await recordError(db, { source: "server", route: "age.lock", message: "Age lock: closing a bank or Google link failed. It is retried." }).catch(
          () => {},
        );
      }
    }
    if (!left)
      await withUser(
        userId,
        (s) =>
          s.tx
            .update(users)
            .set({ preferences: sql`${users.preferences} - 'ageLockClosing'` })
            .where(eq(users.id, userId)),
        db,
      );
    return { closed: rows.length - left, left };
  } catch {
    return { closed: 0, left: -1 };
  }
}

/**
 * What runs once a lock has committed (the actions call it in after()): a paid plan is flagged for the owner (a
 * fixed-text error report, which emails him the first time; never cancelled from here), and the bank and Google links
 * are closed where they live. Never throws.
 */
export async function afterAgeLock(db: Database, userId: string, base: typeof fetch = fetch) {
  try {
    const [me] = await db.select({ customer: users.stripeCustomerId, preferences: users.preferences }).from(users).where(eq(users.id, userId));
    if (me?.preferences.ageBlockedAt && me.customer) {
      const { recordError } = await import("./error-reports");
      await recordError(db, { source: "server", route: "age.lock", message: "Age lock: a locked account has a billing record. Review it in Stripe." });
    }
  } catch {}
  return closeLockedConnections(db, userId, base);
}

/** The sync cron's retry: the locked accounts still marked as closing a link, oldest lock first. */
export async function retryLockClosing(db: Database) {
  const due = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.preferences} ? 'ageLockClosing'`)
    .orderBy(sql`${users.preferences} ->> 'ageBlockedAt'`)
    .limit(50);
  for (const u of due) await closeLockedConnections(db, u.id);
  return due.length;
}

export async function saveWelcomeProgress(scope: UserScope, tz: string, input: z.input<typeof welcomeProgressSchema>): Promise<{ blocked: boolean }> {
  const d = welcomeProgressSchema.parse(input);
  // A lock changes the queue, so it takes the queue lock before any row lock (the `for update` below), like every queue change.
  if (d.birthDate && isUnderAge(d.birthDate, todayIn(tz))) await lockQueue(scope.tx);
  const current = await prefsOf(scope);
  if (current.ageBlockedAt) return { blocked: true };
  if (d.birthDate && isUnderAge(d.birthDate, todayIn(tz))) {
    // the welcome's own save only ever locks an account that is still being set up; a finished one goes through Today's
    // read-back step, never through a stray call to this action
    if (current.onboarding !== "pending") throw new ServiceError(CHECK_YEAR);
    return blockUnderAge(scope, current);
  }
  if (d.birthDate) {
    const problem = birthDateProblem(d.birthDate, todayIn(tz));
    if (problem) throw new ServiceError(problem);
  }
  const prefs = {
    ...current,
    ...(d.assistant ? { assistantName: d.assistant.name, assistantStyle: d.assistant.style, companion: d.assistant.companion } : {}),
    ...(d.birthDate ? { birthDate: d.birthDate } : {}),
    ...(d.lifeStage ? { lifeStage: d.lifeStage } : {}),
    ...(d.school !== undefined ? { school: d.school || undefined } : {}),
    ...(d.job !== undefined ? { welcomeJob: d.job || undefined } : {}),
  };
  await scope.tx
    .update(users)
    .set({ preferences: prefs, ...(d.name ? { name: d.name.replace(/\s+/g, " ") } : {}) })
    .where(and(eq(users.id, scope.userId), notLocked));
  return { blocked: false };
}

/** The birthday asked once on Today from accounts made before it was required (not a lockout). Same rules. */
export async function saveBirthday(
  scope: UserScope,
  tz: string,
  birthDate: string,
  opts: { confirmed?: boolean } = {},
): Promise<{ blocked: boolean; confirm?: string }> {
  const birth = z.string().trim().parse(birthDate);
  if (isUnderAge(birth, todayIn(tz))) await lockQueue(scope.tx);
  const current = await prefsOf(scope);
  if (current.ageBlockedAt) return { blocked: true };
  if (isUnderAge(birth, todayIn(tz))) {
    // A finished account holds a whole life, and the lock empties it for good: nothing happens until the person has seen
    // the date read back and said yes (owner, 2026-11-10: confirm, then erase). Setup has nothing to lose and locks at once.
    if (current.onboarding !== "pending" && !opts.confirmed) return { blocked: false, confirm: birth };
    return blockUnderAge(scope, current);
  }
  const problem = birthDateProblem(birth, todayIn(tz));
  if (problem) throw new ServiceError(problem);
  await scope.tx
    .update(users)
    .set({ preferences: { ...current, birthDate: birth } })
    .where(and(eq(users.id, scope.userId), notLocked));
  return { blocked: false };
}

/** The name they want to be called, asked on the first screen after sign-up. */
export async function setDisplayName(scope: UserScope, name: string) {
  const clean = z.string().trim().min(1, "Enter a name").max(80).parse(name).replace(/\s+/g, " ");
  await scope.tx.update(users).set({ name: clean }).where(eq(users.id, scope.userId));
}

/**
 * Marks setup finished (also used by "Skip setup"). No tour follows (owner's program, item 7: the first minute ends on
 * their own sky; the welcome teaches what the tour did). "Replay the tour" in Settings still sets it to pending.
 */
export async function finishOnboarding(
  scope: UserScope,
  prefs: Partial<Pick<typeof users.$inferSelect.preferences, "lifeStage" | "studyTime" | "jarvisTone" | "assistantName" | "assistantStyle" | "companion">> = {},
  tz = "UTC",
) {
  const [u] = await scope.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, scope.userId)).for("update");
  // setup finishes (or is skipped) only with a real birthday, 13 or older, checked here on the server (owner, 2026-11-10)
  if (u.preferences.ageBlockedAt) throw new ServiceError(AGE_LINE);
  if (!u.preferences.birthDate || birthDateProblem(u.preferences.birthDate, todayIn(tz))) throw new ServiceError(BIRTHDAY_NEEDED);
  const defined = Object.fromEntries(Object.entries(prefs).filter(([, v]) => v !== undefined));
  await scope.tx
    .update(users)
    .set({ preferences: { ...u.preferences, ...defined, welcomeJob: undefined, onboarding: "done", tour: "done" } })
    .where(eq(users.id, scope.userId));
}

export async function setTourState(scope: UserScope, tour: "pending" | "done") {
  const [u] = await scope.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, scope.userId));
  await scope.tx
    .update(users)
    .set({ preferences: { ...u.preferences, tour } })
    .where(eq(users.id, scope.userId));
}
