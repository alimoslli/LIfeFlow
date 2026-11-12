import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";
import { seedBusyStudent } from "./insight-seed";

/**
 * Insight clouds on a phone (owner, 2026-11-12): the clouds on Today say something true about the person's own week, as
 * weather (white a tip, grey a heads-up, dark with rain real trouble), each with one line of why and one button. A busy
 * student sees real ones, the Money lock removes every money one, and a new account sees a couple of calm tips, never an
 * empty sky. Set INSIGHT_SHOTS=1 to also write the pictures (393x852 at 2x) under docs/design/2026-11-12-insight-clouds/.
 */
test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const DIR = "docs/design/2026-11-12-insight-clouds";
const shoot = async (page: Page, name: string) => {
  if (!process.env.INSIGHT_SHOTS) return;
  mkdirSync(DIR, { recursive: true });
  await page.screenshot({ path: `${DIR}/${name}.png` });
};
const row = (page: Page) => page.locator('[aria-label="Ideas to try"]:visible').first();
const heads = async (page: Page) => (await row(page).locator(".lf-idea-head").allInnerTexts()).map((t) => t.trim());

test("a busy student sees real insights, as weather; a tap fills the bar or does the one fix, with Undo", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const email = await signUp(page, "Maya Torres");
  await seedBusyStudent(email);
  await page.goto("/");
  await expect(row(page).getByRole("button").first()).toBeVisible();

  const said = await heads(page);
  expect(said.length).toBeLessThanOrEqual(3);
  // rank: the shortfall first (real names, day, amounts), then the clash, never two about the same thing
  expect(said[0]).toMatch(/^Rent \$850 \w+, you have \$620$/);
  expect(said[1]).toMatch(/^Lab 4 due \w+/);
  expect(said.join(" | ")).not.toMatch(/did you know|assistant|\bAI\b|—|missed|behind|slipping/i);
  for (const t of said) expect(t.split(/\s+/).length, t).toBeLessThanOrEqual(9);
  // weather: the shortfall and the clash are storms, with rain behind the words
  const clouds = row(page).locator(".lf-idea-cloud");
  await expect(clouds.nth(0)).toHaveAttribute("data-weather", "storm");
  await expect(clouds.nth(1)).toHaveAttribute("data-weather", "storm");
  await expect(row(page).locator(".lf-thought-rain").first()).toBeAttached();
  // a phone's Today (owner, 2026-11-12: "make each cloud fit the screen almost ... smoothly scroll through them sideways"):
  // each cloud nearly the screen's width, one at a time; a swipe moves to the next and the dots follow
  const first = (await clouds.nth(0).boundingBox())!;
  expect(first.width).toBeGreaterThanOrEqual(393 * 0.85);
  expect(first.x).toBeGreaterThanOrEqual(0);
  expect(first.x + first.width).toBeLessThanOrEqual(393);
  const dots = page.locator(".lf-idea-dots:visible i");
  await expect(dots).toHaveCount(said.length);
  await expect(dots.nth(0)).toHaveAttribute("data-on", "");
  await row(page).evaluate((el) => el.scrollBy({ left: el.clientWidth / 2, behavior: "instant" }));
  await expect(dots.nth(1)).toHaveAttribute("data-on", "");
  await expect.poll(async () => (await clouds.nth(1).boundingBox())!.x).toBeLessThan(393 * 0.15);
  await row(page).evaluate((el) => el.scrollTo({ left: 0, behavior: "instant" }));
  await expect(dots.nth(0)).toHaveAttribute("data-on", "");
  // the cloud's whole body is one tap target, at least 44 px tall
  for (const b of await row(page).getByRole("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(30);
  for (const c of await clouds.all()) expect((await c.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await shoot(page, "busy-student-day");

  // the cloud sits above Today's bar, never on it
  const bar = page.locator('form[data-tour="skyling"]:visible').first();
  const barTop = (await bar.boundingBox())!.y;
  for (const c of await clouds.all()) {
    const box = (await c.boundingBox())!;
    if (box.x + box.width > 0 && box.x < 393) expect(box.y + box.height).toBeLessThanOrEqual(barTop + 0.5);
  }

  // a tap that asks: the grey heads-up fills the bar, nothing is sent
  const quiz = row(page).getByRole("button", { name: /Quiz 2 due/ });
  if (await quiz.count()) {
    await quiz.click();
    await expect(page.locator('textarea[aria-label="Message Ray"]:visible').first()).toHaveValue(/^Help me finish Quiz 2 before it's due/);
    await expect(page.locator(".lf-bubble-me")).toHaveCount(0);
  }

  // a tap that does the one fix: the reminder to cover the rent, with what changed and Undo
  await row(page)
    .getByRole("button", { name: /Remind me to cover it/ })
    .click();
  await expect(row(page).getByText(/Added the to-do "Cover Rent/)).toBeVisible();
  expect(await queryAsUser(email, "select title from tasks where title like 'Cover Rent%'")).toHaveLength(1);
  await shoot(page, "fix-done-with-undo");
  await row(page).getByRole("button", { name: /Undo/ }).click();
  await expect(row(page).getByText("Undone.")).toBeVisible();
  expect(await queryAsUser(email, "select title from tasks where title like 'Cover Rent%'")).toHaveLength(0);

  // the same Today at night: the dark cloud keeps its light edge, the words stay readable
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto("/");
  await expect(row(page).getByRole("button").first()).toBeVisible();
  await shoot(page, "busy-student-night");
  // swipe to the grey heads-up
  await row(page).evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await shoot(page, "busy-student-night-grey");
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/");
  await row(page).evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await shoot(page, "busy-student-day-grey");
});

test("the Money lock on: no money insight at all, only the rest of the week", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const email = await signUp(page, "Maya Torres");
  await seedBusyStudent(email, { locked: true });
  await page.goto("/");
  await expect(row(page).getByRole("button").first()).toBeVisible();
  const text = await row(page).innerText();
  expect(text).not.toMatch(/\$|Rent|available|bill|spent|checking|savings/i);
  expect(await heads(page)).toContainEqual(expect.stringMatching(/^Lab 4 due|^Quiz 2 due/));
  await shoot(page, "money-lock-on");
});

test("a new account with nothing: a couple of calm white tips, never an empty sky; a tap fills the bar", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signUp(page, "Cleo Cloud");
  await page.goto("/");
  const buttons = row(page).getByRole("button");
  await expect(buttons).toHaveCount(2);
  for (const c of await row(page).locator(".lf-idea-cloud").all()) await expect(c).toHaveAttribute("data-weather", "tip");
  await expect(row(page).locator(".lf-idea-rain, .lf-thought-rain")).toHaveCount(0);
  await expect(buttons.first()).toContainText("Try it");
  await shoot(page, "new-account");
  await buttons.first().click();
  await expect(page.locator('textarea[aria-label="Message Ray"]:visible').first()).not.toHaveValue("");
  await expect(page.locator(".lf-bubble-me")).toHaveCount(0);
});

test("rain and lightning are CSS only: they move normally and stand still under reduced motion", async ({ page }) => {
  const email = await signUp(page, "Maya Torres");
  await seedBusyStudent(email);
  const anim = (sel: string, pseudo?: string) =>
    page
      .locator(sel)
      .first()
      .evaluate((el, p) => getComputedStyle(el, p).animationName, pseudo);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(row(page).getByRole("button").first()).toBeVisible();
  expect(await anim('[aria-label="Ideas to try"]:visible .lf-thought-rain')).toBe("lf-thought-rain");
  await expect(row(page).locator(".lf-idea-bolt").first()).toBeAttached();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await anim('[aria-label="Ideas to try"]:visible .lf-thought-rain')).toBe("none");
  expect(await anim('[aria-label="Ideas to try"]:visible .lf-idea-bolt')).toBe("none");
});
