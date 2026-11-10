import { expect, test, type Page } from "@playwright/test";
import { COMPOSER, queryAsUser, signUp, whatUsersSee } from "./helpers";

/**
 * The skyling has no fixed name. A new user who taps through setup without naming it (or picking one) meets Ray, the
 * default skyling, by Ray's own name (owner, 2026-11-10), and never "Jarvis" or the old "Dev": not in text, aria labels,
 * placeholders, titles or alt text, on phone or desktop. Nor is it "he": a new account shows only our own copy, and none
 * of it uses he, his or him.
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
  "/finances/bills",
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
  // owner, 2026-11-10: the old identity is gone (the name "Dev", the "Home context" label)
  expect(seen, `${where}: no old name`).not.toMatch(/\bDev\b|context\b/);
  // owner, 2026-11-09: it's your skyling, never an assistant or an AI assistant
  expect(seen, `${where}: a skyling, never an assistant`).not.toMatch(/\bassistants?\b/i);
  expect(seen, `${where}: the skyling is "it", not "he"`).not.toMatch(/\b(he|his|him|himself)\b/i);
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-app-loading]")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
}

test("a new user who never names the skyling never sees 'Jarvis'", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 393, height: 852 });
  // No AI consent yet, so the first-chat consent card and its wording are checked too.
  const email = await signUp(page, "Riley Park", { onboarding: "stay", ai: false });

  // Setup, every step, without naming the skyling. First the skylings: the name starts empty, none is picked, and
  // "Jarvis" isn't offered.
  const nameBox = page.getByLabel("Skyling's name");
  await expect(nameBox).toHaveValue("");
  await expect(nameBox).toHaveAttribute("placeholder", "your skyling");
  await expect(page.getByRole("button", { name: "Jarvis" })).toHaveCount(0);
  await expect(page.getByRole("button", { pressed: true })).toHaveCount(0);
  await expect(page.getByRole("radiogroup", { name: "Your skyling" }).getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(page.getByText("Your skyling:", { exact: false })).toBeVisible();
  await expectNoJarvis(page, "welcome: the skylings");
  await page.getByRole("button", { name: "Continue" }).click();
  await expectNoJarvis(page, "welcome: about you");
  await page.getByLabel("What should I call you?").fill("Riley");
  await page.getByLabel("Your birthday").fill("2003-07-21");
  await page.getByRole("radio", { name: /Both/ }).click();
  await page.getByRole("button", { name: "Connect my sky" }).click();
  await expectNoJarvis(page, "welcome: connect your sky");
  await page.getByRole("button", { name: "I'll connect later" }).click();
  await expectNoJarvis(page, "welcome: read your sky");
  await page.getByRole("button", { name: "Go to my sky" }).click();
  await page.waitForURL((u) => u.pathname === "/");

  // No name was saved: it goes by its skyling's own name (Ray, the default) until they choose one.
  const [prefs] = await queryAsUser<{ p: { assistantName?: string; onboarding?: string } }>(email, "select preferences as p from users where email = $1", [
    email,
  ]);
  expect(prefs.p.onboarding).toBe("done");
  expect(prefs.p.assistantName).toBeUndefined();

  // No tour after the welcome (item 7); replayed from Settings, every step still never says "Jarvis".
  await expect(page.getByRole("dialog", { name: "Welcome to LifeFlow" })).toHaveCount(0);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Replay the tour" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByRole("dialog", { name: "Welcome to LifeFlow" })).toBeVisible();
  for (let i = 0; i < 12 && (await page.getByRole("button", { name: "Next", exact: true }).isVisible()); i++) {
    await expectNoJarvis(page, `tour step ${i + 1}`);
    await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await expectNoJarvis(page, "tour: last step");
  await page.getByRole("button", { name: "Start using LifeFlow" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Phone: three places on the dock; the skyling is the bar above them, by its own name.
  const tabs = page.getByRole("navigation", { name: "Main" }).last().getByRole("link");
  expect(await tabs.allInnerTexts()).toEqual(["Today", "Money", "School"]);
  await expect(page.getByRole("textbox", { name: "Message Ray" }).first()).toBeVisible();
  // Today: the skyling stands on the chat bar with its name, so it's clear who you're talking to (owner, 2026-11-10)
  await expect(page.locator('[data-testid="ask-skyling"]:visible').first()).toHaveText("Ray");
  for (const path of PAGES) {
    await visit(page, path);
    await expectNoJarvis(page, `phone ${path}`);
  }
  await visit(page, "/money");
  await expect(page.getByTestId("skyling-bar")).toContainText("Message Ray");
  await visit(page, "/jarvis");
  await expect(page.getByLabel(COMPOSER)).toBeDisabled(); // AI not allowed yet
  await expect(page.getByLabel(COMPOSER)).toHaveAttribute("placeholder", "Allow Ray to start");
  await expect(page.getByRole("region", { name: "Allow AI" })).toContainText("Ray sends your message");

  // Settings: the name field is empty (its own name is the hint), not prefilled with a made-up name.
  await visit(page, "/settings/jarvis");
  await expect(page.locator("#as-name")).toHaveValue("");
  await expect(page.locator("#as-name")).toHaveAttribute("placeholder", "Ray");

  // Desktop: the rail and the top bar's ask field, which opens the chat page (no side panel, owner 2026-11-10).
  await page.setViewportSize({ width: 1280, height: 860 });
  for (const path of PAGES) {
    await visit(page, path);
    await expectNoJarvis(page, `desktop ${path}`);
  }
  // (Today has its own ask bar, so the top bar's ask field is on the other pages)
  await visit(page, "/settings");
  await page.getByRole("button", { name: "Ask Ray anything…" }).click();
  await page.waitForURL("**/jarvis");
  await expect(page.getByLabel(COMPOSER)).toBeVisible();
  await expectNoJarvis(page, "desktop: the chat page");
});
