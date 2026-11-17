import { expect, test } from "@playwright/test";
import { queryAsUser, setupAbout, setupSkyling, shown, signUp } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

// Owner's program, item 7: from sign-up to a usable Today in setup's own steps (no tour after it), ending on their own sky
// with something real on it: here a week told in one message, saved by set_up_schedule (the test model calls it).
test("the first minute: setup ends on Today with the told week on the sky, no tour, one hint once", async ({ page }) => {
  const email = await signUp(page, "Maya Chen", { onboarding: "stay", ai: false });
  // 1. the skyling, 2. about you
  await setupSkyling(page, { skyling: "Ray" });
  await setupAbout(page, { name: "Maya", birthday: "2005-04-12", week: "Both" });

  // 3. nothing to connect: the week typed in one message. AI is asked for first, never assumed.
  await shown(page, "Pick the first one").click();
  const ways = page.getByRole("dialog", { name: "Your first connection" });
  await ways.getByText("Nothing here works for me").click();
  await expect(ways.getByText("to OpenAI", { exact: false }).first()).toBeVisible();
  await ways
    .getByLabel("Tell Ray your week")
    .fill('/tool set_up_schedule {"classes":[{"name":"BIO 101","days":[0,1,2,3,4,5,6],"startTime":"10:00","endTime":"11:15"}]}');
  await ways.getByRole("button", { name: "Allow and send" }).click();
  // the week lands: the sky has it, and setup goes on like after a connection
  await expect(page.locator(".dc-today[data-setup=landed]")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /^BIO 101, / }).first()).toBeAttached();
  await shown(page, "Show me how to read it").click();

  // 4. read your sky, then their own Today: no tour, the class on it
  await shown(page, "Go to my sky").click();
  await expect(page.locator(".dc-today[data-setup]")).toHaveCount(0);
  await expect(page.getByTestId("day-clock")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Welcome to LifeFlow" })).toHaveCount(0);
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(page.getByRole("button", { name: /^BIO 101, / }).first()).toBeAttached();
  const [prefs] = await queryAsUser<{ p: Record<string, unknown> }>(email, "select preferences as p from users where email = $1", [email]);
  expect(prefs.p).toMatchObject({ onboarding: "done", tour: "done" });
  expect(typeof prefs.p.aiConsentAt).toBe("string");

  // Today's one hint (the bar says what it's for), shown once: never again after a reload.
  await page.goto("/?hints=1");
  const bar = page.locator(".dc-dock").getByRole("textbox", { name: "Message Ray" });
  await expect(bar).toHaveAttribute("placeholder", "Ask or tell Ray anything");
  await page.reload();
  await expect(bar).toHaveAttribute("placeholder", "Message Ray…");
});
