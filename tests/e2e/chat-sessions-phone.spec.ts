import { expect, test } from "@playwright/test";
import { askJarvis, COMPOSER, queryAsUser, signUp } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const COUNT = "select count(*)::int as n from conversations";
const hasChatCookie = async (context: import("@playwright/test").BrowserContext) => (await context.cookies()).some((c) => c.name === "lf_chat");

// Owner, 2026-11-11: "not one continuous chat ... whenever I close down the app, it goes away ... or sign out". A chat
// lasts while the app is open and for the day. Closing the app, signing out, a new day or New chat starts another; every
// earlier chat stays in the list.
test("a chat lasts while the app is open; New chat starts another; reopening the app starts fresh, and both are kept", async ({ page, context }) => {
  const email = await signUp(page, "Ada Chats");
  await page.goto("/jarvis");
  await askJarvis(page, "first thing I asked");
  await expect(page.getByText("You said: first thing I asked").first()).toBeVisible();
  await expect(page).toHaveURL(/\/jarvis\?c=[0-9a-f-]{36}$/);

  // the same visit: a reload keeps this chat
  await page.reload();
  await expect(page.getByText("You said: first thing I asked").first()).toBeVisible();

  // New chat: an empty chat, and nothing is created until it's asked
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(page.getByText("You said: first thing")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Let's clear your sky." })).toBeVisible();
  await expect(page).toHaveURL(/\/jarvis$/);
  expect(await queryAsUser(email, COUNT)).toEqual([{ n: 1 }]);
  await askJarvis(page, "second thing");
  await expect(page.getByText("You said: second thing").first()).toBeVisible();
  expect(await queryAsUser(email, COUNT)).toEqual([{ n: 2 }]);

  // a reload stays on the second chat
  await page.reload();
  await expect(page.getByText("You said: second thing").first()).toBeVisible();
  await expect(page.getByText("You said: first thing")).toHaveCount(0);

  // the app is closed and opened again: a new page in the same browser starts fresh, and both chats stay in the list
  const again = await context.newPage();
  await again.goto("/jarvis");
  await expect(again.getByRole("heading", { name: "Let's clear your sky." })).toBeVisible();
  await expect(again.getByText("You said: second thing")).toHaveCount(0);
  await expect(again.getByText("You said: first thing")).toHaveCount(0);
  await expect.poll(() => hasChatCookie(context)).toBe(false);
  await again.getByRole("button", { name: "Past conversations" }).click();
  const list = again.getByRole("dialog", { name: "Past conversations" }).getByRole("link");
  await expect(list).toHaveCount(2);

  // opening an earlier one makes it the chat this visit is in
  await list.last().click();
  await expect(again.getByText("You said: first thing I asked").first()).toBeVisible();
  await expect.poll(() => hasChatCookie(context)).toBe(true);
  expect(await queryAsUser(email, COUNT)).toEqual([{ n: 2 }]);
});

test("a chat used on another day isn't carried on", async ({ page, context }) => {
  const email = await signUp(page, "Yara Yesterday");
  await page.goto("/jarvis");
  await askJarvis(page, "yesterday's question");
  await expect(page.getByText("You said: yesterday's question").first()).toBeVisible();
  const [{ id }] = await queryAsUser<{ id: string }>(email, "select id from conversations");
  // the same browser, two days on: the chat was last used two days ago
  await context.addCookies([{ name: "lf_chat", value: `${id}~${Date.now() - 2 * 86_400_000}`, url: page.url() }]);
  await page.goto("/jarvis");
  await expect(page.getByRole("heading", { name: "Let's clear your sky." })).toBeVisible();
  await expect(page.getByText("You said: yesterday's question")).toHaveCount(0);
});

test("signing out ends the chat on this device", async ({ page, context }) => {
  await signUp(page, "Sia Sign");
  await page.goto("/jarvis");
  await askJarvis(page, "before I sign out");
  await expect(page.getByText("You said: before I sign out").first()).toBeVisible();
  await expect.poll(() => hasChatCookie(context)).toBe(true);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/login");
  await expect.poll(() => hasChatCookie(context)).toBe(false);
});

// Owner's privacy rule (2026-11-11): on a shared device, the last person's answer never shows for the next one. The
// answer lives in this app session's memory, so this checks the path that matters: sign out and sign in as someone else
// inside the app, without a reload.
test("another person's Today answer never shows after a sign-out and a sign-in on the same device", async ({ page, browser }) => {
  const other = await browser.newContext();
  const bEmail = await signUp(await other.newPage(), "Bea Next");
  await other.close();

  await signUp(page, "Ana Private");
  await page.goto("/");
  const box = page.locator(".dc-dock").getByRole("textbox", { name: COMPOSER });
  await box.fill(`/tool create_tasks {"tasks":[{"title":"Ana's private errand"}]}`);
  await box.press("Enter");
  const reply = page.locator('[data-testid="today-reply"]:visible');
  await expect(reply.getByRole("list", { name: "Saved" })).toContainText("Ana's private errand", { timeout: 15_000 });

  // Settings opens from the gear inside the app (no reload); Sign out is in that sheet
  await page.getByRole("link", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/login");
  await page.getByLabel("Email").fill(bEmail);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bea");
  await expect(page.getByText("Ana's private errand")).toHaveCount(0);
  await expect(page.locator('[data-testid="today-reply"]')).toHaveCount(0);
});

// Found in review (2026-11-11): New chat must work right after the first message on the same page, with no reload.
test("New chat works right after the first message, with no reload", async ({ page }) => {
  const email = await signUp(page, "Nia Next");
  await page.goto("/jarvis");
  await askJarvis(page, "first question here");
  await expect(page.getByText("You said: first question here").first()).toBeVisible();
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(page.getByText("You said: first question here")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Let's clear your sky." })).toBeVisible();
  await askJarvis(page, "second question here");
  await expect(page.getByText("You said: second question here").first()).toBeVisible();
  expect(await queryAsUser(email, COUNT)).toEqual([{ n: 2 }]);
});

// Found in review: a link that isn't a chat id opens a new chat instead of an error.
test("a link to something that isn't a chat opens a new one", async ({ page }) => {
  await signUp(page, "Mo Link");
  await page.goto("/jarvis?c=not-a-chat");
  await expect(page.getByRole("heading", { name: "Let's clear your sky." })).toBeVisible();
});

// Found in review: the skyling page can't be a copy from before (Next's client cache): a chat started on Today shows there
// when you tap the skyling tab.
test("the skyling page is never a copy from before: a chat started on Today shows there when you tap the skyling tab", async ({ page }) => {
  await signUp(page, "Tara Tab");
  await page.goto("/jarvis");
  const tabs = page.getByRole("navigation", { name: "Main" }).last();
  await tabs.getByRole("link", { name: "Today" }).click();
  const box = page.locator(".dc-dock").getByRole("textbox", { name: COMPOSER });
  await box.fill("a question from today");
  await box.press("Enter");
  await expect(page.locator('[data-testid="today-reply"]:visible').getByText("You said: a question from today")).toBeVisible({ timeout: 15_000 });
  await tabs.getByRole("link", { name: "Ray" }).click();
  await expect(page.getByText("You said: a question from today").first()).toBeVisible();
});

// Found in review (2026-11-11): going back to the skyling page (the browser's back, or a swipe) must show the chat this visit
// is in, even when the page was left before a chat started on Today, and the next message goes into that chat, not a new one.
test("going back to the skyling page shows the chat started on Today, and the next message stays in it", async ({ page }) => {
  const email = await signUp(page, "Bo Back");
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Main" }).last();
  await tabs.getByRole("link", { name: "Ray" }).click();
  await expect(page.getByRole("heading", { name: "Let's clear your sky." })).toBeVisible();
  await tabs.getByRole("link", { name: "Today" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  const box = page.locator(".dc-dock").getByRole("textbox", { name: COMPOSER });
  await box.fill("a question before going back");
  await box.press("Enter");
  await expect(page.locator('[data-testid="today-reply"]:visible').getByText("You said: a question before going back")).toBeVisible({ timeout: 15_000 });
  await page.goBack();
  await page.waitForURL((u) => u.pathname === "/jarvis");
  await expect(page.getByText("You said: a question before going back").first()).toBeVisible();
  await askJarvis(page, "a question after going back");
  await expect(page.getByText("You said: a question after going back").first()).toBeVisible();
  expect(await queryAsUser(email, COUNT)).toEqual([{ n: 1 }]);
});
