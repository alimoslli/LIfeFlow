import { expect, test } from "@playwright/test";
import { localInstant, pool, queryAsUser, signUp } from "./helpers";

// The owner's Today list (2026-11-16, all seven approved), on a phone browser's short window.
test.use({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
const TZ = "America/New_York";
const me = `current_setting('app.user_id')::uuid`;
const inTz = async (email: string) => pool.query("update users set timezone = $2 where email = $1", [email.toLowerCase(), TZ]);

test("Today's note is the next real thing, with no idea clouds under it", async ({ page }) => {
  const email = await signUp(page, "Nora Next");
  await inTz(email);
  const starts = new Date(Date.now() + 2 * 3_600_000);
  await queryAsUser(email, `insert into calendar_events (user_id, title, kind, starts_at, ends_at) values (${me}, 'Chem lab', 'class', $1, $2)`, [
    starts,
    new Date(starts.getTime() + 3_600_000),
  ]);
  await page.goto("/");
  await expect(page.locator('[data-testid="assistant-line"]:visible')).toHaveText(/^Next: Chem lab (tomorrow )?at \d{1,2}:\d{2} [AP]M$/);
  await expect(page.locator('[aria-label="Ideas to try"]:visible')).toHaveCount(0);
});

test("by day, tonight's night shift is on the sky with its time", async ({ page }) => {
  const email = await signUp(page, "Nico Night");
  await inTz(email);
  const [job] = await queryAsUser<{ id: string }>(email, `insert into employers (user_id, name) values (${me}, 'Fulfillment Center') returning id`);
  const start = localInstant(TZ, 22, 0);
  await queryAsUser(email, `insert into work_shifts (user_id, employer_id, starts_at, ends_at) values (${me}, $1, $2, $3)`, [
    job.id,
    start,
    new Date(start.getTime() + 8.5 * 3_600_000),
  ]);
  await page.clock.setFixedTime(localInstant(TZ, 13, 0));
  await page.goto("/");
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-ready", "true");
  const words = page.locator(".dc-w-after");
  await expect(words).toBeVisible();
  await expect(words).toContainText("Tonight");
  await expect(words).toContainText("Fulfillment Center");
  await expect(words).toContainText("10 PM");
});

test("client work sits under Work by its tag, a delivery as due", async ({ page }) => {
  const email = await signUp(page, "Theo Shoots");
  await inTz(email);
  const meet = new Date(Date.now() + 26 * 3_600_000);
  await queryAsUser(
    email,
    `insert into calendar_events (user_id, title, kind, starts_at, ends_at) values (${me}, 'Pitch with Northside Bakery', 'work', $1, $2)`,
    [meet, new Date(meet.getTime() + 3_600_000)],
  );
  const [{ day }] = await queryAsUser<{ day: string }>(email, `select to_char((now() at time zone '${TZ}')::date + 2, 'YYYY-MM-DD') as day`);
  await queryAsUser(
    email,
    `insert into calendar_events (user_id, title, kind, all_day, starts_at, ends_at) values (${me}, 'Deliver Rivera wedding gallery', 'work', true, ($1::date)::timestamp at time zone '${TZ}', (($1::date) + 1)::timestamp at time zone '${TZ}')`,
    [day],
  );
  await queryAsUser(email, `insert into calendar_events (user_id, title, kind, starts_at, ends_at) values (${me}, 'Dinner with Sam', 'personal', $1, $2)`, [
    meet,
    new Date(meet.getTime() + 3_600_000),
  ]);
  await page.goto("/work");
  const list = page.getByRole("region", { name: "Meetings, shoots and deliveries" });
  await expect(list).toContainText("Pitch with Northside Bakery");
  await expect(list).toContainText(/Deliver Rivera wedding gallery\s*Due /);
  await expect(list).not.toContainText("Dinner with Sam");
});

test("Money's first screen is Available now; the month and the next 30 days are one tap deeper", async ({ page }) => {
  const email = await signUp(page, "Mona Money");
  await queryAsUser(
    email,
    `insert into financial_accounts (user_id, name, type, subtype, current_balance_cents) values (${me}, 'Checking', 'depository', 'checking', 50000)`,
  );
  await page.goto("/money");
  await expect(page.getByRole("region", { name: "Available now" })).toBeVisible();
  const month = page.getByTestId("money-month");
  await expect(month.getByRole("region", { name: "Next 30 days" })).toBeHidden();
  await month.locator("summary").click();
  await expect(month.getByRole("region", { name: "Next 30 days" })).toBeVisible();
  await expect(month.getByRole("region", { name: "Spent and came in" })).toBeVisible();
});

test("the Calendar has no week chart", async ({ page }) => {
  await signUp(page, "Cal Endar");
  await page.goto("/plan");
  await expect(page.getByRole("heading", { name: "Your week", exact: true })).toHaveCount(0);
});
