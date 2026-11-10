import { expect, test } from "@playwright/test";
import { pool, signUp } from "./helpers";

const ADMIN_EMAIL = "admin-owner@example.com"; // matches ADMIN_EMAILS in playwright.config.ts

test("admin page: 404 for everyone but the owner, and the owner can manage users safely", async ({ page, browser, request }) => {
  // Signed out: the same "not found" as everyone else, so the admin area doesn't show it exists (ADR 0022).
  for (const path of ["/admin", "/admin/hq/settings", "/admin/users/export"]) {
    expect((await request.get(path, { maxRedirects: 0 })).status()).toBe(404);
  }

  // A normal signed-in user gets a 404, and no Admin row in Settings.
  const normalEmail = await signUp(page, "Regular Rhea");
  expect((await page.goto("/admin"))?.status()).toBe(404);
  expect((await page.goto("/admin/people"))?.status()).toBe(404);
  await page.goto("/settings");
  await expect(page.getByRole("link", { name: /^Admin/ })).toHaveCount(0);

  // The owner's email alone isn't enough: two-step sign-in (or a passkey) must be on.
  await pool.query("delete from users where email = $1", [ADMIN_EMAIL]);
  const owner = await browser.newContext();
  const op = await owner.newPage();
  await op.goto("/signup");
  await pool.query("delete from rate_limit_buckets where key like 'signup:ip:%'");
  await op.getByLabel("Email").fill(ADMIN_EMAIL);
  await op.getByLabel("Password").fill("correct horse battery");
  await op.getByRole("button", { name: "Create account" }).click();
  await op.waitForURL("**/welcome");
  // Sign-up takes only email and password; give the owner a name so greetings read "Good morning, Owner."
  await pool.query(`update users set name = $1, preferences = preferences || '{"birthDate":"1990-06-15"}'::jsonb where email = $2`, ["Owner Olu", ADMIN_EMAIL]);
  expect((await op.goto("/admin"))?.status()).toBe(404);
  await op.goto("/welcome");
  await op.getByRole("button", { name: "Skip setup" }).click();
  await op.waitForURL((u) => u.pathname === "/");
  await op.getByRole("button", { name: "Skip tour" }).click();
  await pool.query("update users set totp_enabled_at = now() where email = $1", [ADMIN_EMAIL]);

  // Office.
  expect((await op.goto("/admin"))?.status()).toBe(200);
  await expect(op.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(op.getByRole("heading", { name: "The app today" })).toBeVisible();

  // Feedback a user sends lands in the owner's inbox, in full, with who sent it.
  await page.goto("/settings/feedback");
  await page.getByLabel("Your message").fill("The Plan tab should show my shifts in a different colour.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Thanks|Sent|got it/i).first()).toBeVisible();
  await op.goto("/admin/people#feedback");
  await expect(op.getByText("The Plan tab should show my shifts in a different colour.")).toBeVisible();
  await expect(op.getByText(normalEmail.toLowerCase(), { exact: false }).first()).toBeVisible();
  await op.getByRole("button", { name: "Mark handled" }).first().click();
  await expect(op.getByText("Marked handled.")).toBeVisible();

  // An announcement shows to everyone in the app, and they can close it.
  await op.goto("/admin/people#announcements");
  await op.getByLabel("Message").fill("Maintenance tonight at 11 PM for about 10 minutes.");
  await op.getByRole("button", { name: "Show to everyone" }).click();
  await expect(op.getByText(/^Published/)).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Maintenance tonight at 11 PM for about 10 minutes.")).toBeVisible();
  await page.getByRole("button", { name: "Close announcement" }).click();
  await page.reload();
  await expect(page.getByText("Maintenance tonight at 11 PM for about 10 minutes.")).toHaveCount(0);
  await op.goto("/admin/people#announcements");
  await op.getByRole("button", { name: "End now" }).click();
  await expect(op.getByText(/^Ended/)).toBeVisible();

  // Growth and the CSV export.
  expect((await op.goto("/admin/app#growth"))?.status()).toBe(200);
  await expect(op.getByText("Top inviters")).toBeVisible();
  const csv = await op.request.get("/admin/users/export");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-disposition"]).toContain("lifeflow-users-");
  expect(await csv.text()).toContain(normalEmail.toLowerCase());
  expect((await page.request.get("/admin/users/export")).status()).toBe(404);
  await op.goto("/settings");
  await expect(op.getByRole("link", { name: /^Admin/ })).toBeVisible();

  // Find the regular user and open them.
  await op.goto("/admin/people");
  await op.getByLabel("Search users").fill("rhea");
  await op.getByRole("button", { name: "Search" }).click();
  await op.getByRole("link", { name: /Regular Rhea/ }).click();
  await expect(op.getByText(normalEmail)).toBeVisible();
  await expect(op.getByText("private and aren't shown here")).toBeVisible();

  // Suspending signs them out at once.
  const regular = await page.context().cookies();
  expect(regular.some((c) => c.name === "bf_session")).toBe(true);
  await op.getByRole("button", { name: "Suspend account" }).click();
  await expect(op.getByText(/Suspended\. They're signed out/)).toBeVisible();
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login/);
  // ...and signing in again says why.
  await page.getByLabel("Email").fill(normalEmail);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(/account has been suspended/)).toBeVisible();

  // Unsuspend, change plan.
  await op.getByRole("button", { name: "Unsuspend" }).click();
  await expect(op.getByText(/Unsuspended/)).toBeVisible();
  await op.getByLabel("Plan").selectOption("pro");
  await op.getByRole("button", { name: "Set plan" }).click();
  await expect(op.getByText("Plan set to pro.")).toBeVisible();

  // Delete is guarded: Pro users are refused, then the exact email is required.
  await op.getByText("Show delete").click();
  await op.getByLabel(/Type .* to confirm/).fill(normalEmail);
  await op.getByRole("button", { name: "Delete permanently" }).click();
  await expect(op.getByText(/Cancel their subscription in Stripe/)).toBeVisible();
  await op.getByLabel("Plan").selectOption("free");
  await op.getByRole("button", { name: "Set plan" }).click();
  await expect(op.getByText("Plan set to free.")).toBeVisible();
  await op.getByText("Show delete").click();
  await op.getByLabel(/Type .* to confirm/).fill("someone-else@example.com");
  await op.getByRole("button", { name: "Delete permanently" }).click();
  await expect(op.getByText(/doesn't match/)).toBeVisible();
  await op.getByText("Show delete").click();
  await op.getByLabel(/Type .* to confirm/).fill(normalEmail);
  await op.getByRole("button", { name: "Delete permanently" }).click();
  await expect(op.getByText("User deleted.")).toBeVisible();
  const gone = await pool.query("select 1 from users where email = $1", [normalEmail]);
  expect(gone.rowCount).toBe(0);

  // The owner's own account is untouchable, and every step above was logged.
  await op.goto("/admin/people");
  await op.getByLabel("Search users").fill("Owner Olu");
  await op.getByRole("button", { name: "Search" }).click();
  await op.getByRole("link", { name: /Owner Olu/ }).click();
  await expect(op.getByText("Admin accounts can't be changed here.")).toBeVisible();
  await op.goto("/admin/app#activity");
  await expect(op.getByText("Suspended a user", { exact: true })).toBeVisible();
  await expect(op.getByText("Deleted a user", { exact: true })).toBeVisible();

  // Errors and health render (one page: going to a #part of the page you're on is not a new load, so leave it first).
  await op.goto("/admin");
  expect((await op.goto("/admin/app#errors"))?.status()).toBe(200);
  await expect(op.locator("#errors")).toBeVisible();
  await expect(op.locator("#health")).toBeVisible();
  await expect(op.getByText("Integrations")).toBeVisible();
  await op.goto("/admin/app#activity");
  await expect(op.getByText("Published an announcement", { exact: true })).toBeVisible();
  await expect(op.getByText("Exported the user list", { exact: true })).toBeVisible();
  await owner.close();
});
