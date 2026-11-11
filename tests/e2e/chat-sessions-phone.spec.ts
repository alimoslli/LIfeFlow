import { expect, test } from "@playwright/test";
import { askJarvis, queryAsUser, signUp } from "./helpers";

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
