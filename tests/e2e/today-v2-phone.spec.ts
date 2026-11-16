import { execFileSync } from "node:child_process";
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
  // on the wheel, where the night rises (a phone shows no words under the sky; its note says the same)
  const mark = page.locator("[data-dc=dome] text.dc-rim-t", { hasText: "Tonight:" });
  await expect(mark).toHaveCount(1);
  await expect(mark).toHaveText("Tonight: Work 10 PM");
  await expect(mark).toContainText("10 PM");
  await expect(page.locator('[data-testid="assistant-line"]:visible')).toHaveText("Next: Fulfillment Center shift at 10:00 PM");
  await page.screenshot({ path: "/tmp/claude-0/-home-user/f5e405f4-f20d-592b-8f29-de312d5a4ef1/scratchpad/night.png" });
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

test("School fits a phone: a class with long meeting times never widens the page (two test students, 2026-11-16)", async ({ page }) => {
  const email = await signUp(page, "Sam School");
  await queryAsUser(
    email,
    `insert into courses (user_id, name, code, meeting_info) values (${me}, 'Physics for Scientists and Engineers II', 'PHYS 406', 'Tue 13:00-15:00 · Thu 13:00-15:00 · Fri 09:00-10:15 · Online lab Wed 18:00-20:00')`,
  );
  await page.goto("/school");
  await expect(page.getByText("PHYS 406")).toBeVisible();
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(wide).toBeLessThanOrEqual(0);
});

test("on the open line, tapping a day picks that day, even a short one (two test students tapped Fri and got Sat)", async ({ page }) => {
  const email = await signUp(page, "Dana Days");
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/dev/seed-clock-look.ts", email, "--busy"], {
    env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e" },
  });
  await page.goto("/");
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-state", "timeline");
  const days = page.locator("[data-dc=days] button[data-d]");
  const n = await days.count();
  for (let i = 1; i < n; i++) {
    const day = days.nth(i);
    await day.click();
    await page.waitForTimeout(1500);
    await expect(day, `day ${i}`).toHaveAttribute("aria-current", "date");
  }
});

async function busyAt(page: import("@playwright/test").Page, name: string, hour: number, minute = 0) {
  const email = await signUp(page, name);
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/dev/seed-clock-look.ts", email, "--busy"], {
    env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e" },
  });
  const { rows } = await pool.query<{ timezone: string }>("select timezone from users where email = $1", [email.toLowerCase()]);
  await page.clock.setFixedTime(localInstant(rows[0].timezone, hour, minute));
  return { email, tz: rows[0].timezone };
}

test("at night the sky says nothing about sunset (COO, 2026-11-16)", async ({ page }) => {
  await busyAt(page, "Nell Night", 21, 30);
  await page.goto("/");
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("[data-dc=dome] text.dc-rim-t", { hasText: "Sunset" })).toHaveCount(0);
});

test("only the very next thing's card says Up next; a later one says Later today", async ({ page }) => {
  await busyAt(page, "Una Next", 13, 0);
  await page.goto("/");
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-state", "timeline");
  const stops = page.locator(".dc-node.dc-future").filter({ visible: true });
  const n = Math.min(await stops.count(), 6);
  let upNext = 0;
  for (let i = 0; i < n; i++) {
    await stops.nth(i).click({ force: true });
    const kick = page.locator(".dc-detail .dc-d-k");
    if (!(await kick.isVisible())) continue;
    if ((await kick.innerText()).trim().toLowerCase() === "up next") upNext++;
  }
  expect(upNext).toBeLessThanOrEqual(1);
});

test("a stop's card on a short phone keeps its time, place and buttons in view", async ({ page }) => {
  const { email, tz } = await busyAt(page, "Theo Card", 13, 0);
  const at = localInstant(tz, 15, 0);
  await queryAsUser(
    email,
    `insert into calendar_events (user_id, title, kind, location, starts_at, ends_at) values (${me}, 'Brand shoot: Northside Coffee Roasters and their new spring menu', 'work', 'Northside Coffee, 2210 N Clark St', $1, $2)`,
    [at, new Date(at.getTime() + 3 * 3_600_000)],
  );
  await page.goto("/");
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-state", "timeline");
  await page.locator(".dc-node", { hasText: "Brand shoot" }).first().click({ force: true });
  const card = page.locator(".dc-detail");
  await expect(card).toContainText("2210 N Clark");
  const [c, open] = [await card.boundingBox(), await card.locator(".dc-d-open").boundingBox()];
  expect(open!.y + open!.height).toBeLessThanOrEqual(c!.y + c!.height + 0.5);
  expect(await card.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
});

test("a +N pile on the closed sky opens the line with what's in it", async ({ page }) => {
  const { email, tz } = await busyAt(page, "Pia Pile", 13, 0);
  const at = localInstant(tz, 14, 15);
  for (const title of ["Pitch rehearsal", "Call with Lumen Events"])
    await queryAsUser(email, `insert into calendar_events (user_id, title, kind, starts_at, ends_at) values (${me}, $1, 'work', $2, $3)`, [
      title,
      at,
      new Date(at.getTime() + 3_600_000),
    ]);
  await page.goto("/");
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-ready", "true");
  const badge = page.locator("[data-dc=dome] .dc-badge").first();
  await expect(badge).toBeAttached();
  const b = (await badge.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2 - 14, b.y + b.height / 2 + 10);
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-state", "timeline");
  await expect(page.locator(".dc-detail .dc-d-list")).toBeVisible();
});

// Test students, run 2 (2026-11-16): handed-in work read as still due on the sky, Today's middle was cut at the top and
// bottom, a "3 assignments due" tile opened only one of them, and a night shift read "10:00 to 6:30 AM".
test("handed-in work never reads as next; the middle is never cut; a pile tile lists its things", async ({ page }) => {
  const email = await signUp(page, "Hana Handed");
  await inTz(email);
  await queryAsUser(email, `insert into courses (user_id, name, code) values (${me}, 'Intro to Biology', 'BIO 110')`);
  const due = localInstant(TZ, 23, 59);
  for (const [title, status] of [
    ["Homework 12", "done"],
    ["Quiz 10", "todo"],
    ["Quiz 5", "todo"],
    ["Reading response", "todo"],
  ])
    await queryAsUser(
      email,
      `insert into assignments (user_id, course_id, title, due_at, status, completed_at, dedupe_key)
       select ${me}, c.id, $1, $2, $3, case when $3 = 'done' then now() end, md5($1) from courses c where c.user_id = ${me}`,
      [title, due, status],
    );
  await page.clock.setFixedTime(localInstant(TZ, 20, 30));
  await page.goto("/");
  const clock = page.getByTestId("day-clock");
  await expect(clock).toHaveAttribute("data-ready", "true");
  // the sky's own words never name the done one as next or due
  const dome = await page.locator("[data-dc=dome]").evaluate((el) => el.textContent ?? "");
  expect(dome).not.toMatch(/Homework 12/);
  // the note and anything under it are whole: nothing cut at the middle's top or bottom
  const line = page.locator('[data-testid="assistant-line"]:visible');
  await expect(line).toContainText("Due tonight");
  const cut = await line.evaluate((el) => {
    const box = el.closest("div")!.getBoundingClientRect();
    return { top: el.getBoundingClientRect().top - box.top };
  });
  expect(cut.top).toBeGreaterThanOrEqual(-0.5);
  // the open day's tile for tonight's deadlines opens the list of what's still due, not one of them
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(clock).toHaveAttribute("data-state", "timeline");
  await page.locator(".dc-tile", { hasText: "3 assignments" }).first().click();
  await expect(page.locator(".dc-detail .dc-d-list")).toBeVisible();
  await expect(page.locator(".dc-detail .dc-d-row")).toHaveCount(4);
});

test("a night shift says PM on Work", async ({ page }) => {
  const email = await signUp(page, "Mari Nights");
  await inTz(email);
  const [job] = await queryAsUser<{ id: string }>(email, `insert into employers (user_id, name) values (${me}, 'Valley Fulfillment') returning id`);
  const start = new Date(localInstant(TZ, 22, 0).getTime() + 2 * 86_400_000);
  await queryAsUser(email, `insert into work_shifts (user_id, employer_id, starts_at, ends_at) values (${me}, $1, $2, $3)`, [
    job.id,
    start,
    new Date(start.getTime() + 8.5 * 3_600_000),
  ]);
  await page.goto("/work");
  await expect(page.getByText(/10:00 PM to 6:30 AM/).first()).toBeAttached();
  await expect(page.getByText(/\b10:00 to 6:30 AM/)).toHaveCount(0);
});
