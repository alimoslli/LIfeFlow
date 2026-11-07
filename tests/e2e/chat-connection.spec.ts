import { expect, test, type Page } from "@playwright/test";
import { COMPOSER, queryAsUser, signUp } from "./helpers";

// A phone drops the connection whenever the screen locks, the app goes to the background or the network blips.
// The server finishes and saves the turn anyway; the chat finds the answer again and never shows a browser error.

const CHAT = /\/api\/jarvis\/chat$/;
const SAVED = /\/api\/jarvis\/chat\/messages/;
const RAW_ERRORS = /Load failed|Failed to fetch|NetworkError|TypeError|Request failed/i;

async function send(page: Page, text: string) {
  const box = page.getByLabel(COMPOSER);
  await box.fill(text);
  await box.press("Enter");
}

/** The real server runs the whole turn, but the page only receives the first event, as if the connection broke after one chunk. */
async function cutAfterFirstChunk(page: Page) {
  await page.route(CHAT, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    const first = (await response.text()).split("\n")[0] + "\n";
    await route.fulfill({ status: 200, headers: { "content-type": "application/x-ndjson; charset=utf-8" }, body: first });
  });
}

test("a dropped connection shows one calm line, then the saved answer, never a browser error", async ({ page }) => {
  await signUp(page, "Dropped Line");
  await page.goto("/jarvis");
  await cutAfterFirstChunk(page);
  // Hold the lookups back so the calm line is on screen long enough to see.
  await page.route(SAVED, async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue().catch(() => undefined);
  });

  await send(page, "What is due this week?");
  await expect(page.getByText("The connection dropped. Getting your answer…")).toBeVisible();
  await expect(page.getByText(/Hello from the test model\. You said: What is due this week\?/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("The connection dropped. Getting your answer…")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(RAW_ERRORS);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a refused request that never reached the server also shows no browser error", async ({ page }) => {
  await signUp(page, "Offline Line");
  await page.goto("/jarvis");
  await page.route(CHAT, (route) => route.abort("failed"));
  await send(page, "Hello?");
  await expect(page.getByText("The connection dropped. Getting your answer…")).toBeVisible();
  await expect(page.getByText("Your message didn't go through.")).toBeVisible({ timeout: 40_000 });
  await expect(page.locator("body")).not.toContainText(RAW_ERRORS);
  // And Try again really sends it.
  await page.unroute(CHAT);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText(/Hello from the test model\. You said: Hello\?/)).toBeVisible({ timeout: 20_000 });
});

test("Try again after a lost answer re-asks without saving the message twice", async ({ page }) => {
  test.setTimeout(180_000);
  const email = await signUp(page, "Retry Once");
  await page.goto("/jarvis");
  // The page's connection fails at once, but the server still gets the message and answers slowly.
  await page.route(CHAT, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const headers = route.request().headers();
    const body = route.request().postData() ?? "";
    void page.request
      .post("/api/jarvis/chat", { data: JSON.parse(body), headers: { origin: headers.origin ?? "", "content-type": "application/json" } })
      .catch(() => undefined);
    await route.abort("failed");
  });
  // While the page waits, the saved copy is shown as "not finished yet" so the full wait runs out.
  await page.route(SAVED, async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    await route.fulfill({ response, json: { ...json, finished: false } });
  });

  await send(page, "Plan my evening /slow 3000");
  await expect(page.getByText("The connection dropped. Getting your answer…")).toBeVisible();
  await expect(page.getByText("Your message was saved, but the answer didn't come through.")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator("body")).not.toContainText(RAW_ERRORS);

  await page.unroute(CHAT);
  await page.unroute(SAVED);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText(/Hello from the test model\. You said: Plan my evening/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 30_000 });
  const users = await queryAsUser<{ n: number }>(email, "select count(*)::int as n from messages where role = 'user'");
  expect(users[0].n).toBe(1);
});

test("a reply that points to a place shows a link that opens it", async ({ page }) => {
  await signUp(page, "Link Person");
  await page.goto("/jarvis");
  await send(page, `/tool create_tasks {"tasks":[{"title":"Pack lunch"}]}`);
  const link = page.getByRole("link", { name: /^Open To-dos/ });
  await expect(link).toBeVisible({ timeout: 20_000 });
  await expect(link).toHaveAttribute("href", "/tasks");
  await link.click();
  await expect(page).toHaveURL(/\/tasks$/);
});
