import { expect, test } from "@playwright/test";
import { askJarvis, COMPOSER, queryAsUser, signUp } from "./helpers";

// A reply that changes data refreshes the page, and in a brand-new conversation the address has just moved to
// /jarvis/<id>. A message sent while that refresh is still loading must go through and show its reply (a guard for
// a rare core.spec flake where a quick second message went missing). The refresh is slowed so the gap is always open.
test("a message sent right after a reply that changed data is never lost", async ({ page }) => {
  const email = await signUp(page, "Quick Typer");
  await page.goto("/jarvis");
  await page.route("**/*", async (route) => {
    if (route.request().headers()["rsc"] === "1") await new Promise((r) => setTimeout(r, 2500));
    await route.continue().catch(() => {});
  });

  await askJarvis(page, `/tool create_tasks {"tasks":[{"title":"Pack lunch"}]}`);
  await expect(page).toHaveURL(/\/jarvis\/[0-9a-f-]{36}$/);

  // At once, like a quick typist: the second message must go through and its reply must show.
  const box = page.getByLabel(COMPOSER);
  await box.fill(`/tool create_tasks {"tasks":[{"title":"Water the plants"}]}`);
  await box.press("Enter");
  // Its reply is on screen (the user's own bubble doesn't count), and both tasks were really saved. (The e2e fake
  // model repeats earlier tool results in later replies, so replies aren't counted.)
  await expect(page.getByText(/^Done:.*Water the plants/)).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => (await queryAsUser<{ title: string }>(email, "select title from tasks order by title")).map((r) => r.title))
    .toEqual(["Pack lunch", "Water the plants"]);
  // And after a reload the conversation still holds both turns.
  await page.unroute("**/*");
  await page.reload();
  await expect(page.getByText(/^Done:.*Water the plants/)).toBeVisible();
  await expect(page.getByText(/^Done:.*Pack lunch/).first()).toBeVisible();
});
