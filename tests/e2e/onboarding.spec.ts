import { expect, test } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

test("a new user sets up classes, a job and checking, then gets a skippable tour", async ({ page }) => {
  const email = await signUp(page, "Maya Chen", { onboarding: "stay" });
  await expect(page.getByRole("heading", { name: "Hi Maya." })).toBeVisible();
  await page.getByRole("button", { name: "Let's set it up" }).click();

  await page.getByRole("radio", { name: /Both/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Class name").fill("Biology II");
  await page.getByLabel("Class name").press("Enter");
  await page.getByLabel("Class name").fill("Statistics");
  await page.getByRole("button", { name: "Add class" }).click();
  await expect(page.getByRole("list", { name: "Classes added" })).toContainText("Statistics");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Workplace").fill("Campus Library");
  await page.getByLabel("Hourly pay (optional)").fill("16.50");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Checking balance").fill("1,250.00");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("radio", { name: "Evenings" }).click();
  await page.getByRole("radio", { name: "Short & sweet" }).click();
  await page.getByRole("button", { name: "Finish" }).click();

  // Today, with the tour running.
  await page.waitForURL((u) => u.pathname === "/");
  const tour = page.getByRole("dialog", { name: "This is Today" });
  await expect(tour).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("dialog", { name: "Plan" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Plan" })).toHaveCount(0);

  // Saved through the real services.
  expect((await queryAsUser<{ name: string }>(email, "select name from courses order by name")).map((r) => r.name)).toEqual(["Biology II", "Statistics"]);
  expect(await queryAsUser(email, "select name, hourly_rate_cents from employers")).toEqual([{ name: "Campus Library", hourly_rate_cents: "1650" }]);
  expect(await queryAsUser(email, "select current_balance_cents from financial_accounts")).toEqual([{ current_balance_cents: "125000" }]);
  await expect(page.getByText("$1,250").first()).toBeVisible();

  // The tour doesn't come back, and setup isn't shown again.
  await expect.poll(async () => (await queryAsUser<{ p: { tour?: string } }>(email, "select preferences as p from users where email = $1", [email]))[0]?.p.tour).toBe("done");
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
  await expect(splash).toBeHidden({ timeout: 4000 });
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
