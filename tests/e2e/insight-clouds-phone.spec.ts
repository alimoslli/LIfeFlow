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
  expect(said[0]).toMatch(/^Rent \$850 due \w+, \$230 short$/);
  expect(said[1]).toMatch(/^Lab 4 (is )?due \w+, you work /);
  expect(said.join(" | ")).not.toMatch(/did you know|assistant|\bAI\b|—|missed|behind|slipping/i);
  for (const t of said) expect(t.split(/\s+/).length, t).toBeLessThanOrEqual(9);
  // weather: the shortfall and the clash are storms, with rain behind the words
  const clouds = row(page).locator(".lf-idea-cloud");
  await expect(clouds.nth(0)).toHaveAttribute("data-weather", "storm");
  await expect(clouds.nth(1)).toHaveAttribute("data-weather", "storm");
  await expect(row(page).locator(".lf-thought-rain").first()).toBeAttached();
  // a phone's Today (owner, 2026-11-12: "make each cloud fit the screen almost", then "one idea on the main page ... and
  // they change"): one cloud at a time, nearly the screen's width; a dot (or a swipe) brings the next, the others wait unseen
  const shown = row(page).locator("li[data-on]");
  await expect(shown).toHaveCount(1);
  const first = (await shown.locator(".lf-idea-cloud").boundingBox())!;
  expect(first.width).toBeGreaterThanOrEqual(393 * 0.75);
  expect(first.x).toBeGreaterThanOrEqual(0);
  expect(first.x + first.width).toBeLessThanOrEqual(393);
  const dots = page.getByRole("button", { name: /^Idea \d of \d$/ });
  await expect(dots).toHaveCount(said.length);
  await expect(dots.nth(0)).toHaveAttribute("aria-current", "true");
  await dots.nth(1).click();
  await expect(dots.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(shown).toContainText(said[1]);
  await dots.nth(0).click();
  await expect(shown).toContainText(said[0]);
  // the cloud's button is a real tap target, and the cloud sits above Today's bar, never on it
  expect((await shown.getByRole("button").first().boundingBox())!.height).toBeGreaterThanOrEqual(30);
  await shoot(page, "busy-student-day");
  const bar = page.locator('form[data-tour="skyling"]:visible').first();
  const barTop = (await bar.boundingBox())!.y;
  expect(first.y + first.height).toBeLessThanOrEqual(barTop + 0.5);

  // a tap that asks: the grey heads-up fills the bar, nothing is sent; while the bar has words the clouds step aside
  // (owner, 2026-11-12: "make sure when we text ray they dont get in the way")
  const box = page.locator('textarea[aria-label="Message Ray"]:visible').first();
  const quizAt = said.findIndex((t) => /^Quiz 2 due/.test(t));
  if (quizAt >= 0) {
    await dots.nth(quizAt).click();
    await row(page)
      .getByRole("button", { name: /Quiz 2 due/ })
      .click();
    await expect(box).toHaveValue(/^Help me finish Quiz 2 before it's due/);
    await expect(page.locator(".lf-bubble-me")).toHaveCount(0);
    // the used cloud leaves and the next flows in, never an empty sky ("the other cloud flows in never empty"); while the
    // box has words the cloud dims and holds still
    await expect(row(page).getByRole("button", { name: /Quiz 2 due/ })).toHaveCount(0);
    await expect(shown).toHaveCount(1);
    await expect(page.locator(".lf-idea-stack")).toHaveCSS("opacity", "0.5");
    await box.fill("");
    await box.blur();
    await expect(page.locator(".lf-idea-stack")).toHaveCSS("opacity", "1");
    await dots.nth(0).click();
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
  // on to the grey heads-up, the last one
  const last = () =>
    page
      .getByRole("button", { name: /^Idea \d of \d$/ })
      .last()
      .click();
  await last();
  await shoot(page, "busy-student-night-grey");
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/");
  await last();
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
  expect(await heads(page)).toContainEqual(expect.stringMatching(/^Lab 4 (is )?due|^Quiz 2 due/));
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
