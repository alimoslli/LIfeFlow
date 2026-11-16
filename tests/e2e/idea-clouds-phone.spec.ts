import { expect, test } from "@playwright/test";
import { COMPOSER, queryAsUser, signUp } from "./helpers";

/**
 * Idea clouds (owner, 2026-11-10): under the skyling in the empty chat (and beside a laptop's bar on Today; never on a
 * phone's Today since 2026-11-16), a few short clouds,
 * each one thing to tell or ask the skyling. A new account has no classes, shifts or bank, so nothing is worth noticing yet: a couple
 * of calm white tips that fit anyone show (insight clouds with real data are in insight-clouds-phone.spec.ts). A tap puts the sentence in the chat box, never sends it, and counts the tap (never the text).
 */
const FOR_ANYONE = ["What should I do first today?", "Find me 2 free hours this week.", "My goal: read 12 books this year."];
const ANY = new RegExp(`^(${FOR_ANYONE.map((s) => s.replace(/[?.]/g, "\\$&")).join("|")})$`);

test("idea clouds: short, from real data, a tap fills the box and sends nothing", async ({ page }) => {
  const email = await signUp(page, "Cleo Cloud");

  // Today on a phone has no idea clouds (owner, 2026-11-16, item 2): its middle is the skyling's one note
  await page.goto("/");
  await expect(page.getByTestId("day-clock")).toBeVisible();
  await expect(page.locator('[aria-label="Ideas to try"]:visible')).toHaveCount(0);
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
  // three on a tall screen; a phone in a browser (664 px) shows two, so none is cut in half by the message box
  await expect(clouds).toHaveCount(2);
  for (const c of await clouds.all()) {
    const [cloud, box] = [await c.boundingBox(), await page.getByLabel(COMPOSER).boundingBox()];
    expect(cloud!.y + cloud!.height).toBeLessThanOrEqual(box!.y);
  }
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
});
