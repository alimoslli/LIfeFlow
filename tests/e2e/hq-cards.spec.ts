import { expect, test, type Browser, type Page } from "@playwright/test";
import { pool } from "./helpers";
import { insertCard } from "./hq-cards-helpers";

const ADMIN_EMAIL = "admin-owner@example.com"; // matches ADMIN_EMAILS in playwright.config.ts

/** The owner on a phone: signed up, setup skipped, two-step sign-in marked on (like tests/e2e/hq.spec.ts). */
async function ownerPhone(browser: Browser): Promise<Page> {
  await pool.query("delete from users where email = $1", [ADMIN_EMAIL]);
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  const op = await ctx.newPage();
  await op.goto("/signup");
  await pool.query("delete from rate_limit_buckets where key like 'signup:ip:%'");
  await op.getByLabel("Email").fill(ADMIN_EMAIL);
  await op.getByLabel("Password").fill("correct horse battery");
  await op.getByRole("button", { name: "Create account" }).click();
  await op.waitForURL("**/welcome");
  // Sign-up takes only email and password; give the owner a name so greetings read "Good morning, Owner."
  await pool.query(`update users set name = $1, preferences = preferences || '{"birthDate":"1990-06-15"}'::jsonb where email = $2`, ["Owner Olu", ADMIN_EMAIL]);
  await op.getByRole("button", { name: "Skip setup" }).click();
  await op.waitForURL((u) => u.pathname === "/");
  await op.getByRole("button", { name: "Skip tour" }).click();
  await pool.query("update users set totp_enabled_at = now() where email = $1", [ADMIN_EMAIL]);
  return op;
}

const noSideScroll = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

test("Your desk: a full decision card, a version 2 thread, lifecycle cards and answering, on a phone", async ({ browser }) => {
  test.setTimeout(150_000);
  await pool.query("truncate hq_missions, hq_approvals, hq_activity, hq_chats, hq_briefs, hq_files cascade");
  const day = 86_400_000;
  const nov5 = new Date(Date.now() - 2 * day).toISOString();
  const nov6 = new Date(Date.now() - day).toISOString();

  // Version 1 was sent back with a note; version 2 is waiting.
  const v1 = await insertCard({
    title: "Make Goals one list",
    status: "changes",
    decisionNote: "Keep habits, but don't make me see two lists",
    createdAt: nov5,
    decidedAt: nov6,
    superseded: true,
  });
  const v2 = await insertCard({
    title: "Make Goals one calm list",
    threadId: v1,
    version: 2,
    changedSinceNote: "Habits now sit inside each goal. The Habits tab is gone.",
  });
  // A brand-new ask from another department.
  const fresh = await insertCard({ role: "marketing", kind: "publish", title: "Publish the Sunday reset post" });
  // Approved and being built, and approved and live (their missions say where they are).
  const building = (
    await pool.query(
      `insert into hq_missions (role, title, status, source, started_at) values ('developer', 'Build search', 'doing', 'agent', now()) returning id`,
    )
  ).rows[0].id;
  await insertCard({ role: "developer", kind: "feature", title: "Search as you type on Plan", status: "approved", buildMissionId: building });
  const done = (
    await pool.query(
      `insert into hq_missions (role, title, status, source, started_at, done_at, result) values ('support', 'Error groups into fixes', 'done', 'agent', now() - interval '2 days', now(), 'Live for everyone') returning id`,
    )
  ).rows[0].id;
  await insertCard({ role: "support", kind: "feature", title: "Turn error groups into fixes", status: "approved", buildMissionId: done });
  // An old request without a card.
  await pool.query(`insert into hq_approvals (role, kind, title, summary, source) values ('qa', 'other', 'An old request', 'old', 'agent')`);

  const op = await ownerPhone(browser);
  await op.goto("/admin/work");
  await expect(op.getByRole("heading", { name: "Your desk", level: 1 })).toBeVisible();
  await expect(op.getByText("2 decisions waiting.")).toBeVisible();

  // The version 2 card shows everything, in order.
  const card = op.locator(`article[id="${v2}"]`);
  await expect(card.getByRole("heading", { name: "Make Goals one calm list" })).toBeVisible();
  await expect(card.getByText("Version 2")).toBeVisible();
  await expect(card.getByRole("heading", { name: "What changed since your note" })).toBeVisible();
  await expect(card.getByText("Keep habits, but don't make me see two lists")).toBeVisible();
  await expect(card.getByText("Habits now sit inside each goal.")).toBeVisible();
  const chips = card.getByRole("list", { name: "Versions of this request" }).getByRole("listitem");
  await expect(chips).toHaveCount(3);
  await expect(chips.nth(0)).toContainText("v1");
  await expect(chips.nth(1)).toContainText("Your note");
  await expect(chips.nth(2)).toContainText("v2");
  const order = ["Why", "What it will look like", "Exactly what changes", "What happens next", "Effort and risk"];
  const tops: number[] = [];
  for (const h of order) tops.push((await card.getByRole("heading", { name: h, level: 5 }).boundingBox())!.y);
  expect([...tops].sort((a, b) => a - b)).toEqual(tops);
  await expect(card.getByText("If you say yes", { exact: true }).first()).toBeVisible();
  await expect(card.getByText("If you say no", { exact: true })).toBeVisible();
  await expect(card.getByText("recommends:")).toBeVisible();
  const imgs = card.getByRole("img", { name: /picture 1 of 2|picture 2 of 2/ });
  await expect(imgs).toHaveCount(2);
  // The pictures load lazily: scroll the first into view, then wait for it.
  await imgs.first().scrollIntoViewIfNeeded();
  await expect.poll(() => imgs.first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);

  // Lifecycle and old requests.
  const built = op.locator("article", { hasText: "Search as you type on Plan" });
  await expect(built.getByText("Being built", { exact: true }).first()).toBeVisible();
  const live = op.locator("article", { hasText: "Turn error groups into fixes" });
  await expect(live.getByText("Live", { exact: true }).first()).toBeVisible();
  await expect(live.getByText("Live for everyone")).toBeVisible();
  await expect(op.getByText("Being rewritten by your COO")).toBeVisible();
  await expect(op.locator("li", { hasText: "An old request" }).getByRole("button")).toHaveCount(0);

  expect(await noSideScroll(op)).toBe(true);
  for (const name of ["Yes, go", "Send changes", "No"]) {
    const box = await card.getByRole("button", { name, exact: true }).boundingBox();
    expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
  }

  // Send changes needs a note; with one, the card leaves the waiting list and goes back to its department.
  await card.getByRole("button", { name: "Send changes" }).click();
  await expect(op.getByText("Say what to change")).toBeVisible();
  await op.locator(`article[id="${v2}"]`).getByRole("textbox").fill("Make the pictures bigger");
  await op.locator(`article[id="${v2}"]`).getByRole("button", { name: "Send changes" }).click();
  await expect(op.getByText("You asked for changes.")).toBeVisible();
  await expect(op.getByText("1 decision waiting.")).toBeVisible();
  await expect(op.locator(`article[id="${v2}"]`).getByText("sends version 3")).toBeVisible();

  // Yes on the other one.
  await op.locator(`article[id="${fresh}"]`).getByRole("button", { name: "Yes, go" }).click();
  await expect(op.getByText("You said yes.")).toBeVisible();
  await expect(op.getByText("Nothing waiting for you.", { exact: true })).toBeVisible();
  await expect(op.locator(`article[id="${fresh}"]`).getByText("Approved", { exact: true }).first()).toBeVisible();
});

test("Office: Since you last looked lists what was fixed and found, then goes quiet after the owner looked", async ({ browser }) => {
  test.setTimeout(120_000);
  await pool.query("truncate hq_missions, hq_approvals, hq_activity, hq_chats, hq_briefs cascade");
  await pool.query(
    `insert into hq_missions (role, title, status, source, done_at, links) values
       ('developer', 'Fix the calendar crash', 'done', 'agent', now() - interval '1 hour', '[{"label":"Commit","url":"https://github.com/o/r/commit/abc123"}]')`,
  );
  await pool.query(
    `insert into hq_missions (role, title, status, source) values ('qa', 'Receipts page shows a full name', 'todo', 'agent'), ('support', 'Three people hit the same sign-in error', 'todo', 'agent')`,
  );
  const op = await ownerPhone(browser);
  await op.goto("/admin");
  const since = op.getByRole("region", { name: "Since you last looked" });
  await expect(since).toBeVisible();
  await expect(since.getByText("The last 7 days")).toBeVisible();
  await expect(since.getByRole("heading", { name: "Fixed for you" })).toBeVisible();
  await expect(since.getByText("Fix the calendar crash")).toBeVisible();
  await expect(since.getByRole("link", { name: /Commit/ })).toHaveAttribute("href", "https://github.com/o/r/commit/abc123");
  await expect(since.getByRole("heading", { name: "Found" })).toBeVisible();
  await expect(since.getByText("Receipts page shows a full name")).toBeVisible();
  await expect(since.getByRole("heading", { name: "How the app is running" })).toBeVisible();
  await expect(since.getByText("Quiet since you last looked.")).toHaveCount(0);
  expect(await noSideScroll(op)).toBe(true);

  // The visit keeps its window (ADR 0030): the page refreshes itself every 15 s and still shows the same things.
  await expect.poll(async () => (await op.context().cookies()).some((c) => c.name === "hq_looked_from")).toBe(true);
  await op.waitForTimeout(16_000);
  await expect(since.getByText("Fix the calendar crash")).toBeVisible();
  await expect(since.getByText("Quiet since you last looked.")).toHaveCount(0);
  // Leaving the page remembers that the owner looked; next time only what is newer shows.
  await op.reload();
  await expect(since.getByText("Quiet since you last looked.")).toBeVisible();
  await expect(since.getByText("Fix the calendar crash")).toHaveCount(0);
});
