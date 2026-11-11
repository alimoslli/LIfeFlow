import { expect, test, type Browser, type Page } from "@playwright/test";
import { pool, signUp } from "./helpers";

const ADMIN_EMAIL = "admin-owner@example.com"; // matches ADMIN_EMAILS in playwright.config.ts
const PHONE = { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true };

async function ownerPage(browser: Browser): Promise<Page> {
  await pool.query("delete from users where email = $1", [ADMIN_EMAIL]);
  const ctx = await browser.newContext(PHONE);
  const op = await ctx.newPage();
  await op.goto("/signup");
  await pool.query("delete from rate_limit_buckets where key like 'signup:ip:%'");
  await op.getByLabel("Email").fill(ADMIN_EMAIL);
  await op.getByLabel("Password").fill("correct horse battery");
  await op.getByRole("button", { name: "Create account" }).click();
  await op.waitForURL("**/welcome");
  await pool.query(`update users set name = $1, preferences = preferences || '{"birthDate":"1990-06-15"}'::jsonb where email = $2`, ["Owner Olu", ADMIN_EMAIL]);
  await op.getByRole("button", { name: "Skip setup" }).click();
  await op.waitForURL((u) => u.pathname === "/");
  await pool.query("update users set totp_enabled_at = now() where email = $1", [ADMIN_EMAIL]);
  return op;
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

test.afterAll(async () => {
  await pool.query("update app_access set waitlist_on = false");
});

test("someone waiting sees their real place, their link, the anonymous front of the line and the rules", async ({ page }) => {
  test.setTimeout(120_000);
  // A fresh line: everyone already here is let in, so this person is first.
  await pool.query("update users set access = 'in' where access = 'waiting'");
  await signUp(page, "Maya Torres");
  // With the switch off, everyone can use the app and the page says so.
  await page.goto("/waitlist");
  await expect(page.getByRole("heading", { name: "You're in, Maya" })).toBeVisible();
  await pool.query("update app_access set waitlist_on = true");
  await page.goto("/waitlist");
  await expect(page.getByRole("heading", { level: 1, name: "You're #1 in line." })).toBeVisible();
  await expect(page.getByText("1 person is waiting.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Your link")).toHaveValue(/\/\?invite=[a-z2-9]+$/);
  const front = page.getByRole("region", { name: "The front of the line" });
  await expect(front.getByRole("listitem")).toHaveCount(1);
  await expect(front.getByText("You", { exact: true })).toBeVisible();
  await expect(front.getByRole("listitem")).toHaveText([/#1.*You$/]);
  // Never a name or an email in the line.
  await expect(front).not.toContainText("Maya");
  await expect(front).not.toContainText("@");
  await expect(page.getByText("A free trial and a student offer are planned.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({ path: "test-results/waitlist-phone.png", fullPage: true });
});

test("the owner lets the next people in from HQ after confirming, and previews the waitlist page", async ({ browser, page }) => {
  test.setTimeout(150_000);
  const op = await ownerPage(browser);
  await pool.query("update app_access set waitlist_on = false");
  await pool.query("update users set access = 'in' where access = 'waiting'");
  await signUp(page, "Ana Ruiz");
  const [{ id }] = (await pool.query<{ id: string }>("select id from users where access = 'waiting' order by waitlist_rank limit 1")).rows;

  await op.goto("/admin/people#waitlist");
  const section = op.getByRole("region", { name: "Waitlist" });
  await expect(section.getByText("The waitlist is off")).toBeVisible();
  const batch = section.getByTestId("waitlist-batch");
  await expect(batch.getByRole("list", { name: "Next in line" }).getByRole("listitem")).toHaveCount(1);
  await expect(batch).toContainText("Ana Ruiz");
  await op.screenshot({ path: "test-results/waitlist-hq-phone.png", fullPage: false });

  // Without the box ticked the browser won't send it; ticked, she's let in and logged.
  await batch.getByRole("checkbox", { name: /Yes, let these 1 person in|Yes, let these 1/ }).check();
  await batch.getByRole("button", { name: "Let 1 person in" }).click();
  await expect(op.getByRole("status").filter({ hasText: "Let 1 person in. Nobody was messaged." })).toBeVisible();
  const [row] = (await pool.query<{ access: string; plan: string }>("select access, plan from users where id = $1", [id])).rows;
  expect(row).toEqual({ access: "in", plan: "free" });
  await expect(op.getByTestId("waitlist-history")).toContainText("Let in");

  // She now sees she's in; the owner can preview what waiting looks like.
  await page.goto("/waitlist");
  await expect(page.getByRole("heading", { name: "You're in, Ana" })).toBeVisible();
  await op.goto("/waitlist?preview=1");
  await expect(op.getByText("Preview: this is what someone waiting sees.")).toBeVisible();
  await expect(op.getByTestId("wl-place")).toHaveText("#12");
});

test("after setup, someone waiting lands on their place in line; the app stays closed until they're let in", async ({ page }) => {
  test.setTimeout(150_000);
  await pool.query("update users set access = 'in' where access = 'waiting'");
  const email = await signUp(page, "Leo Park", { onboarding: "stay" });
  await pool.query("update app_access set waitlist_on = true");
  // Setup still runs first (the birthday is checked there); skipping it lands on the waitlist, not the app.
  await pool.query(`update users set preferences = preferences || '{"birthDate":"2000-01-15"}'::jsonb where email = $1`, [email]);
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Skip setup" }).click();
  await page.waitForURL((u) => u.pathname === "/waitlist");
  await expect(page.getByTestId("wl-place")).toHaveText("#1");
  // The invite card sits at the bottom, after the line and the rules.
  const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
  expect(headings).toEqual(["The front of the line", "How the line works", "Bring a friend, move up a spot."]);

  // Every app page and the app's data send them back; their account, security and privacy pages stay open.
  for (const path of ["/", "/finances/accounts", "/school", "/settings"]) {
    await page.goto(path);
    await page.waitForURL((u) => u.pathname === "/waitlist");
  }
  expect((await page.request.get("/api/search?q=test")).status()).toBe(401);
  await page.goto("/settings/security");
  await expect(page).toHaveURL(/\/settings\/security$/);
  await page.goto("/settings/data");
  await expect(page).toHaveURL(/\/settings\/data$/);

  // Let in: the app opens.
  await pool.query("update users set access = 'in' where email = $1", [email]);
  await page.goto("/");
  await expect(page).toHaveURL((u) => u.pathname === "/");
  await pool.query("update app_access set waitlist_on = false");
});
