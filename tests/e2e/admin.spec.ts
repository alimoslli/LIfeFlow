import { expect, test } from "@playwright/test";
import { pool, signUp } from "./helpers";

const ADMIN_EMAIL = "admin-owner@example.com"; // matches ADMIN_EMAILS in playwright.config.ts

test("admin page: 404 for everyone but the owner, and the owner can manage users safely", async ({ page, browser, request }) => {
  // Signed out: sent to sign in like any private page. The raw URL is never public.
  const anon = await request.get("/admin", { maxRedirects: 0 });
  expect([301, 302, 303, 307, 308]).toContain(anon.status());

  // A normal signed-in user gets a 404, and no Admin row in Settings.
  const normalEmail = await signUp(page, "Regular Rhea");
  expect((await page.goto("/admin"))?.status()).toBe(404);
  expect((await page.goto("/admin/users"))?.status()).toBe(404);
  await page.goto("/settings");
  await expect(page.getByRole("link", { name: /^Admin/ })).toHaveCount(0);

  // The owner's email alone isn't enough: two-step sign-in (or a passkey) must be on.
  await pool.query("delete from users where email = $1", [ADMIN_EMAIL]);
  const owner = await browser.newContext();
  const op = await owner.newPage();
  await op.goto("/signup");
  await pool.query("delete from rate_limit_buckets where key like 'signup:ip:%'");
  await op.getByLabel("Your name").fill("Owner Olu");
  await op.getByLabel("Email").fill(ADMIN_EMAIL);
  await op.getByLabel("Password").fill("correct horse battery");
  await op.getByRole("button", { name: "Create account" }).click();
  await op.waitForURL("**/welcome");
  expect((await op.goto("/admin"))?.status()).toBe(404);
  await op.goto("/welcome");
  await op.getByRole("button", { name: "Skip setup" }).click();
  await op.waitForURL((u) => u.pathname === "/");
  await op.getByRole("button", { name: "Skip tour" }).click();
  await pool.query("update users set totp_enabled_at = now() where email = $1", [ADMIN_EMAIL]);

  // Overview.
  expect((await op.goto("/admin"))?.status()).toBe(200);
  await expect(op.getByText("LifeFlow admin")).toBeVisible();
  await expect(op.getByText("Total users")).toBeVisible();
  await expect(op.getByText("Signups, last 30 days")).toBeVisible();
  await op.goto("/settings");
  await expect(op.getByRole("link", { name: /^Admin/ })).toBeVisible();

  // Find the regular user and open them.
  await op.goto("/admin/users");
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
  await op.goto("/admin/users");
  await op.getByLabel("Search users").fill("Owner Olu");
  await op.getByRole("button", { name: "Search" }).click();
  await op.getByRole("link", { name: /Owner Olu/ }).click();
  await expect(op.getByText("Admin accounts can't be changed here.")).toBeVisible();
  await op.goto("/admin/activity");
  await expect(op.getByText("Suspended a user", { exact: true })).toBeVisible();
  await expect(op.getByText("Deleted a user", { exact: true })).toBeVisible();

  // Errors and health pages render.
  expect((await op.goto("/admin/errors"))?.status()).toBe(200);
  expect((await op.goto("/admin/health"))?.status()).toBe(200);
  await expect(op.getByText("Integrations")).toBeVisible();
  await owner.close();
});
