// Temporary: quick look (not committed).
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";
import { seedBusyStudent } from "./insight-seed";

const OUT = "/tmp/claude-0/-home-user/f5e405f4-f20d-592b-8f29-de312d5a4ef1/scratchpad/final";
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
test.setTimeout(240_000);
const seed = (email: string, scene: string) =>
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/dev/seed-useful-sky.ts", email, scene], {
    env: { ...process.env, DATABASE_URL: "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e" },
    stdio: "pipe",
  });
const row = (page: import("@playwright/test").Page) => page.locator('[aria-label="Ideas to try"]:visible').first();

test("look busy student", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const email = await signUp(page, "Maya Torres");
  await seedBusyStudent(email);
  await page.goto("/");
  await expect(row(page).getByRole("button").first()).toBeVisible();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/busy-1.png` });
  for (const n of [2, 3]) {
    await page.getByRole("button", { name: `Idea ${n} of` }).first().click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/busy-cloud-${n}.png` });
  }
  const dots = page.locator(".dc-fact-dots button");
  const n = await dots.count();
  for (let k = 1; k < n; k++) {
    await dots.nth(k).click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/busy-fact-${k + 1}.png` });
  }
  await page.goto("/jarvis");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/busy-skyling-page.png` });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto("/");
  await expect(row(page).getByRole("button").first()).toBeVisible();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/busy-night.png` });
});

for (const scene of ["gap", "storm", "tonight"]) {
  test(`look ${scene}`, async ({ page }) => {
    const email = await signUp(page, "Maya Chen");
    seed(email, scene);
    await page.goto("/");
    await expect(page.getByTestId("day-clock")).toHaveAttribute("data-ready", "true");
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/${scene}.png` });
  });
}
