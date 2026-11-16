import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { localInstant, pool, queryAsUser, signUp } from "./helpers";

// What the test user (.claude/agents/test-user.md) ran into on a phone browser's short window, 2026-11-16.
const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e";
const SHORT = { viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true };

async function busyDay(email: string) {
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/dev/seed-clock-look.ts", email, "--busy"], {
    env: { ...process.env, DATABASE_URL: E2E_DB },
  });
  const { rows } = await pool.query<{ timezone: string }>("select timezone from users where email = $1", [email.toLowerCase()]);
  return rows[0].timezone;
}

test("a stop's card on the open line ends above the chat bar and the skyling on it", async ({ browser }) => {
  const context = await browser.newContext(SHORT);
  const page = await context.newPage();
  const email = await signUp(page, "Nadia Card");
  const tz = await busyDay(email);
  await page.clock.setFixedTime(localInstant(tz, 15, 20));
  await page.goto("/");
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-state", "timeline");
  // every stop on today's line, one after another: none of their cards may reach the bar
  const stops = page.locator(".dc-node").filter({ visible: true });
  const n = Math.min(await stops.count(), 6);
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    await stops.nth(i).click({ force: true });
    const card = page.locator(".dc-detail");
    if (!(await card.isVisible())) continue;
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const c = document.querySelector(".dc-detail")!.getBoundingClientRect();
      const dock = document.querySelector(".dc-dock")!;
      const tops = [dock, ...dock.querySelectorAll("*")].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0);
      // nor over the day's tiles: on a short phone the card takes their place, and they step aside
      const tiles = document.querySelector(".dc-tiles")!;
      const t = tiles.getBoundingClientRect();
      const tilesShown = getComputedStyle(tiles).visibility !== "hidden" && t.bottom > c.top && t.top < c.bottom;
      return { bottom: c.bottom, floor: Math.min(...tops.map((b) => b.top)), tilesShown };
    });
    expect(r.bottom, `card ${i} ends at ${r.bottom}, the bar and skyling start at ${r.floor}`).toBeLessThanOrEqual(r.floor);
    expect(r.tilesShown, `card ${i} lies over the day's tiles`).toBe(false);
  }
  await context.close();
});

test("a page with a way back frosts its top bar as soon as it scrolls, so its title never sits under the back button", async ({ page }) => {
  await signUp(page, "Nadia Bills");
  await page.goto("/finances/bills");
  const bar = page.locator("header.lf-appbar");
  await expect(bar).not.toHaveClass(/lf-appbar-scrolled/);
  await page.mouse.wheel(0, 20);
  await expect(bar).toHaveClass(/lf-appbar-scrolled/);
});

test("before sunrise the night's star line counts the day before as yesterday", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const email = await signUp(page, "Nadia Stars");
  const tz = await busyDay(email);
  // 9:30 PM: what was done today
  await page.clock.setFixedTime(localInstant(tz, 21, 30));
  await page.goto("/");
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-ready", "true");
  const line = page.locator("[data-dc=dome] text.dc-stars-t");
  await expect(line).toHaveText(/^\d+ stars? today$/);
  // 1:30 AM the next morning, still night: the same stars, said as yesterday's
  await page.clock.setFixedTime(new Date(localInstant(tz, 21, 30).getTime() + 4 * 3_600_000));
  await page.reload();
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-ready", "true");
  await expect(line).toHaveText(/^\d+ stars? yesterday$/);
  await context.close();
});

test("Money's bills line names a weekday only within the coming week, the date after that", async ({ page }) => {
  const email = await signUp(page, "Nadia Hulu");
  const me = `current_setting('app.user_id')::uuid`;
  const today = `(now() at time zone (select timezone from users where id = ${me}))::date`;
  await queryAsUser(
    email,
    `insert into financial_accounts (user_id, name, type, subtype, current_balance_cents) values (${me}, 'Checking', 'depository', 'checking', 50000)`,
  );
  await queryAsUser(
    email,
    `insert into recurring_items (user_id, name, amount_cents, frequency, kind, next_due_date) values (${me}, 'Hulu', -999, 'monthly', 'subscription', ${today} + 8)`,
  );
  const [{ due }] = await queryAsUser<{ due: string }>(email, `select to_char(${today} + 8, 'Mon FMDD') as due`);
  await page.goto("/money");
  await expect(page.getByRole("link", { name: /Bills and subscriptions/ })).toContainText(`Hulu ${due}`);
});
