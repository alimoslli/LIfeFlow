import { expect, test } from "@playwright/test";
import { pool, signUp } from "./helpers";

// The waitlist's "how your sky works" explainer (owner, 2026-11-12): a read-only example day on the waitlist page itself.
test.afterAll(async () => {
  await pool.query("update app_access set waitlist_on = false");
});

test("someone waiting opens the example sky, learns the moves and comes back to their place", async ({ page }) => {
  test.setTimeout(120_000);
  await pool.query("update users set access = 'in' where access = 'waiting'");
  await signUp(page, "Maya Torres");
  await pool.query("update app_access set waitlist_on = true");
  await page.goto("/waitlist");
  await expect(page.getByRole("heading", { level: 1, name: "You're #1 in line." })).toBeVisible();

  // everything the explainer does is on this page: while it's open, no request but static files
  const seen: string[] = [];
  const collect = (r: import("@playwright/test").Request) => {
    const u = new URL(r.url());
    // (the page's own account links may prefetch; they are not the explainer's)
    if (!u.pathname.startsWith("/_next/") && !/^\/settings\/(profile|security|data)$/.test(u.pathname) && !/\.(png|webp|svg|ico|woff2?)$/.test(u.pathname))
      seen.push(`${r.method()} ${u.pathname}`);
  };

  await expect(page.getByRole("heading", { name: "See how your sky works" })).toBeVisible();
  await page.screenshot({ path: "test-results/waitlist-sky-entry.png" });
  await page.getByRole("button", { name: "Show me" }).click();
  page.on("request", collect); // from the moment it opens (the page's own link prefetches came before)
  const dialog = page.getByRole("dialog", { name: "How your sky works" });
  await expect(dialog).toBeVisible();

  // marked as an example, with the words for every part
  await expect(page.getByTestId("sky-example-tag")).toHaveText("Example");
  for (const t of ["The wheel is your day", "Now", "The stops", "A clash", "The timeline", "The night", "Turning", "Opening", "Folding"])
    await expect(dialog.getByText(t, { exact: true })).toBeVisible();
  await expect(dialog.getByText("The rest opens when you're let in.")).toBeVisible();
  // the skyling's own name, never the old words
  await expect(dialog).toContainText("Ray");
  await expect(dialog).not.toContainText(/assistant|jarvis|—/i);
  // no tabs, no money, no chat, no links anywhere in it
  await expect(dialog.locator("a")).toHaveCount(0);
  await expect(dialog.getByText(/Money|Plan|School/)).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Pin something" })).toBeHidden();

  const clock = page.getByTestId("day-clock");
  await expect(clock).toHaveAttribute("data-state", "clock");
  await page.screenshot({ path: "test-results/waitlist-sky-explainer.png" });

  // turning
  const box = (await clock.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.3, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("try-turn")).toHaveAttribute("data-done", "true");

  // opening, then a stop's card has no way out to a page, then folding with Escape (which folds before it leaves)
  await page.getByRole("button", { name: "Back to now" }).click();
  await expect(page.getByRole("button", { name: "Back to now" })).toBeHidden(); // rolled home; a tap on a moving wheel only catches it
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(clock).toHaveAttribute("data-state", "timeline");
  await expect(page.getByTestId("try-open")).toHaveAttribute("data-done", "true");
  await page
    .getByRole("button", { name: /Lab report due/ })
    .first()
    .click();
  await expect(clock.locator(".dc-detail")).toContainText("Lab report due");
  await expect(clock.locator(".dc-detail")).toContainText("Example");
  await expect(clock.locator(".dc-detail button")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(clock).toHaveAttribute("data-state", "clock");
  await expect(page.getByTestId("try-fold")).toHaveAttribute("data-done", "true");

  // the way back returns to the place in line
  expect(new URL(page.url()).pathname).toBe("/waitlist");
  page.off("request", collect);
  await dialog.getByRole("button", { name: "Back to my place in line" }).last().click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "You're #1 in line." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show me" })).toBeFocused();
  expect(seen, "the explainer only needs static files").toEqual([]);

  // app pages are still closed to someone waiting
  await page.goto("/money");
  await page.waitForURL("**/waitlist");
});
