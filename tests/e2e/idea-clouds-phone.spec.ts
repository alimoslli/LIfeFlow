import { expect, test } from "@playwright/test";
import { COMPOSER, queryAsUser, signUp } from "./helpers";

/**
 * Idea clouds (owner, 2026-11-10): beside Today's chat bar and under the skyling in the empty chat, a few short clouds,
 * each one thing to tell or ask the skyling. A new account has no classes, shifts or bank, so only the ones that fit
 * anyone show. A tap puts the sentence in the chat box, never sends it, and counts the tap (never the text).
 */
const FOR_ANYONE = ["What should I do first today?", "Find me 2 free hours this week.", "My goal: read 12 books this year."];
const ANY = new RegExp(`^(${FOR_ANYONE.map((s) => s.replace(/[?.]/g, "\\$&")).join("|")})$`);

test("idea clouds: short, from real data, a tap fills the box and sends nothing", async ({ page }) => {
  const email = await signUp(page, "Cleo Cloud");

  // Today: one cloud beside the skyling's name tag on a phone, not over the sky
  await page.goto("/");
  const today = page.locator('[aria-label="Ideas to try"]:visible').first();
  await expect(today.getByRole("button")).toHaveCount(1);
  const say = await today.getByRole("button").first().innerText();
  expect(say.split(/\s+/).length).toBeLessThanOrEqual(8);
  expect(say).not.toMatch(/did you know|assistant/i);
  // The empty chat: the catchphrase and three clouds; a tap fills the box and sends nothing. With reduced motion the
  // clouds stand still (and a test can only click a still element).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/jarvis");
  expect(
    await page
      .locator(".lf-idea")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await expect(page.getByRole("heading", { name: "Let's clear your sky." })).toBeVisible();
  const clouds = page.getByRole("list", { name: "Ideas to try" }).getByRole("button");
  await expect(clouds).toHaveCount(3);
  await clouds.first().click();
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
  // and sending it goes on in the chat page
  await page.goto("/");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await today.getByRole("button").first().click();
  const bar = page.locator('input[aria-label="Message Ray"]:visible').first();
  await expect(bar).toHaveValue(ANY);
  const typed = await bar.inputValue();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await page.locator('form[data-tour="skyling"]:visible').getByRole("button", { name: "Send" }).click();
  await page.waitForURL("**/jarvis?ask=*");
  await expect(page.locator(".lf-bubble-me").first()).toContainText(typed);
});
