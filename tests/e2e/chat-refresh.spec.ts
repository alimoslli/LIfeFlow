import { expect, test } from "@playwright/test";
import { askJarvis, COMPOSER, queryAsUser, signUp } from "./helpers";

// A reply that changes data refreshes the page. In a brand-new conversation the address has just moved to /jarvis/<id>,
// and the chat is keyed by the conversation, so that refresh rebuilds it. A message typed or sent before the refresh
// landed was wiped (core.spec flaked on it). The refresh's answer is held back so the gap is always open.
test("a message sent right after a reply that changed data is never lost", async ({ page }) => {
  const email = await signUp(page, "Quick Typer");
  await page.goto("/jarvis");
  // The server answers the refresh at once (before the next message is saved), but the answer reaches the page late.
  await page.route("**/*", async (route) => {
    if (route.request().headers()["rsc"] !== "1") return route.continue().catch(() => {});
    const response = await route.fetch().catch(() => null);
    if (!response) return route.abort().catch(() => {});
    await new Promise((r) => setTimeout(r, 2500));
    await route.fulfill({ response }).catch(() => {});
  });

  await askJarvis(page, `/tool create_tasks {"tasks":[{"title":"Pack lunch"}]}`);
  await expect(page).toHaveURL(/\/jarvis$/);

  // At once, like a quick typist: a plain question that changes nothing, so no second refresh can repair the screen.
  const box = page.getByLabel(COMPOSER);
  await box.fill("Thanks! What else is due this week?");
  await box.press("Enter");
  // Once the held-back refresh has landed, the question is still on screen and was really sent.
  await page.waitForTimeout(4000);
  await expect(page.getByText("Thanks! What else is due this week?").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await queryAsUser<{ n: number }>(email, "select count(*)::int as n from messages where role = 'user'"))[0]?.n).toBe(2);

  // And after a reload the conversation holds both turns.
  await page.unroute("**/*");
  await page.reload();
  await expect(page.getByText("Thanks! What else is due this week?").first()).toBeVisible();
  await expect(page.getByText(/^Done:.*Pack lunch/).first()).toBeVisible();
});
