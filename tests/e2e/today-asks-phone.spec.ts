import { expect, test } from "@playwright/test";
import { localInstant, pool, queryAsUser, signUp } from "./helpers";

// What the test students asked for on Today (owner's yes, 2026-11-18), on a phone browser's short window.
test.use({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
const TZ = "America/New_York";
const me = `current_setting('app.user_id')::uuid`;
const inTz = async (email: string) => pool.query("update users set timezone = $2 where email = $1", [email.toLowerCase(), TZ]);
const note = (page: import("@playwright/test").Page) => page.locator('[data-testid="assistant-line"]:visible');

test("the Next line says where, and a tap opens that stop on the day, not the Calendar", async ({ page }) => {
  const email = await signUp(page, "Pia Place");
  await inTz(email);
  const starts = new Date(Date.now() + 2 * 3_600_000);
  await queryAsUser(
    email,
    `insert into calendar_events (user_id, title, kind, location, starts_at, ends_at) values (${me}, 'Chem lab', 'class', 'Arts 247', $1, $2)`,
    [starts, new Date(starts.getTime() + 3_600_000)],
  );
  await page.goto("/");
  await expect(note(page)).toHaveText(/^Next: Chem lab (tomorrow )?at \d{1,2}:\d{2} [AP]M, Arts 247$/);
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-ready", "true");
  await note(page).click();
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-open", "true");
  await expect(page.locator("[data-dc=detail] .dc-d-t")).toHaveText("Chem lab");
  await expect(page).toHaveURL(/\/$/);
});

test("a delivery on the calendar can be ticked done from its card", async ({ page }) => {
  const email = await signUp(page, "Dee Delivers");
  await inTz(email);
  const at = new Date(Date.now() + 3 * 3_600_000);
  const [ev] = await queryAsUser<{ id: string }>(
    email,
    `insert into calendar_events (user_id, title, kind, starts_at, ends_at) values (${me}, 'Deliver Rivera gallery', 'work', $1, $2) returning id`,
    [at, new Date(at.getTime() + 1_800_000)],
  );
  await page.goto("/");
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await page.locator(".dc-node", { hasText: "Deliver Rivera gallery" }).first().click();
  await page.locator("[data-dc=detail]").getByRole("button", { name: "Done" }).click();
  await expect
    .poll(async () => (await queryAsUser<{ done: boolean }>(email, "select done_at is not null as done from calendar_events where id = $1", [ev.id]))[0].done)
    .toBe(true);
  // and the note no longer leads with it
  await page.reload();
  await expect(page.locator('[data-testid="assistant-line"]:visible', { hasText: "Deliver Rivera gallery" })).toHaveCount(0);
});

test("Today says the work day: the shift when there is one", async ({ page }) => {
  const email = await signUp(page, "Wes Works");
  await inTz(email);
  const [job] = await queryAsUser<{ id: string }>(email, `insert into employers (user_id, name) values (${me}, 'Target') returning id`);
  // a class first, so the note is about the class and the work line says the shift
  const cls = new Date(Date.now() + 60 * 60_000);
  await queryAsUser(email, `insert into calendar_events (user_id, title, kind, starts_at, ends_at) values (${me}, 'Stats', 'class', $1, $2)`, [
    cls,
    new Date(cls.getTime() + 30 * 60_000),
  ]);
  const shift = new Date(Date.now() + 2 * 3_600_000);
  // only when the shift is still today in New York (late at night it would be tomorrow's)
  const [{ same }] = await queryAsUser<{ same: boolean }>(
    email,
    `select ($1::timestamptz at time zone '${TZ}')::date = (now() at time zone '${TZ}')::date as same`,
    [shift],
  );
  test.skip(!same, "the shift would fall on tomorrow");
  await queryAsUser(email, `insert into work_shifts (user_id, employer_id, starts_at, ends_at) values (${me}, $1, $2, $3)`, [
    job.id,
    shift,
    new Date(shift.getTime() + 60 * 60_000),
  ]);
  await page.goto("/");
  await expect(page.locator('[data-testid="work-today"]:visible')).toHaveText(/^Work today: Target, \d{1,2}:\d{2}/);
});

test("Thanksgiving is on the Calendar for a US time zone", async ({ page }) => {
  const email = await signUp(page, "Tess Thanks");
  await inTz(email);
  await page.goto("/calendar?month=2026-11&date=2026-11-26");
  await expect(page.getByTestId("holiday-day")).toHaveText("Thanksgiving");
});

test("at midday the closed sky no longer says when the sun rose", async ({ page }) => {
  const email = await signUp(page, "Sol Noon");
  await inTz(email);
  await page.clock.setFixedTime(localInstant(TZ, 12, 30));
  await page.goto("/");
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("[data-dc=dome] text.dc-rim-t", { hasText: "Sunrise" })).toHaveCount(0);
});

test("the opened day moves with a finger swipe", async ({ page }) => {
  await signUp(page, "Sam Swipe");
  await page.goto("/");
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-open", "true");
  const wrap = page.locator(".dc-trackwrap");
  await page.waitForTimeout(800);
  const before = await wrap.evaluate((el) => el.scrollLeft);
  const box = (await wrap.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const y = box.y + box.height * 0.45;
  const pt = (x: number) => [{ x, y }];
  const x0 = box.x + box.width * 0.75;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(x0) });
  for (let i = 1; i <= 12; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(x0 - (200 * i) / 12) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => wrap.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before + 50);
});
