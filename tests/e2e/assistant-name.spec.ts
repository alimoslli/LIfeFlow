import { expect, test, type Page } from "@playwright/test";
import { COMPOSER, queryAsUser, signUp, whatUsersSee } from "./helpers";

/**
 * The assistant has no fixed name. A new user who taps through setup without naming it
 * sees "your assistant" (or "Assistant" where a short label is needed) and never "Jarvis":
 * not in text, aria labels, placeholders, titles or alt text, on phone or desktop. Nor is it
 * "he": a new account shows only our own copy, and none of it uses he, his or him.
 */
const PAGES = [
  "/",
  "/plan",
  "/tasks",
  "/goals",
  "/inbox",
  "/jarvis",
  "/jarvis/says",
  "/jarvis/ideas",
  "/jarvis/profile",
  "/jarvis/memory",
  "/money",
  "/finances/subscriptions",
  "/school",
  "/school/due",
  "/settings",
  "/settings/jarvis",
  "/settings/notifications",
  "/settings/integrations",
  "/settings/text", // not found unless texting is set up; then the page itself is checked
];

async function expectNoJarvis(page: Page, where: string) {
  const seen = await whatUsersSee(page);
  expect(seen, where).not.toMatch(/jarvis/i);
  expect(seen, `${where}: the assistant is "it", not "he"`).not.toMatch(/\b(he|his|him|himself)\b/i);
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-app-loading]")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
}

test("a new user who never names the assistant never sees 'Jarvis'", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 393, height: 852 });
  // No AI consent yet, so the first-chat consent card and its wording are checked too.
  const email = await signUp(page, "Riley Park", { onboarding: "stay", ai: false });

  // Setup, every step, without typing a name.
  await expectNoJarvis(page, "welcome: hello");
  await page.getByLabel("What should I call you?").fill("Riley");
  await page.getByRole("button", { name: "Let's go" }).click();
  await expectNoJarvis(page, "welcome: week");
  await page.getByRole("radio", { name: /Both/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expectNoJarvis(page, "welcome: details");
  await page.getByRole("button", { name: "Continue" }).click();

  // Make it yours: the name starts empty, no suggestion is picked, and "Jarvis" isn't offered.
  const nameBox = page.getByLabel("Assistant name");
  await expect(nameBox).toHaveValue("");
  await expect(nameBox).toHaveAttribute("placeholder", "your assistant");
  await expect(page.getByRole("button", { name: "Jarvis" })).toHaveCount(0);
  await expect(page.getByRole("button", { pressed: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nova" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Your assistant:", { exact: false })).toBeVisible();
  await expectNoJarvis(page, "welcome: make it yours");
  await page.getByRole("button", { name: "Show me my day" }).click();

  await expect(page.getByText("Your assistant is thinking…")).toBeVisible({ timeout: 15_000 });
  await expectNoJarvis(page, "welcome: your day");
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Here's what I'd do, Riley." })).toBeVisible();
  await expectNoJarvis(page, "welcome: your day, answered");
  await page.getByRole("button", { name: "Meet your assistant first" }).click();
  await page.waitForURL((u) => u.pathname === "/");

  // No name was saved: it stays "your assistant" until they choose one.
  const [prefs] = await queryAsUser<{ p: { assistantName?: string; onboarding?: string } }>(email, "select preferences as p from users where email = $1", [
    email,
  ]);
  expect(prefs.p.onboarding).toBe("done");
  expect(prefs.p.assistantName).toBeUndefined();

  // The tour, every step.
  await expect(page.getByRole("dialog", { name: "Welcome to LifeFlow" })).toBeVisible();
  for (let i = 0; i < 12 && (await page.getByRole("button", { name: "Next" }).isVisible()); i++) {
    await expectNoJarvis(page, `tour step ${i + 1}`);
    await page.getByRole("button", { name: "Next" }).click();
  }
  await expectNoJarvis(page, "tour: last step");
  await page.getByRole("button", { name: "Start using LifeFlow" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Phone: the tab says "Assistant", sentences say "your assistant".
  const tabs = page.getByRole("navigation", { name: "Main" }).last().getByRole("link");
  expect(await tabs.allInnerTexts()).toEqual(["Today", "Assistant", "Money", "School"]);
  await expect(page.getByRole("button", { name: "Message your assistant…" })).toBeVisible();
  for (const path of PAGES) {
    await visit(page, path);
    await expectNoJarvis(page, `phone ${path}`);
  }
  await visit(page, "/jarvis");
  await expect(page.getByLabel(COMPOSER)).toBeDisabled(); // AI not allowed yet
  await expect(page.getByLabel(COMPOSER)).toHaveAttribute("placeholder", "Allow your assistant to start");
  await expect(page.getByRole("region", { name: "Allow AI" })).toContainText("your assistant sends your message");

  // Settings: the name field is empty, not prefilled with a made-up name.
  await visit(page, "/settings/jarvis");
  await expect(page.locator("#as-name")).toHaveValue("");

  // Desktop: the rail, the top bar's ask field and the assistant drawer.
  await page.setViewportSize({ width: 1280, height: 860 });
  for (const path of PAGES) {
    await visit(page, path);
    await expectNoJarvis(page, `desktop ${path}`);
  }
  await visit(page, "/");
  await page.getByRole("button", { name: "Ask your assistant anything…" }).click();
  await expect(page.getByRole("dialog", { name: "Your assistant" })).toBeVisible();
  await expectNoJarvis(page, "desktop: assistant drawer");
});
