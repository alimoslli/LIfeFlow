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

// ---------------------------------------------------------------------------
// identity (no RLS: needed before a user context exists, e.g. login)

export type UserPreferences = {
  studyTime?: "morning" | "afternoon" | "evening" | "night";
  weekStartsOn?: 0 | 1;
  currency?: string;
  jarvisTone?: "concise" | "balanced" | "detailed";
  /** Let Jarvis suggest things to remember (default on). Explicit "remember…" requests always work. */
  memorySuggestions?: boolean;
  /** What fills the user's week (from onboarding); helps Jarvis and the briefing. */
  lifeStage?: "student" | "working" | "both";
  /** First-run setup: "pending" only for accounts created since onboarding launched. */
  onboarding?: "pending" | "done";
  /** Guided tour of the app, offered after onboarding or replayed from Settings. */
  tour?: "pending" | "done";
  /** The user's assistant: its name, personality and live voice (see src/lib/assistant.ts). */
  assistantName?: string;
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
  /** Which push notifications the user wants, and when the morning brief arrives (local HH:mm). */
  notifications?: { reminders?: boolean; bills?: boolean; morningBrief?: boolean; briefTime?: string; budgetAlerts?: boolean };
  assistantVoice?: "alloy" | "ash" | "ballad" | "cedar" | "coral" | "echo" | "marin" | "sage" | "shimmer" | "verse";
};

export const JARVIS_TOPICS = ["money", "school", "work", "health", "trips", "habits"] as const;
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
  avatar?: "spark" | "orb" | "initial";
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
  | { type: "answer"; label: string; key: string; choices: string[] };

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
  /** Last accepted 30-second time step, so a code can't be used twice. */
  totpLastStep: integer("totp_last_step"),
  /** Random part of the personal forwarding address (u-<token>@<INBOX_DOMAIN>). */
  inboxToken: text("inbox_token").unique(),
  createdAt: createdAt(),
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
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
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
    purpose: text("purpose").$type<"passkey-register" | "passkey-login" | "passkey-unlock" | "apple">().notNull(),
    challenge: text("challenge").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    expiresAt: tstz("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("auth_challenges_expires_idx").on(t.expiresAt)],
);

/** Sign in with Apple (and later other providers): the provider's stable user id, linked to one account. */
export const oauthIdentities = pgTable(
  "oauth_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    provider: text("provider").$type<"apple">().notNull(),
    subject: text("subject").notNull(),
    email: text("email"),
    /** Apple "Hide My Email" relay address. */
    isPrivateEmail: boolean("is_private_email").notNull().default(false),
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

export type DataSource = "manual" | "jarvis" | "import" | "demo" | "plaid" | "canvas" | "ukg" | "google" | "apple_health";

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
    /** Free-form meeting info shown on the course page, e.g. "Mon/Wed 10:00-11:15". */
    meetingInfo: text("meeting_info"),
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
  (t) => [index("events_user_start_idx").on(t.userId, t.startsAt), ownerPolicy()],
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
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.seq), ownerPolicy()],
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
// Trips

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    name: text("name").notNull(),
    destination: text("destination"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    budgetCents: integer("budget_cents"),
    goalId: uuid("goal_id").references(() => financialGoals.id, { onDelete: "set null" }),
    notes: text("notes"),
    source: text("source").$type<DataSource | "inbox">().notNull().default("manual"),
    createdAt: createdAt(),
  },
  (t) => [index("trips_user_idx").on(t.userId), ownerPolicy()],
);

export const tripItems = pgTable(
  "trip_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"flight" | "train" | "hotel" | "car" | "activity" | "other">().notNull(),
    title: text("title").notNull(),
    startsAt: tstz("starts_at").notNull(),
    endsAt: tstz("ends_at"),
    location: text("location"),
    confirmation: text("confirmation"),
    costCents: integer("cost_cents"),
    /** The calendar entry made for it, so it shows in Plan and Today. */
    eventId: uuid("event_id"),
    source: text("source").$type<DataSource | "inbox">().notNull().default("manual"),
    createdAt: createdAt(),
  },
  (t) => [index("trip_items_trip_idx").on(t.tripId), ownerPolicy()],
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
  kind: "transaction" | "recurring" | "task" | "assignment" | "trip" | "trip_item" | "paycheck";
  id: string;
  label: string;
  href?: string;
};

export const inboxItems = pgTable(
  "inbox_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    channel: text("channel").$type<"email" | "upload" | "share">().notNull(),
    fromAddress: text("from_address"),
    subject: text("subject"),
    receivedAt: tstz("received_at").notNull().defaultNow(),
    status: text("status").$type<"processing" | "filed" | "needs_review" | "ignored" | "failed" | "undone">().notNull().default("processing"),
    type: text("type"),
    summary: text("summary"),
    /** Why it wasn't filed (e.g. not from a verified address). */
    reason: text("reason"),
    filed: jsonb("filed").$type<InboxFiled[]>().notNull().default([]),
    extracted: jsonb("extracted").$type<Record<string, unknown> | null>(),
    attachmentIds: jsonb("attachment_ids").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("inbox_items_user_idx").on(t.userId, t.receivedAt), ownerPolicy()],
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
    status: text("status").$type<"pending" | "executed" | "cancelled" | "failed" | "expired">().notNull().default("pending"),
    result: jsonb("result").$type<ToolResultRecord>(),
    expiresAt: tstz("expires_at").notNull(),
    resolvedAt: tstz("resolved_at"),
    createdAt: createdAt(),
  },
  (t) => [index("pending_actions_conv_idx").on(t.conversationId), ownerPolicy()],
);
