import { expect, test } from "@playwright/test";
import { queryAsUser, signUp, fillBirthday } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

// Owner's program, item 7: from sign-up to a usable Today in the welcome's steps only (no tour after it), ending on their
// own sky with something real on it: here a week told in one message, saved by set_up_schedule (the test model calls it).
test("the first minute: the real welcome ends on Today with the told week on the sky, no tour, one hint once", async ({ page }) => {
  const email = await signUp(page, "Maya Chen", { onboarding: "stay", ai: false });
  // 1. the skylings
  await page.getByRole("radio", { name: /^Ray/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  // 2. about you
  await page.getByLabel("What should I call you?").fill("Maya");
  await page.getByRole("radio", { name: /^Both/ }).click();
  await fillBirthday(page, "2005-04-12");
  await page.getByRole("button", { name: "Connect my sky" }).click();

  // 3. no calendar to connect: the week in one message. AI is asked for first, never assumed.
  await expect(page.getByRole("heading", { name: "Connect your sky" })).toBeVisible();
  await expect(page.getByText("sends your message to OpenAI", { exact: false })).toBeVisible();
  await page
    .getByLabel("No calendar? Tell Ray your week")
    .fill('/tool set_up_schedule {"classes":[{"name":"BIO 101","days":[0,1,2,3,4,5,6],"startTime":"10:00","endTime":"11:15"}]}');
  await page.getByRole("button", { name: "Allow and send" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Done|Saved/ })).toBeVisible({ timeout: 30_000 });
  // the sky above has it, and the step now goes on like a connection
  await expect(page.getByRole("button", { name: /^BIO 101, / }).first()).toBeAttached();
  await page.getByRole("button", { name: "Show me how to read it" }).click();

  // 4. read your sky, then their own Today: no tour, the class on it
  await page.getByRole("button", { name: "Go to my sky" }).click();
  await page.waitForURL((u) => u.pathname === "/");
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
