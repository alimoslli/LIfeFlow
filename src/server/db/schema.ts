/**
 * LifeFlow relational schema.
 *
 * Conventions
 * - Every user-owned table has a `user_id` column and a row-level-security
 *   policy (see `ownerPolicy`). The app sets `app.user_id` per transaction
 *   (see `withUser`), so even a buggy query cannot read another user's rows.
 * - Money is stored as integer cents (`bigint`, JS number mode). Signed amounts
 *   on transactions: positive = money in, negative = money out.
 * - `source` records where a row came from: manual | jarvis | import | demo |
 *   plaid | canvas | ukg ... so synced, imported, demo and hand-entered data
 *   are never confused.
 */
import { sql, type SQL } from "drizzle-orm";
import { openText, sealText } from "../crypto";
import {
  bigint,
  bigserial,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// helpers

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const cents = (name: string) => bigint(name, { mode: "number" });
const tstz = (name: string) => timestamp(name, { withTimezone: true });

/** The current request's user id, set by withUser(). NULL when unset => no rows visible. */
export const currentUserIdSql = sql`nullif(current_setting('app.user_id', true), '')::uuid`;

const ownerPolicy = () =>
  pgPolicy("owner_isolation", {
    as: "permissive",
    for: "all",
    using: sql`user_id = ${currentUserIdSql}`,
    withCheck: sql`user_id = ${currentUserIdSql}`,
  });

const userRef = () =>
  uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

// ---------------------------------------------------------------------------
// identity (no RLS: needed before a user context exists, e.g. login)

export type UserPreferences = {
  /** When the user allowed Jarvis to send their data to the AI provider (OpenAI). Unset or null: no AI features (App Store 5.1.2(i)). */
  aiConsentAt?: string | null;
  /** When the stars for what the skyling passed were last claimed on Today (services/stars.ts); unset until the first visit. */
  starsClaimedAt?: string;
  /** Idea clouds tapped, a count per cloud (lib/idea-clouds), never the message text: a tapped one counts as used. */
  ideaTaps?: Partial<Record<string, number>>;
  studyTime?: "morning" | "afternoon" | "evening" | "night";
  weekStartsOn?: 0 | 1;
  currency?: string;
  jarvisTone?: "concise" | "balanced" | "detailed";
  /** Let Jarvis suggest things to remember (default on). Explicit "remember…" requests always work. */
  memorySuggestions?: boolean;
  /** Let Jarvis read new school, bill and work emails in Gmail each morning and file them (off unless turned on). */
  gmailFiling?: boolean;
  /** The version of the one-time inbox duplicate cleanup this account has had (see runInboxCleanupOnce). */
  inboxDedupeVersion?: number;
  /** Set when the inbox cleanup failed: it is not tried again before this date (YYYY-MM-DD). */
  inboxDedupeRetryAfter?: string;
  /** What fills the user's week (from onboarding); helps Jarvis and the briefing. */
  lifeStage?: "student" | "working" | "both" | "life";
  /** Their birthday, "YYYY-MM-DD" (the welcome, owner 2026-11-09; Settings › Profile). Private to the account. */
  birthDate?: string;
  /** Their school's name, from the welcome (students). */
  school?: string;
  /**
   * Set once when the birthday given makes them under 13 (owner, 2026-11-10): the welcome stays locked for the account,
   * a later, older year doesn't get through, and nothing else about them is kept.
   */
  ageBlockedAt?: string;
  /** A locked account whose bank or Google link is still being closed at the provider (retried by the sync cron). */
  ageLockClosing?: boolean;
  /** Where they work, typed in the welcome; kept while they connect (they leave and come back) and made an employer when setup finishes. */
  welcomeJob?: string;
  /** First-run setup: "pending" only for accounts created since onboarding launched. */
  onboarding?: "pending" | "done";
  /** Guided tour of the app, offered after onboarding or replayed from Settings. */
  tour?: "pending" | "done";
  /** The user's assistant: its name, personality and live voice (see src/lib/assistant.ts). */
  assistantName?: string;
  /** Who runs on top of Today and is the skyling (lib/companions; the cast). Unset = not picked yet. */
  /** "noon" and "dusk" are choices saved before the cast became five; read through companionOf / currentKey. */
  companion?: "dawn" | "ray" | "goldie" | "star" | "moon" | "sky" | "noon" | "dusk";
  /** coach | friend | direct (older values are mapped in lib/assistant). */
  assistantStyle?: "coach" | "friend" | "direct" | "balanced" | "warm" | "playful" | "professional";
  /** Free-text personality notes, at most 300 characters. Changes tone only, never the rules. */
  assistantNotes?: string;
  /** How much the user already knows about money; lessons and explanations adapt to it. */
  moneyLevel?: "new" | "some" | "confident";
  /** How proactive Jarvis behaves (see services/proactive). */
  jarvis?: JarvisSettings;
  /** Ask for Face ID / Touch ID (a passkey) before showing Money after this many idle minutes. */
  moneyLock?: { enabled: boolean; idleMinutes: number };
  /** Texting Jarvis (SMS): a pending verification, whether money details may be sent by text, and the SMS conversation. */
  sms?: {
    pendingPhone?: string;
    codeHash?: string;
    codeExpiresAt?: string;
    attempts?: number;
    money?: boolean;
    conversationId?: string;
    pendingActionId?: string;
  };
  /** Which push notifications the user wants, and when the morning brief arrives (local HH:mm). */
  /** `stars`: a one-line note when a class, shift or plan ends that a star is waiting (services/stars.ts `pushStars`). */
  notifications?: { reminders?: boolean; bills?: boolean; morningBrief?: boolean; briefTime?: string; budgetAlerts?: boolean; stars?: boolean };
  assistantVoice?: "alloy" | "ash" | "ballad" | "cedar" | "coral" | "echo" | "marin" | "sage" | "shimmer" | "verse";
};

export const JARVIS_TOPICS = ["money", "school", "work", "health", "habits"] as const;
export type JarvisTopic = (typeof JARVIS_TOPICS)[number];
export type JarvisSettings = {
  frequency?: "low" | "normal" | "high";
  /** Local "HH:mm"; no pushes between start and end. */
  quietStart?: string;
  quietEnd?: string;
  /** false = muted. */
  topics?: Partial<Record<JarvisTopic, boolean>>;
  /** What Jarvis may do without asking. Money and contacting people always ask. */
  autonomy?: { tasks?: boolean; calendar?: boolean };
  /** Consent to adapt from how the user responds (undefined = not asked yet). */
  learning?: boolean;
  /** Message kinds the user said never to suggest again. */
  mutedKinds?: string[];
  /** Max push notifications per day from Jarvis. */
  pushLimit?: number;
  /** ISO time; learning ignores responses before this ("Reset what I learned"). */
  learningResetAt?: string;
};

export type ProactiveAction =
  | { type: "shift_budget"; label: string; fromCategoryId: string; toCategoryId: string; cents: number; month: string }
  | { type: "block_time"; label: string; date: string; start: string; end: string; title: string }
  | { type: "create_task"; label: string; title: string; dueDate?: string }
  | { type: "move_tasks"; label: string; taskIds: string[]; to: string }
  | { type: "contribute_goal"; label: string; goalId: string; cents: number }
  | { type: "open"; label: string; href: string }
  | { type: "ask"; label: string; prompt: string }
  | { type: "consent"; label: string }
  | { type: "answer"; label: string; key: string; choices: string[] }
  | { type: "promise_check"; label: string; promiseId: string; choices: string[] };

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  /** 'demo' accounts hold sample data only and are labelled throughout the UI. */
  accountKind: text("account_kind").$type<"standard" | "demo">().notNull().default("standard"),
  preferences: jsonb("preferences").$type<UserPreferences>().notNull().default({}),
  /** Authenticator-app (TOTP) secret, AES-GCM encrypted. Set while setting up; active once totpEnabledAt is set. */
  totpSecret: text("totp_secret"),
  totpEnabledAt: tstz("totp_enabled_at"),
  /** Set when a password reset is used. Email sign-in codes stay off until a sign-in with the authenticator, a backup code or a passkey (ADR 0009 addendum). */
  emailCodesBlockedAt: tstz("email_codes_blocked_at"),
  /** Last accepted 30-second time step, so a code can't be used twice. */
  totpLastStep: integer("totp_last_step"),
  /** Random part of the personal forwarding address (u-<token>@<INBOX_DOMAIN>). */
  inboxToken: text("inbox_token").unique(),
  /** Verified phone (E.164) the user texts Jarvis from. Unique: one account per number. */
  smsPhone: text("sms_phone").unique(),
  /** "pro" while a paid subscription is active (Stripe webhook keeps it in sync). */
  plan: text("plan").$type<"free" | "pro">().notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  /** Random code in this person's invite link (/?invite=<code>). Made the first time they open Invite friends. */
  inviteCode: text("invite_code").unique(),
  /** Who invited this person, when they signed up from an invite link. */
  invitedBy: uuid("invited_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  /** Set by the owner (admin page). A suspended user can't sign in and their sessions stop working; data is kept. */
  suspendedAt: tstz("suspended_at"),
  /**
   * App access before launch (owner, 2026-11-11; docs/backlog/2026-11-11-audit-and-waitlist.md): "waiting" until the
   * owner accepts them in HQ, then "in". It only matters while `app_access.waitlist_on` is set, and it never changes `plan`.
   */
  access: text("access").$type<"waiting" | "in">().notNull().default("waiting"),
  /** Place in the queue: sign-up order (new accounts at the end), then referral moves. Unique, checked at the end of each statement so two places can swap. */
  waitlistRank: bigint("waitlist_rank", { mode: "number" })
    .notNull()
    .default(sql`nextval('waitlist_rank_seq')`),
  /** Optional public nickname shown on the waitlist's front of the line (null = the anonymous skyling label). Rules in lib/nickname.ts. */
  waitlistNickname: text("waitlist_nickname"),
  /** When the owner let this person in. */
  acceptedAt: tstz("accepted_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** One row: whether the waitlist is closing the app (the owner's switch in HQ, off until he flips it) and the tentative launch line. */
export const appAccess = pgTable("app_access", {
  id: text("id").primaryKey().default("app"),
  waitlistOn: boolean("waitlist_on").notNull().default(false),
  /** Shown on the waitlist page, e.g. "We're aiming for the App Store in January 2027." Tentative, set by the owner. */
  launchNote: text("launch_note"),
  updatedByEmail: text("updated_by_email"),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the random session token; the raw token only lives in the cookie. */
    id: text("id").primaryKey(),
    userId: userRef(),
    expiresAt: tstz("expires_at").notNull(),
    createdAt: createdAt(),
    lastSeenAt: tstz("last_seen_at").notNull().defaultNow(),
    userAgent: text("user_agent"),
    /** Last Face ID / Touch ID unlock of Money in this session (sliding while Money is in use). */
    moneyUnlockedAt: tstz("money_unlocked_at"),
    /** Started without a second step (a remembered phone, or Google): never enough for /admin (ADR 0009 addendum, 2026-11-10). */
    secondStepSkipped: boolean("second_step_skipped").notNull().default(false),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** "Remember this phone for 30 days": only the SHA-256 of the cookie's token is stored. Read before a session exists, so no RLS (like sessions). */
export const rememberedDevices = pgTable(
  "remembered_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    expiresAt: tstz("expires_at").notNull(),
    lastUsedAt: tstz("last_used_at").notNull().defaultNow(),
  },
  (t) => [index("remembered_devices_user_idx").on(t.userId)],
);

/** One-time backup codes for two-step sign-in. Only SHA-256 hashes are stored. Used before a session exists, so no RLS (like sessions). */
export const recoveryCodes = pgTable(
  "recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    codeHash: text("code_hash").notNull(),
    usedAt: tstz("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("recovery_codes_user_idx").on(t.userId)],
);

/**
 * Passkeys (WebAuthn): only the public key is stored; the private key never
 * leaves the person's device (Face ID / Touch ID / Android screen lock).
 * Looked up before a session exists, so no RLS (like sessions).
 */
export const passkeys = pgTable(
  "passkeys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    /** base64url credential id from the authenticator. */
    credentialId: text("credential_id").notNull(),
    /** base64url COSE public key. */
    publicKey: text("public_key").notNull(),
    counter: bigint("counter", { mode: "number" }).notNull().default(0),
    transports: jsonb("transports").$type<string[]>().notNull().default([]),
    deviceType: text("device_type"),
    backedUp: boolean("backed_up").notNull().default(false),
    name: text("name").notNull(),
    createdAt: createdAt(),
    lastUsedAt: tstz("last_used_at"),
  },
  (t) => [uniqueIndex("passkeys_credential_uq").on(t.credentialId), index("passkeys_user_idx").on(t.userId)],
);

/**
 * Single-use server challenges for passkeys and Sign in with Apple. The cookie
 * holds a random token; only its hash is stored. Deleted when used.
 */
export const authChallenges = pgTable(
  "auth_challenges",
  {
    id: text("id").primaryKey(),
    purpose: text("purpose").$type<"passkey-register" | "passkey-login" | "passkey-unlock" | "apple" | "google" | "oauth-link">().notNull(),
    challenge: text("challenge").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    expiresAt: tstz("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("auth_challenges_expires_idx").on(t.expiresAt)],
);

/** Sign in with Apple or Google: the provider's stable user id, linked to one account. */
export const oauthIdentities = pgTable(
  "oauth_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    provider: text("provider").$type<"apple" | "google">().notNull(),
    subject: text("subject").notNull(),
    email: text("email"),
    /** Apple "Hide My Email" relay address. */
    isPrivateEmail: boolean("is_private_email").notNull().default(false),
    /** Apple's refresh token, AES-GCM encrypted (encryptSecret). Only used to revoke Apple access on delete or unlink. */
    encryptedRefreshToken: text("encrypted_refresh_token"),
    createdAt: createdAt(),
    lastUsedAt: tstz("last_used_at"),
  },
  (t) => [uniqueIndex("oauth_identities_provider_subject_uq").on(t.provider, t.subject), index("oauth_identities_user_idx").on(t.userId)],
);

/** "Forgot password" links. Only the SHA-256 of the emailed token is stored; one use, one hour. */
export const passwordResets = pgTable(
  "password_resets",
  {
    id: text("id").primaryKey(),
    userId: userRef(),
    expiresAt: tstz("expires_at").notNull(),
    usedAt: tstz("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("password_resets_user_idx").on(t.userId)],
);

/** Password accepted, waiting for the second step. The raw token lives in a short-lived cookie; only its hash is stored. */
export const loginChallenges = pgTable(
  "login_challenges",
  {
    id: text("id").primaryKey(),
    userId: userRef(),
    expiresAt: tstz("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    /** "Email me a code" (owner, 2026-11-06): hash of the emailed 6-digit code, bound to this challenge; single use. */
    emailCodeHash: text("email_code_hash"),
    emailCodeExpiresAt: tstz("email_code_expires_at"),
    emailSends: integer("email_sends").notNull().default(0),
    /** How the first step was passed. Email codes are offered only after the password ("oauth" = Google or Apple). */
    firstFactor: text("first_factor").$type<"password" | "oauth">(),
    createdAt: createdAt(),
  },
  (t) => [index("login_challenges_user_idx").on(t.userId)],
);

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").notNull(),
    windowStart: tstz("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

/**
 * Crashes and failed requests, grouped by kind (fingerprint) with a count, so the owner
 * hears about new problems (error-reports.ts). Not tied to a user and never holds
 * personal details: messages are scrubbed of emails, numbers and ids before saving.
 */
export const errorReports = pgTable("error_reports", {
  fingerprint: text("fingerprint").primaryKey(),
  source: text("source").$type<"server" | "client">().notNull(),
  route: text("route").notNull(),
  message: text("message").notNull(),
  digest: text("digest"),
  count: integer("count").notNull().default(1),
  firstSeenAt: tstz("first_seen_at").notNull().defaultNow(),
  lastSeenAt: tstz("last_seen_at").notNull().defaultNow(),
});

/**
 * What the owner did on the admin page (ADR 0022). About accounts, not their content, so no RLS (like users and
 * sessions). Emails are snapshots so the log stays readable after a user is deleted. Never put secrets in metadata.
 */
export const adminActions = pgTable(
  "admin_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    targetUserId: uuid("target_user_id"),
    targetEmail: text("target_email"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("admin_actions_created_idx").on(t.createdAt)],
);

/** Beta feedback from Settings → Send feedback; also emailed to the owner (services/feedback.ts). */
export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    kind: text("kind").$type<"bug" | "idea" | "other">().notNull(),
    message: text("message").notNull(),
    emailedAt: tstz("emailed_at"),
    createdAt: createdAt(),
  },
  () => [ownerPolicy()],
);

/**
 * Feedback addressed to the owner: a copy of each Settings → Send feedback message, read on the admin page
 * (like the email the owner also gets). Not per-user private data, so no RLS (like error_reports). ADR 0022.
 */
export const ownerInbox = pgTable(
  "owner_inbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    senderUserId: uuid("sender_user_id").references(() => users.id, { onDelete: "set null" }),
    senderName: text("sender_name").notNull(),
    senderEmail: text("sender_email").notNull(),
    kind: text("kind").$type<"bug" | "idea" | "other">().notNull(),
    message: text("message").notNull(),
    emailedAt: tstz("emailed_at"),
    handledAt: tstz("handled_at"),
    createdAt: createdAt(),
  },
  (t) => [index("owner_inbox_created_idx").on(t.createdAt)],
);

/** A banner the owner shows to everyone in the app (admin page). Not per-user, so no RLS. */
export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    message: text("message").notNull(),
    tone: text("tone").$type<"info" | "warning">().notNull().default("info"),
    linkUrl: text("link_url"),
    startsAt: tstz("starts_at").notNull().defaultNow(),
    endsAt: tstz("ends_at"),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("announcements_window_idx").on(t.startsAt, t.endsAt)],
);

export const MILESTONE_CATEGORIES = ["school", "work", "money", "health", "travel", "family", "personal"] as const;
export type MilestoneCategory = (typeof MILESTONE_CATEGORIES)[number];

/** Things the user has done ("Graduated high school", "First job"). Reached goals are shown beside them, not copied. */
export const lifeMilestones = pgTable(
  "life_milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    title: text("title").notNull(),
    category: text("category").$type<MilestoneCategory>().notNull().default("personal"),
    /** When it happened; with precision "year" only the year is meant (stored as Jan 1). */
    happenedOn: date("happened_on", { mode: "string" }),
    precision: text("precision").$type<"day" | "month" | "year">().notNull().default("day"),
    note: text("note"),
    source: text("source").$type<"user" | "jarvis" | "import">().notNull().default("user"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("life_milestones_user_idx").on(t.userId, t.happenedOn), ownerPolicy()],
);

/** Goals that aren't about money ("Run a 5K", "Read 12 books"). Money goals are financialGoals. */
export const personalGoals = pgTable(
  "personal_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    title: text("title").notNull(),
    /** Optional measure: 12 (books). Without it, the goal is simply done or not. */
    target: integer("target"),
    progress: integer("progress").notNull().default(0),
    unit: text("unit"),
    targetDate: date("target_date", { mode: "string" }),
    doneAt: tstz("done_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [ownerPolicy()],
);

/**
 * "How did you work toward your goal today?" One line per answer, for a personal or a money goal.
 * A money check-in with an amount also records a contribution; a measured personal goal can move its progress.
 */
export const goalCheckins = pgTable(
  "goal_checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    goalKind: text("goal_kind").$type<"personal" | "money">().notNull(),
    goalId: uuid("goal_id").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    note: text("note").notNull(),
    amountCents: integer("amount_cents"),
    progress: integer("progress"),
    createdAt: createdAt(),
  },
  (t) => [ownerPolicy(), index("goal_checkins_goal_idx").on(t.userId, t.goalId, t.date)],
);

/**
 * Things the user said they would do ("I'll study tonight"). The skyling checks back once, at the due time.
 * A promise is only ever kept or broken by the user's own answer, or by a to-do they really finished (taskId);
 * an unanswered one is dropped after a week and never counts as broken.
 */
export const promises = pgTable(
  "promises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    text: text("text").notNull(),
    /** When the skyling checks back. */
    dueAt: tstz("due_at").notNull(),
    status: text("status").$type<"open" | "kept" | "broken" | "dropped">().notNull().default("open"),
    /** A to-do this promise is about: finishing it keeps the promise without asking. */
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    /** How many times it was moved to a later day (at most 2). */
    moves: integer("moves").notNull().default(0),
    resolvedAt: tstz("resolved_at"),
    resolvedBy: text("resolved_by").$type<"you" | "task" | "timeout">(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("promises_user_status_idx").on(t.userId, t.status, t.dueAt), ownerPolicy()],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    actor: text("actor").$type<"user" | "jarvis" | "system">().notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_user_created_idx").on(t.userId, t.createdAt), ownerPolicy()],
);

// ---------------------------------------------------------------------------
// integrations & sync

export type IntegrationProvider = "plaid" | "canvas" | "ukg" | "google" | "google_calendar" | "gmail" | "outlook" | "apple_health";
export type IntegrationStatus = "connected" | "error" | "pending" | "disconnected";

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    provider: text("provider").$type<IntegrationProvider>().notNull(),
    status: text("status").$type<IntegrationStatus>().notNull().default("pending"),
    displayName: text("display_name"),
    /** Provider-side identifier, e.g. a Plaid item_id or Canvas base URL. */
    externalId: text("external_id"),
    /** AES-256-GCM ciphertext (see server/crypto.ts). Never returned to the client. */
    encryptedCredentials: text("encrypted_credentials"),
    scopes: text("scopes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    lastSyncedAt: tstz("last_synced_at"),
    lastError: text("last_error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("integrations_user_provider_ext_uq").on(t.userId, t.provider, t.externalId), ownerPolicy()],
);

/**
 * Gmail metadata cached for the skyling's current context.  Message bodies
 * stay in Gmail and are fetched only when the user or assistant needs one.
 */
export const gmailMessages = pgTable(
  "gmail_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    gmailMessageId: text("gmail_message_id").notNull(),
    threadId: text("thread_id").notNull(),
    fromAddress: text("from_address").notNull(),
    subject: text("subject").notNull(),
    snippet: text("snippet").notNull(),
    receivedAt: tstz("received_at").notNull(),
    unread: boolean("unread").notNull().default(false),
    labels: text("labels")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    syncedAt: tstz("synced_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("gmail_messages_user_message_uq").on(t.userId, t.gmailMessageId),
    index("gmail_messages_user_received_idx").on(t.userId, t.receivedAt),
    ownerPolicy(),
  ],
);

/**
 * Which user owns which connection, for work that starts without a signed-in
 * user (provider webhooks and the nightly sync). Holds no secrets and no
 * personal data, so it has no RLS (like sessions); every read is followed by
 * withUser(userId) for the actual work.
 */
export const connectionRegistry = pgTable(
  "connection_registry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    provider: text("provider").$type<IntegrationProvider>().notNull(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    /** Provider-side id (e.g. Plaid item_id), used to route webhooks. */
    externalId: text("external_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("conn_registry_integration_uq").on(t.integrationId), index("conn_registry_external_idx").on(t.provider, t.externalId)],
);

export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    integrationId: uuid("integration_id").references(() => integrations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").$type<"queued" | "running" | "succeeded" | "failed">().notNull().default("queued"),
    cursor: text("cursor"),
    stats: jsonb("stats").$type<Record<string, number>>().notNull().default({}),
    error: text("error"),
    startedAt: tstz("started_at"),
    finishedAt: tstz("finished_at"),
    createdAt: createdAt(),
  },
  (t) => [index("sync_jobs_user_idx").on(t.userId, t.createdAt), ownerPolicy()],
);

// ---------------------------------------------------------------------------
// finance

export type DataSource = "manual" | "jarvis" | "import" | "demo" | "plaid" | "canvas" | "ukg" | "google" | "outlook" | "apple_health" | "schedule";

/** Regular hours for a job (e.g. full-time Mon–Fri 08:00–17:00). Days are 0 = Sunday … 6 = Saturday. */
export type WorkSchedule = { days: number[]; start: string; end: string; breakMinutes?: number; breakRules?: BreakRule[] };

/**
 * Unpaid lunch by shift length: a shift of at least `minShiftMinutes` gets `unpaidMinutes` unpaid (the largest matching rule wins).
 * Lives in the job's `schedule` jsonb. A job with a break rule but no regular hours stores `days: []`.
 */
export type BreakRule = { minShiftMinutes: number; unpaidMinutes: number };

export type AccountType = "depository" | "credit" | "loan" | "investment" | "cash" | "other";

export const financialAccounts = pgTable(
  "financial_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    integrationId: uuid("integration_id").references(() => integrations.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    officialName: text("official_name"),
    type: text("type").$type<AccountType>().notNull(),
    subtype: text("subtype"),
    institutionName: text("institution_name"),
    mask: text("mask"),
    /** For credit/loan accounts this is the amount owed (positive). */
    currentBalanceCents: cents("current_balance_cents").notNull().default(0),
    availableBalanceCents: cents("available_balance_cents"),
    creditLimitCents: cents("credit_limit_cents"),
    currency: text("currency").notNull().default("USD"),
    source: text("source").$type<DataSource>().notNull().default("manual"),
    providerAccountId: text("provider_account_id"),
    includeInNetWorth: boolean("include_in_net_worth").notNull().default(true),
    /** Debts: yearly interest rate in basis points (24.99% = 2499), minimum payment and next due date. */
    aprBps: integer("apr_bps"),
    minPaymentCents: cents("min_payment_cents"),
    nextPaymentDueDate: date("next_payment_due_date", { mode: "string" }),
    balanceUpdatedAt: tstz("balance_updated_at").notNull().defaultNow(),
    archivedAt: tstz("archived_at"),
    /** The user turned this bank account off in LifeFlow: syncs keep it hidden and skip its transactions. */
    excludedAt: tstz("excluded_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("fin_accounts_user_idx").on(t.userId),
    uniqueIndex("fin_accounts_provider_uq")
      .on(t.userId, t.source, t.providerAccountId)
      .where(sql`provider_account_id is not null`),
    ownerPolicy(),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, { onDelete: "set null" }),
    kind: text("kind").$type<"expense" | "income" | "transfer">().notNull().default("expense"),
    color: text("color"),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("categories_user_name_uq").on(t.userId, t.name), ownerPolicy()],
);

/**
 * How a transaction affects cash-flow math (see services/finance/cashflow.ts):
 * income            counts as income
 * expense           counts as spending
 * refund/reimbursement  offsets spending (not income)
 * transfer          moves between own accounts: excluded from income and spending
 * investment        contributions/withdrawals: reported separately
 * adjustment        balance corrections: excluded
 */
export type TransactionKind = "income" | "expense" | "transfer" | "refund" | "reimbursement" | "investment" | "adjustment";

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    authorizedDate: date("authorized_date", { mode: "string" }),
    description: text("description").notNull(),
    merchantName: text("merchant_name"),
    amountCents: cents("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    kind: text("kind").$type<TransactionKind>().notNull(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    pending: boolean("pending").notNull().default(false),
    source: text("source").$type<DataSource>().notNull().default("manual"),
    providerTransactionId: text("provider_transaction_id"),
    /** Plaid: the pending transaction this posted transaction replaces. */
    pendingTransactionId: text("pending_transaction_id"),
    notes: text("notes"),
    excluded: boolean("excluded").notNull().default(false),
    /** The vendor/category tidy version that last went over this row (see TIDY_VERSION); 0 = never. */
    tidyVersion: integer("tidy_version").notNull().default(0),
    /** Tidied without the AI while its vendor was still unknown or messy: the AI pass should look at it once allowed. */
    tidyAiPending: boolean("tidy_ai_pending").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("transactions_user_date_idx").on(t.userId, t.date),
    index("transactions_account_idx").on(t.accountId),
    index("transactions_category_idx").on(t.categoryId),
    uniqueIndex("transactions_provider_uq")
      .on(t.userId, t.providerTransactionId)
      .where(sql`provider_transaction_id is not null`),
    ownerPolicy(),
  ],
);

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    /** First day of the month, YYYY-MM-01. */
    month: date("month", { mode: "string" }).notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    limitCents: cents("limit_cents").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("budgets_user_month_cat_uq").on(t.userId, t.month, t.categoryId), ownerPolicy()],
);

export type Frequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export const recurringItems = pgTable(
  "recurring_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    name: text("name").notNull(),
    merchantKey: text("merchant_key"),
    /** Signed like transactions: negative = bill/subscription, positive = income. */
    amountCents: cents("amount_cents").notNull(),
    frequency: text("frequency").$type<Frequency>().notNull(),
    nextDueDate: date("next_due_date", { mode: "string" }),
    kind: text("kind").$type<"bill" | "subscription" | "income" | "other">().notNull(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    accountId: uuid("account_id").references(() => financialAccounts.id, { onDelete: "set null" }),
    status: text("status").$type<"active" | "paused" | "cancelled">().notNull().default("active"),
    source: text("source").$type<DataSource | "detected">().notNull().default("manual"),
    /** What the user told Jarvis: still using it or not. */
    usage: text("usage").$type<"using" | "not_using">(),
    /** A free trial that turns paid on this date. */
    trialEndsOn: date("trial_ends_on", { mode: "string" }),
    keptAt: tstz("kept_at"),
    /** Earlier prices, newest last: `amountCents` was charged until `until` (the date a price change took over). Signed like amountCents. */
    priceHistory: jsonb("price_history").$type<{ amountCents: number; until: string }[]>().notNull().default([]),
    /** Official cancellation steps found by a live web search (answer + cited sources). */
    cancelHelp: jsonb("cancel_help").$type<{ answer: string; sources: { title: string; url: string }[]; at: string } | null>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("recurring_user_idx").on(t.userId), ownerPolicy()],
);

export type GoalPurpose = "emergency" | "travel" | "car" | "home" | "debt" | "investing" | "education" | "big_purchase" | "other";

export const financialGoals = pgTable(
  "financial_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    name: text("name").notNull(),
    targetCents: cents("target_cents").notNull(),
    savedCents: cents("saved_cents").notNull().default(0),
    targetDate: date("target_date", { mode: "string" }),
    accountId: uuid("account_id").references(() => financialAccounts.id, { onDelete: "set null" }),
    kind: text("kind").$type<"savings" | "debt" | "investment">().notNull().default("savings"),
    status: text("status").$type<"active" | "achieved" | "archived">().notNull().default("active"),
    /** What the goal is for (emergency fund, travel, car...), used for icons and advice. */
    purpose: text("purpose").$type<GoalPurpose>().notNull().default("other"),
    /** The monthly amount the user plans to put toward it. */
    monthlyPlanCents: cents("monthly_plan_cents"),
    /** Highest milestone (25/50/75/100) already celebrated, so each is celebrated once. */
    celebratedPercent: integer("celebrated_percent").notNull().default(0),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("goals_user_idx").on(t.userId), ownerPolicy()],
);

/** Money the user set aside toward a goal. LifeFlow records it; it never moves money. */
export const goalContributions = pgTable(
  "goal_contributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => financialGoals.id, { onDelete: "cascade" }),
    amountCents: cents("amount_cents").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    note: text("note"),
    source: text("source").$type<DataSource>().notNull().default("manual"),
    createdAt: createdAt(),
  },
  (t) => [index("goal_contrib_goal_idx").on(t.goalId, t.date), ownerPolicy()],
);

/** Learned from the user's corrections: transactions from this merchant go to this category. */
export const categoryRules = pgTable(
  "category_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    merchantKey: text("merchant_key").notNull(),
    /** Display name of the merchant, for the rules list. */
    label: text("label").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    kind: text("kind").$type<TransactionKind>(),
    hits: integer("hits").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("category_rules_user_merchant_uq").on(t.userId, t.merchantKey), ownerPolicy()],
);

/** One row per day the user's balances were seen, for the net worth trend. */
export const netWorthSnapshots = pgTable(
  "net_worth_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    day: date("day", { mode: "string" }).notNull(),
    netWorthCents: cents("net_worth_cents").notNull(),
    cashCents: cents("cash_cents").notNull(),
    savingsCents: cents("savings_cents").notNull(),
    investmentsCents: cents("investments_cents").notNull(),
    debtCents: cents("debt_cents").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("net_worth_user_day_uq").on(t.userId, t.day), ownerPolicy()],
);

export const holdings = pgTable(
  "holdings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "cascade" }),
    symbol: text("symbol"),
    name: text("name").notNull(),
    securityType: text("security_type").$type<"equity" | "etf" | "mutual_fund" | "crypto" | "bond" | "cash" | "other">().notNull().default("other"),
    quantity: numeric("quantity", { precision: 24, scale: 8 }).notNull(),
    valueCents: cents("value_cents").notNull(),
    costBasisCents: cents("cost_basis_cents"),
    /** Fund expense ratio in basis points (0.03% = 3), when known. */
    expenseRatioBps: integer("expense_ratio_bps"),
    source: text("source").$type<DataSource>().notNull().default("manual"),
    providerSecurityId: text("provider_security_id"),
    asOf: tstz("as_of").notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("holdings_account_idx").on(t.accountId), ownerPolicy()],
);

// ---------------------------------------------------------------------------
// projects, school, calendar, tasks, notes

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").$type<"active" | "paused" | "completed" | "archived">().notNull().default("active"),
    color: text("color"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("projects_user_idx").on(t.userId), ownerPolicy()],
);

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    name: text("name").notNull(),
    code: text("code"),
    term: text("term"),
    instructorName: text("instructor_name"),
    instructorEmail: text("instructor_email"),
    location: text("location"),
    /** Free-form meeting info shown on the course page, e.g. "Mon/Wed 10:00-11:15 AM". */
    meetingInfo: text("meeting_info"),
    /** Percent weight per assignment kind from the syllabus, e.g. { exam: 40, assignment: 30 }. */
    gradeWeights: jsonb("grade_weights").$type<Record<string, number>>(),
    color: text("color"),
    url: text("url"),
    source: text("source").$type<DataSource>().notNull().default("manual"),
    providerCourseId: text("provider_course_id"),
    archivedAt: tstz("archived_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("courses_user_idx").on(t.userId),
    uniqueIndex("courses_provider_uq")
      .on(t.userId, t.source, t.providerCourseId)
      .where(sql`provider_course_id is not null`),
    ownerPolicy(),
  ],
);

export type AssignmentKind = "assignment" | "exam" | "quiz" | "project" | "reading" | "lab" | "discussion" | "other";
export type WorkStatus = "todo" | "in_progress" | "done";

export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    kind: text("kind").$type<AssignmentKind>().notNull().default("assignment"),
    dueAt: tstz("due_at"),
    /** True when only a date (no time) is known; dueAt is then end-of-day local time. */
    dueAllDay: boolean("due_all_day").notNull().default(false),
    status: text("status").$type<WorkStatus>().notNull().default("todo"),
    completedAt: tstz("completed_at"),
    pointsPossible: numeric("points_possible", { precision: 10, scale: 2 }),
    grade: text("grade"),
    url: text("url"),
    source: text("source").$type<DataSource>().notNull().default("manual"),
    /** Human-readable provenance, e.g. "syllabus screenshot" or a Canvas URL. */
    sourceRef: text("source_ref"),
    providerAssignmentId: text("provider_assignment_id"),
    /** course + normalized title + local due date; prevents duplicate imports. */
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("assignments_user_due_idx").on(t.userId, t.dueAt),
    index("assignments_course_idx").on(t.courseId),
    uniqueIndex("assignments_dedupe_uq").on(t.userId, t.dedupeKey),
    ownerPolicy(),
  ],
);

export const courseMaterials = pgTable(
  "course_materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    module: text("module"),
    kind: text("kind").$type<"link" | "file" | "page" | "video" | "other">().notNull().default("link"),
    url: text("url"),
    source: text("source").$type<DataSource>().notNull().default("manual"),
    createdAt: createdAt(),
  },
  (t) => [index("materials_course_idx").on(t.courseId), ownerPolicy()],
);

export type EventKind = "personal" | "class" | "exam" | "work" | "study" | "appointment" | "reminder" | "other";
export type Recurrence = {
  freq: "daily" | "weekly";
  /** 0 = Sunday ... 6 = Saturday (weekly only). */
  byDay?: number[];
  /** Inclusive local end date YYYY-MM-DD. */
  until?: string;
  interval?: number;
  /** Single occurrences removed from the series (local dates); changed ones are separate events. */
  skip?: string[];
};

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    startsAt: tstz("starts_at").notNull(),
    endsAt: tstz("ends_at").notNull(),
    allDay: boolean("all_day").notNull().default(false),
    kind: text("kind").$type<EventKind>().notNull().default("personal"),
    recurrence: jsonb("recurrence").$type<Recurrence>(),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
    source: text("source").$type<DataSource>().notNull().default("manual"),
    providerEventId: text("provider_event_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("events_user_start_idx").on(t.userId, t.startsAt),
    // One row per provider event (nulls stay distinct, so manual events are unaffected). Syncs upsert on this key.
    uniqueIndex("events_user_source_provider_uq").on(t.userId, t.source, t.providerEventId),
    ownerPolicy(),
  ],
);

export type Priority = "low" | "medium" | "high" | "urgent";

export type TaskRepeat = "daily" | "weekdays" | "weekly" | "biweekly" | "monthly";

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    title: text("title").notNull(),
    notes: text("notes"),
    status: text("status").$type<WorkStatus>().notNull().default("todo"),
    priority: text("priority").$type<Priority>().notNull().default("medium"),
    dueAt: tstz("due_at"),
    dueAllDay: boolean("due_all_day").notNull().default(false),
    parentId: uuid("parent_id").references((): AnyPgColumn => tasks.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
    completedAt: tstz("completed_at"),
    /** Repeating to-dos: completing one creates the next occurrence. */
    repeat: text("repeat").$type<TaskRepeat>(),
    /** When to send a reminder notification, and when it was sent. */
    remindAt: tstz("remind_at"),
    remindedAt: tstz("reminded_at"),
    source: text("source").$type<DataSource>().notNull().default("manual"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tasks_user_status_idx").on(t.userId, t.status),
    index("tasks_parent_idx").on(t.parentId),
    index("tasks_remind_idx")
      .on(t.remindAt)
      .where(sql`reminded_at is null`),
    ownerPolicy(),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
    pinned: boolean("pinned").notNull().default(false),
    source: text("source").$type<DataSource>().notNull().default("manual"),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL => sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(body, '')), 'B')`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("notes_user_idx").on(t.userId, t.updatedAt), index("notes_search_idx").using("gin", t.searchVector), ownerPolicy()],
);

// ---------------------------------------------------------------------------
// work

export const employers = pgTable(
  "employers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    name: text("name").notNull(),
    position: text("position"),
    payType: text("pay_type").$type<"hourly" | "salary">().notNull().default("hourly"),
    hourlyRateCents: cents("hourly_rate_cents"),
    annualSalaryCents: cents("annual_salary_cents"),
    overtimeThresholdHours: numeric("overtime_threshold_hours", { precision: 5, scale: 2 }).notNull().default("40"),
    overtimeMultiplier: numeric("overtime_multiplier", { precision: 4, scale: 2 }).notNull().default("1.5"),
    color: text("color"),
    /** Regular hours; shifts are filled in a few weeks ahead from these. */
    schedule: jsonb("schedule").$type<WorkSchedule>(),
    /** Last day already filled from `schedule`, so a deleted day isn't put back. */
    scheduleFilledThrough: date("schedule_filled_through", { mode: "string" }),
    source: text("source").$type<DataSource>().notNull().default("manual"),
    archivedAt: tstz("archived_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("employers_user_idx").on(t.userId), ownerPolicy()],
);

/**
 * Scheduled shift times (startsAt/endsAt) are kept separate from recorded
 * punches (recordedStart/recordedEnd). Wage estimates never touch paychecks,
 * and paychecks are linked to—not derived from—bank deposits.
 */
export const workShifts = pgTable(
  "work_shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    employerId: uuid("employer_id")
      .notNull()
      .references(() => employers.id, { onDelete: "cascade" }),
    startsAt: tstz("starts_at").notNull(),
    endsAt: tstz("ends_at").notNull(),
    breakMinutes: integer("break_minutes").notNull().default(0),
    breakPaid: boolean("break_paid").notNull().default(false),
    recordedStart: tstz("recorded_start"),
    recordedEnd: tstz("recorded_end"),
    status: text("status").$type<"scheduled" | "worked" | "cancelled">().notNull().default("scheduled"),
    notes: text("notes"),
    source: text("source").$type<DataSource>().notNull().default("manual"),
    providerShiftId: text("provider_shift_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("shifts_user_start_idx").on(t.userId, t.startsAt), ownerPolicy()],
);

export const paychecks = pgTable(
  "paychecks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    employerId: uuid("employer_id")
      .notNull()
      .references(() => employers.id, { onDelete: "cascade" }),
    payDate: date("pay_date", { mode: "string" }).notNull(),
    periodStart: date("period_start", { mode: "string" }),
    periodEnd: date("period_end", { mode: "string" }),
    grossCents: cents("gross_cents"),
    netCents: cents("net_cents").notNull(),
    hours: numeric("hours", { precision: 7, scale: 2 }),
    transactionId: uuid("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
    source: text("source").$type<DataSource>().notNull().default("manual"),
    createdAt: createdAt(),
  },
  (t) => [index("paychecks_user_idx").on(t.userId, t.payDate), ownerPolicy()],
);

// ---------------------------------------------------------------------------
// Jarvis

export type JarvisModule = "home" | "finances" | "wealth" | "school" | "work" | "calendar" | "tasks" | "notes" | "settings";

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    title: text("title").notNull().default("New conversation"),
    contextModule: text("context_module").$type<JarvisModule>(),
    archivedAt: tstz("archived_at"),
    lastMessageAt: tstz("last_message_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("conversations_user_idx").on(t.userId, t.lastMessageAt), ownerPolicy()],
);

export type ToolResultRecord = { ok: boolean; data?: unknown; error?: string };

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Monotonic ordering within a conversation. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    userId: userRef(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant" | "tool">().notNull(),
    content: text("content").notNull().default(""),
    toolName: text("tool_name"),
    toolCallId: text("tool_call_id"),
    toolArgs: jsonb("tool_args").$type<Record<string, unknown>>(),
    toolResult: jsonb("tool_result").$type<ToolResultRecord>(),
    status: text("status").$type<"complete" | "error" | "pending_confirmation">().notNull().default("complete"),
    attachmentIds: uuid("attachment_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    /** The id the app made for this send. The same send arriving twice (a retry) never starts a second turn, and Stop finds its turn by it. */
    clientMessageId: uuid("client_message_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_conversation_idx").on(t.conversationId, t.seq),
    uniqueIndex("messages_client_message_uq").on(t.userId, t.clientMessageId),
    ownerPolicy(),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    /** Base64 payload. Small files only (see MAX_ATTACHMENT_BYTES). */
    dataBase64: text("data_base64").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("attachments_user_idx").on(t.userId), ownerPolicy()],
);

export type MemoryCategory = "preference" | "goal" | "routine" | "project" | "fact" | "temporary" | "instruction";
/**
 * proposed → the user hasn't approved it yet (never shown to the model);
 * active → approved and in use; archived → forgotten or replaced (restorable);
 * rejected → the user dismissed the suggestion (kept so it isn't re-suggested).
 */
export type MemoryStatus = "proposed" | "active" | "archived" | "rejected";
/** stated: the user said it. inferred: Jarvis concluded it (the user still has to approve). */
export type MemoryBasis = "stated" | "inferred";

/** A text column stored encrypted (see crypto.ts sealText/openText). */
const sealedText = customType<{ data: string; driverData: string }>({
  dataType: () => "text",
  toDriver: (v) => sealText(v),
  fromDriver: (v) => openText(v),
});

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    /** Encrypted at rest (AES-256-GCM); services see plain text. */
    content: sealedText("content").notNull(),
    category: text("category").$type<MemoryCategory>().notNull(),
    source: text("source").$type<"user" | "jarvis">().notNull(),
    status: text("status").$type<MemoryStatus>().notNull().default("active"),
    basis: text("basis").$type<MemoryBasis>().notNull().default("stated"),
    /** When the user approved it (or added it themselves). Null while proposed. */
    confirmedAt: tstz("confirmed_at"),
    /** For corrections: the memory this one replaces once approved. */
    supersedesId: uuid("supersedes_id").references((): AnyPgColumn => memories.id, { onDelete: "set null" }),
    /** Conversation where Jarvis suggested or saved it. */
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    /** Temporary circumstances expire and stop being shown to Jarvis. */
    expiresAt: tstz("expires_at"),
    lastUsedAt: tstz("last_used_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("memories_user_idx").on(t.userId, t.status), ownerPolicy()],
);

// ---------------------------------------------------------------------------
// Health (Apple Health via the iOS Shortcut)

export type HealthMetric =
  "steps" | "active_energy_kcal" | "exercise_minutes" | "sleep_hours" | "resting_heart_rate" | "weight_kg" | "distance_km" | "mindful_minutes";

/** One value per metric per local day. Upserted, so re-sending a day replaces it. */
// ---------------------------------------------------------------------------
// Push notifications

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    deviceLabel: text("device_label"),
    createdAt: createdAt(),
    lastSuccessAt: tstz("last_success_at"),
  },
  (t) => [uniqueIndex("push_subs_endpoint_uq").on(t.endpoint), index("push_subs_user_idx").on(t.userId), ownerPolicy()],
);

/** One row per notification sent, so a reminder or alert is never sent twice. */
export const notificationLog = pgTable(
  "notification_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    /** e.g. "task:<id>:<remindAt>", "brief:2026-10-28", "bill:<id>:2026-11-01". */
    key: text("key").notNull(),
    title: text("title").notNull(),
    sentAt: tstz("sent_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notification_log_user_key_uq").on(t.userId, t.key), ownerPolicy()],
);

/**
 * The skyling's cloud (owner, 2026-11-11): one row per star or sun earned, so a count is real and each thing counts once.
 * A star is a class, shift or plan the skyling passed (claimed on Today) or a to-do or assignment ticked; a sun is a goal
 * reached or a milestone. `key` names the thing ("task:<id>", "sky:<agenda key>", "goal:<id>", "milestone:<id>"); undoing
 * it (an untick, a goal set back, a milestone deleted) deletes its row. Never anything private: only the kind and the key.
 */
export const skyRewards = pgTable(
  "sky_rewards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    kind: text("kind").$type<"star" | "sun">().notNull(),
    key: text("key").notNull(),
    earnedAt: tstz("earned_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sky_rewards_user_key_uq").on(t.userId, t.key), index("sky_rewards_user_kind_idx").on(t.userId, t.kind, t.earnedAt), ownerPolicy()],
);

// ---------------------------------------------------------------------------
// Proactive Jarvis: everything he says on his own, and how the user responded

export const jarvisMessages = pgTable(
  "jarvis_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    kind: text("kind").notNull(),
    topic: text("topic").$type<JarvisTopic | "general">().notNull(),
    /** Same situation, same key: never said twice. */
    dedupeKey: text("dedupe_key").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** The numbers behind the message, so it can be explained and re-rendered. */
    facts: jsonb("facts").$type<Record<string, unknown>>().notNull().default({}),
    action: jsonb("action").$type<ProactiveAction | null>(),
    priority: integer("priority").notNull().default(50),
    urgent: boolean("urgent").notNull().default(false),
    status: text("status").$type<"new" | "done" | "snoozed" | "dismissed" | "muted">().notNull().default("new"),
    rating: integer("rating"),
    snoozedUntil: tstz("snoozed_until"),
    actedAt: tstz("acted_at"),
    /** What "Do it" changed, and how to undo it. */
    result: jsonb("result").$type<{ text: string; undo?: Record<string, unknown>; undone?: boolean } | null>(),
    slot: text("slot"),
    pushedAt: tstz("pushed_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("jarvis_messages_key_uq").on(t.userId, t.dedupeKey), index("jarvis_messages_user_created_idx").on(t.userId, t.createdAt), ownerPolicy()],
);

// ---------------------------------------------------------------------------
// Savings finder: cheaper plans and better rates found with a live web search

export const savingsOpportunities = pgTable(
  "savings_opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    /** The bill or subscription it would replace (null for a card/loan rate). */
    recurringId: uuid("recurring_id").references(() => recurringItems.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => financialAccounts.id, { onDelete: "cascade" }),
    billName: text("bill_name").notNull(),
    category: text("category").$type<"phone" | "internet" | "insurance" | "streaming" | "credit_card" | "loan" | "other">().notNull(),
    currentMonthlyCents: integer("current_monthly_cents").notNull(),
    provider: text("provider").notNull(),
    plan: text("plan").notNull(),
    offerMonthlyCents: integer("offer_monthly_cents").notNull(),
    yearlySavingsCents: integer("yearly_savings_cents").notNull(),
    details: text("details"),
    sourceUrl: text("source_url").notNull(),
    sourceTitle: text("source_title").notNull(),
    status: text("status").$type<"found" | "acted" | "dismissed">().notNull().default("found"),
    searchedAt: tstz("searched_at").notNull(),
    actedAt: tstz("acted_at"),
    createdAt: createdAt(),
  },
  (t) => [index("savings_user_idx").on(t.userId), ownerPolicy()],
);

// ---------------------------------------------------------------------------
// Smart inbox: forwarded emails, uploads and shares, read and filed by Jarvis

export const inboxSenders = pgTable(
  "inbox_senders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    email: text("email").notNull(),
    verifiedAt: tstz("verified_at"),
    /** SHA-256 of the 6-digit code sent to the address. */
    codeHash: text("code_hash"),
    codeExpiresAt: tstz("code_expires_at"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("inbox_senders_user_email_uq").on(t.userId, t.email), ownerPolicy()],
);

export type InboxFiled = {
  /**
   * The `*_update` kinds changed a row that already existed instead of adding one (a bill's amount and due date, an
   * exam's date, a note on a bank transaction): Undo puts `prev` back and never deletes the row.
   */
  kind: "transaction" | "recurring" | "task" | "assignment" | "event" | "paycheck" | "recurring_update" | "assignment_update" | "transaction_note";
  id: string;
  label: string;
  href?: string;
  /** What the row held before an update (Undo restores it). */
  prev?: Record<string, unknown>;
  /** What the update wrote: Undo restores `prev` only while the row still holds this (a newer change is never thrown away). */
  next?: Record<string, unknown>;
  /** Set when Undo found the row changed by something else (Canvas, a hand edit): it is left as it is and Undo is no longer offered. */
  stale?: true;
  /** Set when the cleanup pointed this entry at the row that stayed after a merge (Undo of the merge removes it). */
  merged?: true;
};

export const inboxItems = pgTable(
  "inbox_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    /** Provider id (e.g. Gmail message id) so the same email is filed once. */
    externalId: text("external_id"),
    channel: text("channel").$type<"email" | "upload" | "share">().notNull(),
    fromAddress: text("from_address"),
    subject: text("subject"),
    receivedAt: tstz("received_at").notNull().defaultNow(),
    status: text("status")
      .$type<"processing" | "suggested" | "filed" | "needs_review" | "ignored" | "failed" | "undone" | "duplicate">()
      .notNull()
      .default("processing"),
    type: text("type"),
    summary: text("summary"),
    /** Why it wasn't filed (e.g. not from a verified address). */
    reason: text("reason"),
    filed: jsonb("filed").$type<InboxFiled[]>().notNull().default([]),
    extracted: jsonb("extracted").$type<Record<string, unknown> | null>(),
    attachmentIds: jsonb("attachment_ids").$type<string[]>().notNull().default([]),
    /** The email's own Message-ID header (no angle brackets): a forward that keeps it, and the same mail seen through Gmail, are one email. */
    messageId: text("message_id"),
    /** What the document says (type, payee or class, amount, date): a re-typed forward of a bill already filed has the same key. */
    contentSig: text("content_sig"),
    /** Set when status is "duplicate": the inbox item that already filed this. */
    duplicateOf: uuid("duplicate_of"),
    createdAt: createdAt(),
  },
  (t) => [
    index("inbox_items_user_idx").on(t.userId, t.receivedAt),
    index("inbox_items_message_idx")
      .on(t.userId, t.messageId)
      .where(sql`message_id is not null`),
    index("inbox_items_content_sig_idx")
      .on(t.userId, t.contentSig)
      .where(sql`content_sig is not null`),
    uniqueIndex("inbox_items_external_uq")
      .on(t.userId, t.externalId)
      .where(sql`external_id is not null`),
    ownerPolicy(),
  ],
);

// ---------------------------------------------------------------------------
// Habits: small repeatable steps with streaks

export const habits = pgTable(
  "habits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    title: text("title").notNull(),
    kind: text("kind").$type<"save" | "no_spend" | "study" | "custom">().notNull().default("custom"),
    cadence: text("cadence").$type<"daily" | "weekly" | "weekends" | "payday">().notNull().default("daily"),
    /** e.g. 1000 for "save $10"; minutes for study. */
    target: integer("target"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("habits_user_idx").on(t.userId), ownerPolicy()],
);

export const habitChecks = pgTable(
  "habit_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    done: boolean("done").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("habit_checks_day_uq").on(t.habitId, t.day), ownerPolicy()],
);

// ---------------------------------------------------------------------------
// Trash: deleted items, kept 30 days so every delete can be undone

export type TrashKind = "task" | "note" | "event" | "assignment" | "shift" | "transaction" | "goal" | "budget" | "course" | "project";

export const trash = pgTable(
  "trash",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    kind: text("kind").$type<TrashKind>().notNull(),
    /** What the user sees in the trash list, e.g. the task title. */
    label: text("label").notNull(),
    /** The deleted rows (and their children), keyed by table, exactly as they were. */
    payload: jsonb("payload").$type<Record<string, Record<string, unknown>[]>>().notNull(),
    deletedAt: tstz("deleted_at").notNull().defaultNow(),
  },
  (t) => [index("trash_user_deleted_idx").on(t.userId, t.deletedAt), ownerPolicy()],
);

export const healthSamples = pgTable(
  "health_samples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    metric: text("metric").$type<HealthMetric>().notNull(),
    day: date("day").notNull(),
    value: numeric("value", { mode: "number" }).notNull(),
    source: text("source").$type<DataSource>().notNull().default("apple_health"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("health_samples_user_metric_day_uq").on(t.userId, t.metric, t.day), ownerPolicy()],
);

/** Personal keys the iOS Shortcut uses to send Health data. Only SHA-256 hashes are stored. Looked up before a user context exists, so no RLS (like sessions). */
export const healthTokens = pgTable(
  "health_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    lastUsedAt: tstz("last_used_at"),
    revokedAt: tstz("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("health_tokens_hash_uq").on(t.tokenHash), index("health_tokens_user_idx").on(t.userId)],
);

export type JarvisRunOutcome = "ok" | "error" | "cancelled" | "step_limit";

/**
 * One row per Jarvis turn: what it cost and how it went. Metadata only (no
 * message content), so it can be analysed without reading conversations.
 */
export const jarvisRuns = pgTable(
  "jarvis_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    /** The turn's final assistant message, when there was one. */
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    model: text("model"),
    promptVersion: text("prompt_version").notNull(),
    outcome: text("outcome").$type<JarvisRunOutcome>().notNull(),
    /** Coarse failure class (e.g. "rate_limited", "network"), never raw error text. */
    errorKind: text("error_kind"),
    latencyMs: integer("latency_ms").notNull(),
    firstTokenMs: integer("first_token_ms"),
    steps: integer("steps").notNull(),
    toolCalls: integer("tool_calls").notNull().default(0),
    toolErrors: integer("tool_errors").notNull().default(0),
    confirmations: integer("confirmations").notNull().default(0),
    toolNames: text("tool_names")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    inputTokens: integer("input_tokens"),
    cachedInputTokens: integer("cached_input_tokens"),
    outputTokens: integer("output_tokens"),
    reasoningTokens: integer("reasoning_tokens"),
    /** Estimated cost in millionths of a dollar. Null unless model prices are configured. */
    costMicros: bigint("cost_micros", { mode: "number" }),
    /** Skills picked for this turn (skills/<name>/SKILL.md). */
    skills: text("skills")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** The user's 👍 (1) or 👎 (-1) on the answer. */
    rating: integer("rating"),
    /** Memories that were put in front of the model for this turn. */
    memoryIds: uuid("memory_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createdAt: createdAt(),
  },
  (t) => [index("jarvis_runs_user_created_idx").on(t.userId, t.createdAt), index("jarvis_runs_conversation_idx").on(t.conversationId), ownerPolicy()],
);

/**
 * A live voice call the server started (migration 0062): created when the one-time client secret is issued, bound to the user and the
 * conversation, short expiry. Tool calls from the browser are accepted only for a live row of their own user and conversation.
 */
export const voiceSessions = pgTable(
  "voice_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    expiresAt: tstz("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("voice_sessions_user_idx").on(t.userId, t.expiresAt), ownerPolicy()],
);

/** One row per voice tool call (session + the model's call id): the claim that makes a repeat return the first result instead of running again. */
export const voiceToolCalls = pgTable(
  "voice_tool_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => voiceSessions.id, { onDelete: "cascade" }),
    callId: text("call_id").notNull(),
    userId: userRef(),
    /** Null while the first run is still going. */
    result: jsonb("result").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("voice_tool_calls_call_uq").on(t.sessionId, t.callId), ownerPolicy()],
);

/** Provider message ids already answered (Twilio MessageSid): a retry of the same text never runs a second turn. Operations data, no user content, no RLS. */
export const smsInbound = pgTable("sms_inbound", {
  messageSid: text("message_sid").primaryKey(),
  createdAt: createdAt(),
});

/** Tool calls that change or delete data in bulk wait here for the user's explicit approval. */
export const pendingActions = pgTable(
  "pending_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    toolCallId: text("tool_call_id").notNull(),
    args: jsonb("args").$type<Record<string, unknown>>().notNull(),
    summary: text("summary").notNull(),
    status: text("status").$type<"pending" | "running" | "executed" | "cancelled" | "failed" | "expired">().notNull().default("pending"),
    result: jsonb("result").$type<ToolResultRecord>(),
    expiresAt: tstz("expires_at").notNull(),
    resolvedAt: tstz("resolved_at"),
    /** When a confirm claimed it (status "running"); a run older than the limit counts as lost. */
    claimedAt: tstz("claimed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("pending_actions_conv_idx").on(t.conversationId), ownerPolicy()],
);

// ---------------------------------------------------------------------------
// LifeFlow HQ (ADR 0024): the owner's private office for running the company. Owner-only operations data, like
// admin_actions and owner_inbox: no user_id and no RLS, read and written only through services/hq.ts behind
// requireAdmin() (pages and actions) or an HQ key (the /api/hq routes). Never put app users' content here.

/** The five HQ employees. The founder is the owner, not a row. */
/** The six departments plus the COO ("assistant", the head manager the CEO talks to; company.md). */
export const HQ_ROLES = ["developer", "designer", "researcher", "marketing", "qa", "support", "assistant"] as const;
export type HqRole = (typeof HQ_ROLES)[number];
export type HqLink = { label: string; url: string };
export type HqSource = "owner" | "agent" | "import";

/** Missions: the real task board. */
export const hqMissions = pgTable(
  "hq_missions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: text("role").$type<HqRole>().notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    priority: text("priority").$type<"high" | "normal" | "low">().notNull().default("normal"),
    status: text("status").$type<"todo" | "doing" | "waiting" | "blocked" | "done" | "dropped">().notNull().default("todo"),
    /** One line on what is happening now. */
    progress: text("progress"),
    blockedReason: text("blocked_reason"),
    /** What was done, in plain words, once finished. */
    result: text("result"),
    links: jsonb("links").$type<HqLink[]>().notNull().default([]),
    /** The Claude Code session that works on it, and its branch. */
    sessionId: text("session_id"),
    branch: text("branch"),
    source: text("source").$type<HqSource>().notNull(),
    dueOn: date("due_on"),
    startedAt: tstz("started_at"),
    doneAt: tstz("done_at"),
    /** When the owner opened it after it was done (the "Done" sparkle stops then). */
    seenAt: tstz("seen_at"),
    /** The first prompt for its own Claude Code chat. Set = a task file on the CEO's desk (ADR 0029). Plain text, max 1,500. */
    deskPrompt: text("desk_prompt"),
    /** Who last wrote the desk prompt or title: the owner, or an agent through the HQ key (ADR 0030). */
    deskPromptBy: text("desk_prompt_by").$type<"owner" | "agent">(),
    /** A start from HQ is on its way until then (ADR 0030): one start per task at a time. */
    startHoldUntil: tstz("start_hold_until"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("hq_missions_role_status_idx").on(t.role, t.status),
    index("hq_missions_updated_idx").on(t.updatedAt),
    index("hq_missions_desk_idx")
      .on(t.createdAt)
      .where(sql`desk_prompt is not null`),
  ],
);

/** The owner's approval inbox. A decision is only recorded here; HQ never carries it out. */
export const hqApprovals = pgTable(
  "hq_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: text("role").$type<HqRole>().notNull(),
    missionId: uuid("mission_id").references(() => hqMissions.id, { onDelete: "set null" }),
    kind: text("kind")
      .$type<"deploy" | "v3_merge" | "feature" | "design" | "publish" | "outbound" | "paid" | "subscription" | "destructive" | "security" | "other">()
      .notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    links: jsonb("links").$type<HqLink[]>().notNull().default([]),
    status: text("status").$type<"pending" | "approved" | "declined" | "changes">().notNull().default("pending"),
    decisionNote: text("decision_note"),
    decidedAt: tstz("decided_at"),
    source: text("source").$type<HqSource>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    // Decision card (ADR 0028). All null on old requests, which show as "being rewritten"; new ones always have every field.
    why: text("why"),
    changes: jsonb("changes").$type<string[]>(),
    onYes: text("on_yes"),
    onNo: text("on_no"),
    effort: text("effort").$type<"small" | "medium" | "large">(),
    risk: text("risk"),
    recommendation: text("recommendation"),
    previews: jsonb("previews").$type<HqPreview[]>(),
    /** One thread per ask: every version shares it. The first version's threadId is its own id. */
    threadId: uuid("thread_id"),
    version: integer("version").notNull().default(1),
    changedSinceNote: text("changed_since_note"),
    /** Set when a newer version of the same thread replaced this one. */
    supersededAt: tstz("superseded_at"),
    /** The mission that builds an approved ask, set only by linkApprovalMission. `missionId` stays the mission that asked. */
    buildMissionId: uuid("build_mission_id").references(() => hqMissions.id, { onDelete: "set null" }),
  },
  (t) => [index("hq_approvals_status_idx").on(t.status, t.createdAt), index("hq_approvals_thread_idx").on(t.threadId, t.version)],
);

export type HqPreview = { fileId: string; label: string | null };

/** Preview pictures for decision cards (ADR 0028). Owner-ops data like the other hq_* tables: no user_id, no RLS; served only to the admin. */
export const hqFiles = pgTable("hq_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
  data: bytea("data").notNull(),
  createdAt: createdAt(),
});

/** Append-only action log: every change in HQ, by the owner or an agent. */
export const hqActivity = pgTable(
  "hq_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actor: text("actor").$type<"owner" | "agent" | "system">().notNull(),
    role: text("role").$type<HqRole | "founder">(),
    kind: text("kind").notNull(),
    text: text("text").notNull(),
    missionId: uuid("mission_id"),
    approvalId: uuid("approval_id"),
    sessionId: text("session_id"),
    link: text("link"),
    createdAt: createdAt(),
  },
  (t) => [index("hq_activity_created_idx").on(t.createdAt), index("hq_activity_role_idx").on(t.role, t.createdAt)],
);

/** The owner's real Claude Code chats (one row per session), with the latest check-in. HQ links to them; it never drives them. */
export const hqChats = pgTable("hq_chats", {
  /** The Claude Code session id, e.g. session_014H9m... */
  id: text("id").primaryKey(),
  /** Which employee this chat belongs to; null for chats not mapped yet. */
  role: text("role").$type<HqRole>(),
  title: text("title").notNull(),
  /** The employee's main chat (one per role). */
  isPrimary: boolean("is_primary").notNull().default(false),
  branch: text("branch"),
  lastCommit: text("last_commit"),
  status: text("status").$type<"working" | "idle" | "blocked" | "archived" | "unknown">().notNull().default("unknown"),
  /** One line on what it did last (from the chat's own summary). */
  summary: text("summary"),
  needsAction: text("needs_action"),
  lastCheckinAt: tstz("last_checkin_at"),
  /** Live HQ (ADR 0030): "busy" or "idle" from the chat's own hooks, what it is doing in one short line, and when. */
  liveState: text("live_state").$type<"busy" | "idle" | "relayed">(),
  liveLine: text("live_line"),
  liveAt: tstz("live_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Claude usage readings sent by check-ins (the status line's rate_limits). Used for the weekly budget tile. */
export const hqUsageSamples = pgTable(
  "hq_usage_samples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: text("session_id"),
    fiveHourPct: numeric("five_hour_pct", { mode: "number" }),
    sevenDayPct: numeric("seven_day_pct", { mode: "number" }),
    sevenDayResetsAt: tstz("seven_day_resets_at"),
    /** start/end mark an automated round, so its share of the week can be worked out. */
    phase: text("phase").$type<"sample" | "round_start" | "round_end">().notNull().default("sample"),
    createdAt: createdAt(),
  },
  (t) => [index("hq_usage_created_idx").on(t.createdAt)],
);

/** Keys the owner's chats use to report to HQ (Authorization: Bearer lfq_...). Only a hash is stored. */
export const hqKeys = pgTable(
  "hq_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdByEmail: text("created_by_email").notNull(),
    lastUsedAt: tstz("last_used_at"),
    revokedAt: tstz("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("hq_keys_hash_uq").on(t.tokenHash)],
);

// ---------------------------------------------------------------------------
// LifeFlow HQ marketing and controls (ADR 0025). Same rules as the hq_* tables above: owner operations data, no
// user_id, no RLS, reached only through the HQ services after requireAdmin() or with an HQ key. Marketing numbers are
// only ever real readings a chat sent (from Metricool); nothing here is estimated.

export const HQ_CONTENT_STATUSES = ["idea", "draft", "waiting", "approved", "scheduled", "published", "dropped"] as const;
export type HqContentStatus = (typeof HQ_CONTENT_STATUSES)[number];
export const HQ_CONTENT_KINDS = ["concept", "script", "post", "research"] as const;
export type HqContentKind = (typeof HQ_CONTENT_KINDS)[number];
export const HQ_NETWORKS = ["instagram", "tiktok", "youtube", "facebook", "linkedin"] as const;
export type HqNetwork = (typeof HQ_NETWORKS)[number];

/** Marketing content and research: concepts, scripts, posts (with their schedule) and sourced findings. */
export const hqContent = pgTable(
  "hq_content",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<HqContentKind>().notNull(),
    title: text("title").notNull(),
    hook: text("hook"),
    /** Script, storyboard, caption and call to action, or the finding for research. Plain text. */
    body: text("body"),
    platforms: jsonb("platforms").$type<HqNetwork[]>().notNull().default([]),
    status: text("status").$type<HqContentStatus>().notNull().default("draft"),
    scheduledFor: tstz("scheduled_for"),
    publishedUrl: text("published_url"),
    /** The id the scheduling tool (Metricool) gave the post. */
    externalId: text("external_id"),
    /** Assets and sources. */
    links: jsonb("links").$type<HqLink[]>().notNull().default([]),
    /** The "publish" approval for this item, when one was asked for. */
    approvalId: uuid("approval_id").references(() => hqApprovals.id, { onDelete: "set null" }),
    sessionId: text("session_id"),
    source: text("source").$type<HqSource>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("hq_content_status_idx").on(t.status, t.scheduledFor), index("hq_content_kind_idx").on(t.kind, t.createdAt)],
);

/** Real marketing numbers, one reading per day, network and metric (and optionally one post). */
export const hqMetrics = pgTable(
  "hq_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    takenOn: date("taken_on").notNull(),
    network: text("network").$type<HqNetwork>().notNull(),
    metric: text("metric").notNull(),
    value: numeric("value", { mode: "number" }).notNull(),
    contentId: uuid("content_id").references(() => hqContent.id, { onDelete: "set null" }),
    /** contentId as text or "" (so a reading for the whole account and one for a post can both be unique). */
    contentRef: text("content_ref").notNull().default(""),
    source: text("source").notNull().default("metricool"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("hq_metrics_reading_uq").on(t.takenOn, t.network, t.metric, t.contentRef), index("hq_metrics_network_idx").on(t.network, t.takenOn)],
);

/** Job leases (migration 0057). Operations data with no user content and no RLS, like the hq_ tables; reached only through db/job-lock.ts. */
export const jobLocks = pgTable("job_locks", {
  name: text("name").primaryKey(),
  holder: text("holder").notNull(),
  expiresAt: tstz("expires_at").notNull(),
  /** Requests skipped while the lease was held; the holder runs once more if > 0. Reset on a claim. */
  skips: integer("skips").notNull().default(0),
  /** A skipped request wanted live data (Plaid balances). Reset on a claim. */
  liveWanted: boolean("live_wanted").notNull().default(false),
});

export type HqRoundSwitches = { night: boolean; research: boolean; marketing: boolean };

/** One row (id "hq"): the owner's controls that every round reads through /api/hq/inbox. */
export const hqSettings = pgTable("hq_settings", {
  id: text("id").primaryKey().default("hq"),
  /** Off = every scheduled round skips. */
  autonomous: boolean("autonomous").notNull().default(true),
  rounds: jsonb("rounds").$type<HqRoundSwitches>().notNull().default({ night: true, research: true, marketing: true }),
  /** Higgsfield credits the marketing round may spend in a week without asking. 0 = always ask. */
  creditBudget: integer("credit_budget").notNull().default(0),
  /** What the COO may decide on its own (docs/hq/company.md, decision rights). Owner switched all three on. */
  delegations: jsonb("delegations").$type<HqDelegations>().notNull().default({ fixOrder: true, researchTopics: true, postingTimes: true }),
  /** When the owner said goodnight (ADR 0029): the office dims until 5 AM in their time zone. It starts nothing. */
  goodnightAt: tstz("goodnight_at"),
  updatedByEmail: text("updated_by_email"),
  updatedAt: updatedAt(),
});

/** Level 1 decision rights. Never-delegated items (deploys, features, design, money, publishing, messages…) aren't switches. */
export type HqDelegations = { fixOrder: boolean; researchTopics: boolean; postingTimes: boolean };

/** The COO's brief to the CEO after each round (company.md, "The brief"). Plain text, newest shown on the Office. */
export const hqBriefs = pgTable(
  "hq_briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    body: text("body").notNull(),
    /** How many things wait for the CEO when the brief was written. */
    needsYou: integer("needs_you").notNull().default(0),
    sessionId: text("session_id"),
    createdAt: createdAt(),
  },
  (t) => [index("hq_briefs_created_idx").on(t.createdAt)],
);
