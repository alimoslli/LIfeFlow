import { expect, test } from "@playwright/test";
import { COMPOSER, daytimeZone, queryAsUser, signUp } from "./helpers";

/**
 * Idea clouds (owner, 2026-11-10): beside Today's chat bar and under the skyling in the empty chat, a few short clouds,
 * each one thing to tell or ask the skyling. A new account has no classes, shifts or bank, so nothing is worth noticing yet: a couple
 * of calm white tips that fit anyone show (insight clouds with real data are in insight-clouds-phone.spec.ts). A tap puts the sentence in the chat box, never sends it, and counts the tap (never the text).
 */
const FOR_ANYONE = ["What should I do first today?", "Find me 2 free hours this week.", "My goal: read 12 books this year."];
const ANY = new RegExp(`^(${FOR_ANYONE.map((s) => s.replace(/[?.]/g, "\\$&")).join("|")})$`);
// a new account's tips are the same at any hour the suite runs: after 4 PM a real Tonight cloud would join them
test.use({ timezoneId: daytimeZone() });

test("idea clouds: short, from real data, a tap fills the box and sends nothing", async ({ page }) => {
  const email = await signUp(page, "Cleo Cloud");

  // Today: the clouds fill the middle of a phone's Today, between the sky and the chat bar (owner, 2026-11-10)
  await page.goto("/");
  const today = page.locator('[aria-label="Ideas to try"]:visible').first();
  await expect(today.getByRole("button").first()).toBeVisible();
  expect(await today.getByRole("button").count()).toBeLessThanOrEqual(3);
  const say = await today.locator(".lf-idea-head").first().innerText();
  expect(say.split(/\s+/).length).toBeLessThanOrEqual(8);
  expect(say).not.toMatch(/did you know|assistant/i);
  // the cloud and the name tag sit above Today's bar, never on it (nothing lies over anything)
  const todayBar = page.locator('form[data-tour="skyling"]:visible').first();
  await expect(todayBar).toBeVisible();
  const barTop = (await todayBar.boundingBox())!.y;
  for (const above of [today.getByRole("button").first(), page.locator('[data-testid="ask-skyling"]:visible span.lf-chip-night').first()]) {
    await expect(above).toBeVisible();
    const box = (await above.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(barTop + 0.5);
  }
  // The empty chat: the catchphrase and one cloud at a time, another than Today's first (owner, 2026-11-12: "one idea on
  // the main page one on the skyling page and they change"); a tap fills the box and sends nothing. With reduced motion
  // the clouds stand still (and a test can only click a still element).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/jarvis");
  await expect(page.getByRole("heading", { name: "Let's clear your sky." })).toBeVisible();
  const shown = page.getByRole("list", { name: "Ideas to try" }).locator("li[data-on]");
  await expect(shown).toHaveCount(1);
  expect(await shown.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  const cloud = shown.getByRole("button");
  const [cloudBox, composerBox] = [await cloud.boundingBox(), await page.getByLabel(COMPOSER).boundingBox()];
  expect(cloudBox!.y + cloudBox!.height).toBeLessThanOrEqual(composerBox!.y);
  await cloud.click();
  const box = page.getByLabel(COMPOSER);
  await expect(box).toHaveValue(ANY);
  await expect(page.locator(".lf-bubble-me")).toHaveCount(0);

  // the tap is counted by which cloud it was, never the words
  await expect
    .poll(async () => {
      const [row] = await queryAsUser<{ p: { ideaTaps?: Record<string, number> } }>(email, "select preferences as p from users where email = $1", [email]);
      return Object.values(row.p.ideaTaps ?? {}).reduce((a, b) => a + b, 0);
    })
    .toBe(1);

  // Back on Today: a tap puts it in Today's own chat bar, right there (owner, 2026-11-10: the same chat, no side panel),
  // and the answer comes on Today, in the middle where the clouds were (owner, 2026-11-10)
  await page.goto("/");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await today.getByRole("button").first().click();
  const bar = page.locator('textarea[aria-label="Message Ray"]:visible').first();
  await expect(bar).toHaveValue(ANY);
  const typed = await bar.inputValue();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await page.locator('form[data-tour="skyling"]:visible').getByRole("button", { name: "Send" }).click();
  const reply = page.locator('[data-testid="today-reply"]:visible');
  await expect(reply).toContainText(`You said: ${typed}`.slice(0, 60));
  await expect(page).toHaveURL(/\/$/);
});
