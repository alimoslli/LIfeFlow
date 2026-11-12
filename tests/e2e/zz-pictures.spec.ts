// Temporary: pictures for the owner (not committed).
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

const OUT = "/tmp/claude-0/-home-user/f5e405f4-f20d-592b-8f29-de312d5a4ef1/scratchpad/pics";
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

const seed = (email: string, scene: string) =>
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/dev/seed-useful-sky.ts", email, scene], {
    env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e" },
    stdio: "pipe",
  });

for (const scene of ["gap", "tonight", "storm"]) {
  for (const theme of ["light", "dark"] as const) {
    test(`picture ${scene} ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      const email = await signUp(page, "Maya Chen");
      seed(email, scene);
      await page.goto("/");
      await expect(page.getByTestId("day-clock")).toHaveAttribute("data-ready", "true");
      await page.waitForTimeout(3500);
      await page.screenshot({ path: `${OUT}/${scene}-${theme}.png` });
      if (scene === "gap" && theme === "light") {
        await page.locator(".dc-middle").getByRole("button", { name: "Block it" }).click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `${OUT}/gap-blocked.png` });
      }
      if (scene === "tonight" && theme === "light") {
        await page.getByRole("button", { name: "Open today as a timeline" }).click();
        await page.waitForTimeout(1500);
        // go back to yesterday on the line
        const total = page.locator(".dc-node", { hasText: "Spent $96.44" });
        await total.scrollIntoViewIfNeeded();
        await total.click();
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${OUT}/purchases-total.png` });
        await page.locator(".dc-node", { hasText: "Chipotle" }).click();
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${OUT}/purchases-mark.png` });
        // the line closed, with the coin floating on it
        await page.locator(".dc-detail").evaluate(() => {});
      }
    });
  }
}
