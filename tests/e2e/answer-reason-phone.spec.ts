import { expect, test } from "@playwright/test";
import { askJarvis, queryAsUser, signUp } from "./helpers";

/**
 * Why an answer got a thumbs-down (owner, 2026-11-27, item 3): one tap more, four fixed reasons, never typed words. Behind the
 * server setting SKYLING_RATING_WHY (off in the app until the owner says yes on the picture; the browser tests turn it on).
 * SHOTS=<folder> saves the pictures for him.
 */
test("a thumbs-down asks why in one tap and keeps only the reason", async ({ page }) => {
  const email = await signUp(page, "Robin Vale");
  await page.goto("/jarvis");
  await askJarvis(page, "what should I do first tonight?");
  // the chat's answer: its thumbs sit right under it (the newest one is last)
  const answer = page.locator("main");
  const down = page.getByRole("button", { name: "Bad answer" }).last();
  await expect(down).toBeVisible();
  // a tap before the chat has hydrated is lost: tap until the question shows
  await expect(async () => {
    if ((await down.getAttribute("aria-pressed")) !== "true") await down.click({ timeout: 2000 });
    await expect(answer.getByRole("group", { name: "What was off?" })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  for (const label of ["Too long", "Got it wrong", "Didn't do it", "Missed the point"]) {
    // the chat loads the answer again right after it lands; measure once it has settled
    await expect(async () => {
      const box = await answer.getByRole("button", { name: label }).filter({ visible: true }).first().boundingBox({ timeout: 2000 });
      expect(box?.height ?? 0, `${label} is big enough to tap`).toBeGreaterThanOrEqual(32);
    }).toPass({ timeout: 15_000 });
  }
  if (process.env.SHOTS) {
    await page.waitForTimeout(1200); // the reload's fade-in, for the picture only
    await page.screenshot({ path: `${process.env.SHOTS}/answer-reason-asking.png` });
    await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${process.env.SHOTS}/answer-reason-asking-dark.png` });
    await page.evaluate(() => delete document.documentElement.dataset.theme);
  }
  await answer.getByRole("button", { name: "Too long" }).filter({ visible: true }).first().click();
  await expect(answer.getByRole("status").filter({ hasText: "That helps me do better" })).toHaveText("Got it. That helps me do better.");
  await expect(answer.getByRole("group", { name: "What was off?" })).toHaveCount(0);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/answer-reason-said.png` });
  await expect
    .poll(
      async () =>
        (await queryAsUser<{ rating: number; rating_reason: string }>(email, "select rating, rating_reason from jarvis_runs where rating is not null"))[0],
    )
    .toEqual({ rating: -1, rating_reason: "too_long" });
  // a thumbs-up instead clears the reason
  await page.getByRole("button", { name: "Good answer" }).last().click();
  await expect
    .poll(
      async () =>
        (
          await queryAsUser<{ rating: number; rating_reason: string | null }>(email, "select rating, rating_reason from jarvis_runs where rating is not null")
        )[0],
    )
    .toEqual({ rating: 1, rating_reason: null });
});
