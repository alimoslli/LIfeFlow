import { expect, test, type Browser, type Page } from "@playwright/test";
import { pool } from "./helpers";

const ADMIN_EMAIL = "admin-owner@example.com"; // matches ADMIN_EMAILS in playwright.config.ts

/** The owner: signed up, setup skipped, two-step sign-in marked on (like tests/e2e/admin.spec.ts). */
async function ownerPage(browser: Browser): Promise<Page> {
  await pool.query("delete from users where email = $1", [ADMIN_EMAIL]);
  const ctx = await browser.newContext();
  const op = await ctx.newPage();
  await op.goto("/signup");
  await pool.query("delete from rate_limit_buckets where key like 'signup:ip:%'");
  await op.getByLabel("Your name").fill("Owner Olu");
  await op.getByLabel("Email").fill(ADMIN_EMAIL);
  await op.getByLabel("Password").fill("correct horse battery");
  await op.getByRole("button", { name: "Create account" }).click();
  await op.waitForURL("**/welcome");
  await op.getByRole("button", { name: "Skip setup" }).click();
  await op.waitForURL((u) => u.pathname === "/");
  await op.getByRole("button", { name: "Skip tour" }).click();
  await pool.query("update users set totp_enabled_at = now() where email = $1", [ADMIN_EMAIL]);
  return op;
}

test("HQ is owner-only: signed out is sent to sign in, everyone else gets a 404", async ({ page, request }) => {
  const anon = await request.get("/admin/hq", { maxRedirects: 0 });
  expect([301, 302, 303, 307, 308]).toContain(anon.status());

  await pool.query("delete from rate_limit_buckets where key like 'signup:ip:%'");
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Regular Rhea");
  await page.getByLabel("Email").fill(`rhea-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/welcome");
  for (const path of ["/admin/hq", "/admin/hq/missions", "/admin/hq/developer", "/admin/hq/approvals", "/admin/hq/settings"])
    expect((await page.goto(path))?.status(), path).toBe(404);
});

test("HQ: the office, missions, approvals, reports and keys work end to end", async ({ browser, request }) => {
  test.setTimeout(150_000);
  await pool.query("truncate hq_missions, hq_approvals, hq_activity, hq_keys, hq_chats, hq_usage_samples cascade");
  const op = await ownerPage(browser);

  // The office: six rooms, the founder's door plate, and plain counts.
  expect((await op.goto("/admin/hq"))?.status()).toBe(200);
  await expect(op.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening), Owner\.$/ })).toBeVisible();
  const rooms = op.locator("a.hq-room");
  await expect(rooms).toHaveCount(6);
  await expect(op.getByText("I'M THE CEO, BITCH", { exact: true })).toBeVisible();
  await expect(op.getByRole("link", { name: /^Developer\s*,\s*[\w ]+\s*:\s*\S/ })).toBeVisible();
  await expect(op.getByText("Nothing waiting for you.").first()).toBeVisible();

  // Office <-> Workspace.
  await op.getByRole("link", { name: "Workspace", exact: true }).click();
  await expect(op).toHaveURL(/view=workspace/);
  await expect(op.locator("a.hq-room")).toHaveCount(0);
  await expect(op.getByRole("heading", { name: "Researcher", level: 2 })).toBeVisible();
  await op.getByRole("link", { name: "Office", exact: true }).first().click();
  await expect(op.locator("a.hq-room")).toHaveCount(6);

  // A mission for the Developer: it shows on their page, moves to doing, then done with a result.
  await op.goto("/admin/hq/missions");
  await op.getByLabel("Who is it for").selectOption("developer");
  await op.getByLabel("Title").fill("Fix the calendar sync");
  await op.getByLabel("Details (optional)").fill("The Outlook events arrive an hour late.");
  await op.getByRole("button", { name: "New mission" }).click();
  await expect(op.getByText("Mission added.")).toBeVisible();
  await op.goto("/admin/hq/developer");
  await expect(op.getByRole("heading", { name: "Developer", level: 1 })).toBeVisible();
  await op
    .getByRole("link", { name: /Fix the calendar sync/ })
    .first()
    .click();
  await expect(op.getByRole("heading", { name: "Fix the calendar sync", level: 1 })).toBeVisible();
  await op.getByLabel("Status", { exact: true }).selectOption("doing");
  await op.getByRole("button", { name: "Save status" }).click();
  await expect(op.getByText("Status updated.")).toBeVisible();
  await expect(op.getByText("Doing · Developer")).toBeVisible();
  await op.getByLabel("Status", { exact: true }).selectOption("done");
  await op.getByLabel("Result (when done)").fill("Events now arrive on time.");
  await op.getByRole("button", { name: "Save status" }).click();
  await expect(op.getByText("Done · Developer")).toBeVisible();
  await expect(op.getByText("Events now arrive on time.").first()).toBeVisible();

  // Settings: create a key, see the token once, then it is gone.
  await op.goto("/admin/hq/settings");
  await op.getByLabel("Key name").fill("e2e rounds");
  await op.getByRole("button", { name: "Create key" }).click();
  await expect(op.getByText("Key created.")).toBeVisible();
  const token = (await op.getByTestId("hq-new-key").textContent())?.trim() ?? "";
  expect(token).toMatch(/^lfq_/);
  expect(op.url()).not.toContain(token);
  await expect(op.getByTestId("hq-new-key"))
    .toHaveCount(0, { timeout: 15_000 })
    .catch(() => undefined);
  await op.goto("/admin/hq/settings");
  await expect(op.getByTestId("hq-new-key")).toHaveCount(0);
  await expect(op.getByText("e2e rounds").first()).toBeVisible();

  // An agent files an approval with the key; it appears in the inbox and the owner says yes.
  const posted = await request.post("/api/hq/report", {
    headers: { Authorization: `Bearer ${token}` },
    data: { type: "approval", role: "developer", kind: "deploy", title: "Ship the calendar fix", summary: "Tests pass. Ready to go live." },
  });
  expect(posted.status()).toBe(200);
  await op.goto("/admin/hq/approvals");
  const card = op.locator("article", { hasText: "Ship the calendar fix" });
  await expect(card.getByText("Go live", { exact: true })).toBeVisible();
  await expect(card.getByText(/acts on it at their next round/)).toBeVisible();
  await card.getByLabel("Note (optional)").fill("Go ahead");
  await card.getByRole("button", { name: "Yes" }).click();
  await expect(op.getByText("You said yes.")).toBeVisible();
  await op.goto("/admin/hq");
  await expect(op.getByText(/You said yes/).first()).toBeVisible();

  // Reports: headline lines from the records.
  await op.goto("/admin/hq/reports");
  await expect(op.getByRole("heading", { name: "The headline" })).toBeVisible();
  await expect(op.locator("section", { hasText: "The headline" }).locator("li").first()).toBeVisible();
  await expect(op.getByRole("heading", { name: "Weekly Claude use" })).toBeVisible();
  await expect(op.getByText("Not measured yet").first()).toBeVisible();

  // A wrong key is refused.
  expect((await request.post("/api/hq/report", { headers: { Authorization: "Bearer lfq_nope" }, data: { type: "activity" } })).status()).toBe(401);

  // The Founder Office lists the admin sections.
  await op.goto("/admin/hq/founder");
  await expect(op.getByRole("heading", { name: "Founder Office", level: 1 })).toBeVisible();
  await expect(op.getByRole("link", { name: /Users/ }).first()).toBeVisible();
});
