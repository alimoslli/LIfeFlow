import { expect, test, type Browser, type Page } from "@playwright/test";
import { pool, signUp, afterSignUp, skipSetup } from "./helpers";

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
  await op.waitForURL(afterSignUp);
  await pool.query(`update users set name = $1, preferences = preferences || '{"birthDate":"1990-06-15"}'::jsonb where email = $2`, ["Owner Olu", ADMIN_EMAIL]);
  await skipSetup(op);
  await op.waitForURL((u) => u.pathname === "/");
  await pool.query("update users set totp_enabled_at = now() where email = $1", [ADMIN_EMAIL]);
  return op;
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

test.afterAll(async () => {
  await pool.query("update app_access set waitlist_on = false");
});

test("someone waiting sees their real place and one way to move up, never a head count or other people", async ({ page }) => {
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
  // no head count and no list of other people (owner, 2026-11-17)
  await expect(page.getByText(/people are waiting|person is waiting/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "The front of the line" })).toHaveCount(0);
  // one plain way to move up, with the real link behind one button
  await expect(page.getByRole("heading", { name: "Every friend who joins moves you up." })).toBeVisible();
  await expect(page.getByTestId("invite-link")).toHaveText(/\/\?invite=[a-z2-9]+$/);
  await expect(page.getByRole("button", { name: /Copy my link|Send my link to a friend/ })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("@");
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
  // nobody is waiting, so the preview shows the real count and the example place is the last one (#1)
  await expect(op.getByTestId("wl-place")).toHaveText("#1");
});

test("a new sign-up goes straight to their place in line, birthday first; the app stays closed until they're let in", async ({ page }) => {
  test.setTimeout(150_000);
  await pool.query("update users set access = 'in' where access = 'waiting'");
  await pool.query("update app_access set waitlist_on = true");
  // Sign-up lands on the waitlist, not setup (owner, 2026-11-21); setup waits until they're let in.
  const email = await signUp(page, "Leo Park", { onboarding: "stay" });
  await page.goto("/");
  await page.waitForURL((u) => u.pathname === "/waitlist");
  await expect(page.getByTestId("wl-place")).toHaveText("#1");
  // The birthday is the first thing asked, and nothing else is shown until it's saved.
  expect(await page.getByRole("heading", { level: 2 }).allTextContents()).toEqual(["First, when's your birthday?"]);
  await page.screenshot({ path: "test-results/waitlist-birthday-phone.png", fullPage: true });
  await page.getByLabel("Birthday month").selectOption("1");
  await page.getByLabel("Birthday day").selectOption("15");
  await page.getByLabel("Birthday year").selectOption("2000");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Every friend who joins moves you up." })).toBeVisible();
  const [{ birth }] = (await pool.query<{ birth: string }>("select preferences->>'birthDate' as birth from users where email = $1", [email])).rows;
  expect(birth).toBe("2000-01-15");
  // The invite card sits at the bottom, after the line and the rules.
  const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
  // The confirm card is a peer section, so its heading is an h2 too, and it comes first (it is the one thing to do here).
  expect(headings).toEqual(["Confirm your email", "Every friend who joins moves you up.", "Try your sky while you wait"]);

  // The confirm card: with no email service in the test run, "Send code" answers plainly; a wrong code says so.
  const card = page.getByRole("region", { name: "Confirm your email" });
  await card.getByRole("button", { name: "Send code" }).click();
  await expect(card.getByRole("alert")).toContainText("aren't available yet");
  await pool.query(
    "insert into email_confirmations (account_id, code_hash, expires_at) select id, 'not-a-real-hash', now() + interval '10 minutes' from users where email = $1 on conflict (account_id) do nothing",
    [email],
  );
  await card.getByLabel("Your code").fill("123456");
  await card.getByRole("button", { name: "Confirm" }).click();
  await expect(card.getByRole("alert")).toContainText("didn't match");
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

  // Let in: the app opens on setup, with the birthday already saved.
  await pool.query("update users set access = 'in' where email = $1", [email]);
  await page.goto("/");
  await expect(page).toHaveURL((u) => u.pathname === "/");
  const [{ onboarding }] = (await pool.query<{ onboarding: string }>("select preferences->>'onboarding' as onboarding from users where email = $1", [email]))
    .rows;
  expect(onboarding).toBe("pending");
  await pool.query("update app_access set waitlist_on = false");
});

test("under 13 on the waitlist's birthday locks the account at once", async ({ page }) => {
  test.setTimeout(120_000);
  await pool.query("update app_access set waitlist_on = true");
  try {
    const email = await signUp(page, "Kid Tester", { onboarding: "stay" });
    await page.goto("/waitlist");
    const year = String(new Date().getFullYear() - 10);
    await page.getByLabel("Birthday month").selectOption("3");
    await page.getByLabel("Birthday day").selectOption("4");
    await page.getByLabel("Birthday year").selectOption(year);
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL((u) => u.pathname === "/welcome");
    const [{ locked }] = (await pool.query<{ locked: string | null }>("select preferences->>'ageBlockedAt' as locked from users where email = $1", [email]))
      .rows;
    expect(locked).toBeTruthy();
  } finally {
    await pool.query("update app_access set waitlist_on = false");
  }
});
