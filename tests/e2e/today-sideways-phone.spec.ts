import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test.use({ viewport: { width: 667, height: 375 }, isMobile: true, hasTouch: true });

// A phone turned sideways (only in the browser: the installed app stays upright) is too short for a chat bar floating
// over the sky, so on Today the bar joins the page under the sky (owner, 2026-11-10: nothing lies over anything).
test("sideways, Today's chat bar sits under the sky, not over it", async ({ page }) => {
  await signUp(page, "Sid Sideways");
  await page.goto("/");
  // the sky streams in: wait until it is on the page, not still in the hidden part of the stream
  await expect(page.getByTestId("day-clock")).toBeVisible();
  const bar = page.locator(".dc-dock");
  await expect(bar).toBeVisible();
  // the gap between the sky's foot and the bar's top (read again until the page has settled)
  await expect
    .poll(async () => {
      const [sky, b] = [await page.getByTestId("day-clock").boundingBox(), await bar.boundingBox()];
      return sky && b ? Math.round(b.y - (sky.y + sky.height)) : null;
    })
    .toBeGreaterThanOrEqual(-1);
  // and it can still be used: a question typed there goes on in the chat
  await bar.getByRole("textbox").fill("What's due this week?");
  await bar.getByRole("textbox").press("Enter");
  await page.waitForURL((u) => u.pathname.startsWith("/jarvis"));
});
