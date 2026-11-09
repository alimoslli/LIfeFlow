import { expect, test } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

test("a new user picks and names their skyling first, sees their day connected, then a skippable tour", async ({ page }) => {
  const email = await signUp(page, "Maya Chen", { onboarding: "stay" });
  // The skylings come first (research 2026-11-09): picking one brings its name and its tone; a name of their own wins
  // and keeps the look and tone. Each step says what it changes on Today.
  await expect(page.getByRole("heading", { name: "Meet the skylings" })).toBeVisible();
  await expect(page.getByText("Changes who sits on top of your sky")).toBeVisible();
  expect((await page.getByLabel("Skyling's name").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByRole("radio", { name: /^Ray/ }).click();
  await expect(page.getByLabel("Skyling's name")).toHaveValue("Ray");
  await expect(page.getByText("Talks like a coach.", { exact: false })).toBeVisible();
  await page.getByLabel("Skyling's name").fill("Nova");
  await expect(page.getByText("Nova:", { exact: false })).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Ray/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Continue" }).click();

  // Then Nova asks what to call them (sign-up took only email and password).
  await expect(page.getByRole("heading", { name: /^Hi/ })).toBeVisible();
  await expect(page.getByText("I'm Nova.", { exact: false })).toBeVisible();
  // Text boxes meet the 44 px touch size.
  expect((await page.getByLabel("What should I call you?").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByLabel("What should I call you?").fill("Maya");
  await expect(page.getByRole("heading", { name: "Hi Maya." })).toBeVisible();
  await expect(page.getByText("LifeFlow is free while we're testing.")).toBeVisible();
  await page.getByRole("button", { name: "Let's go" }).click();

  await page.getByRole("radio", { name: /Both/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // One class and where they work: optional, and saved for real.
  await page.getByLabel("A class you're taking").fill("PSY 101");
  await page.getByLabel("Where you work").fill("Target");
  await page.getByRole("button", { name: "Show me my day" }).click();

  // Your day, connected: the sources connect, then Nova shows what it would do, built from their answers.
  await expect(page.getByRole("heading", { name: "Maya, here's a day with everything connected." })).toBeVisible();
  await expect(page.getByText("Nova is thinking…")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Here's what I'd do, Maya." })).toBeVisible({ timeout: 15_000 });
  const cards = page.locator("article");
  await expect(cards).toHaveCount(3);
  await expect(cards.filter({ hasText: "PSY 101" })).not.toHaveCount(0);
  await expect(cards.filter({ hasText: "Target" })).not.toHaveCount(0);
  // Every card with invented numbers carries its own "example" tag.
  for (const card of await cards.all()) await expect(card.getByText("example", { exact: true })).toBeVisible();
  await expect(page.getByText("Example numbers. Connect your accounts and these become real.")).toBeVisible();
  await cards.first().getByRole("button").click();
  await expect(cards.first().getByRole("status")).toContainText("In the app,");
  // Another day: Skip goes straight to the answer.
  await page.getByRole("button", { name: "Show me another day" }).click();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Here's what I'd do, Maya." })).toBeVisible();
  await page.getByRole("button", { name: "Meet Nova first" }).click();

  // Today, with the tour running.
  await page.waitForURL((u) => u.pathname === "/");
  const tour = page.getByRole("dialog", { name: "Welcome to LifeFlow" });
  await expect(tour).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Your day as a wheel" })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Nova" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Nova" })).toHaveCount(0);

  // Saved: what fills their week, their assistant, and the class and job they typed.
  const [prefs] = await queryAsUser<{ p: { lifeStage?: string; assistantName?: string; assistantStyle?: string; companion?: string } }>(
    email,
    "select preferences as p from users where email = $1",
    [email],
  );
  expect(prefs.p).toMatchObject({ lifeStage: "both", assistantName: "Nova", assistantStyle: "coach", companion: "ray" });
  expect(await queryAsUser(email, "select name from courses")).toEqual([{ name: "PSY 101" }]);
  expect(await queryAsUser(email, "select name from employers")).toEqual([{ name: "Target" }]);
  // The name typed on the first screen was saved (the test's sign-up had set "Maya Chen").
  expect(await queryAsUser(email, "select name from users where email = $1", [email])).toEqual([{ name: "Maya" }]);

  // The tour doesn't come back, and setup isn't shown again.
  await expect
    .poll(async () => (await queryAsUser<{ p: { tour?: string } }>(email, "select preferences as p from users where email = $1", [email]))[0]?.p.tour)
    .toBe("done");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/welcome");
  await page.waitForURL((u) => u.pathname === "/");
});

test("the opening splash shows once per session and never blocks the page", async ({ page }) => {
  await signUp(page, "Leo Park");
  await page.goto("/plan?splash=1");
  const splash = page.locator(".lf-splash-layer");
  await expect(splash).toBeVisible();
  await expect(splash).toBeHidden({ timeout: 9000 });
  // It leaves only once the page has really loaded: no loading placeholder behind it.
  await expect(page.locator("[data-app-loading]")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Automation and reduced motion don't get it without the explicit flag.
  await page.goto("/plan");
  await expect(splash).toBeHidden();
});

test("reduced motion: never a splash, even when requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login?splash=1");
  await expect(page.locator(".lf-splash-layer")).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the app follows what fills your week: tabs and pills adapt", async ({ page }) => {
  await signUp(page, "Sam Ortiz", { onboarding: "stay" });
  await page.getByRole("button", { name: "Continue" }).click(); // picking a skyling is optional
  await page.getByLabel("What should I call you?").fill("Sam");
  await page.getByRole("button", { name: "Let's go" }).click();
  await page.getByRole("radio", { name: /^Work/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Show me my day" }).click(); // where they work is optional
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("button", { name: "Meet your skyling first" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await page.getByRole("button", { name: "Skip tour" }).click();

  const tab = (name: string) => page.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true }).filter({ visible: true });
  const pill = (name: string) => page.getByRole("navigation", { name: "Today sections" }).getByRole("link", { name });
  const setWeek = async (choice: string) => {
    await page.goto("/settings/profile");
    await page.getByLabel("What fills your week").selectOption({ label: choice });
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved")).toBeVisible();
    await page.goto("/plan");
  };

  await page.goto("/plan");
  await expect(tab("School")).toHaveCount(0);
  await expect(pill("Work")).toBeVisible();

  await setWeek("Classes");
  await expect(tab("School")).not.toHaveCount(0);
  await expect(pill("Work")).toHaveCount(0);

  await setWeek("Neither");
  await expect(tab("School")).toHaveCount(0);
  await expect(pill("Work")).toHaveCount(0);
  await expect(tab("Money")).not.toHaveCount(0);
});
