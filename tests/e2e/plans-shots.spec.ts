import path from "node:path";
import { test } from "@playwright/test";
import { pool, signUp } from "./helpers";

/** Pictures for the owner, made only in a test environment with the switch on: E2E_PLANS=on E2E_PLANS_SHOTS=<folder>. */
const DIR = process.env.E2E_PLANS_SHOTS;
const SIZES = [
  { name: "phone-393", width: 393, height: 852 },
  { name: "laptop-1440x900", width: 1440, height: 900 },
  { name: "laptop-1280x800", width: 1280, height: 800 },
];

test.skip(!DIR || process.env.E2E_PLANS !== "on", "pictures only");

for (const size of SIZES) {
  for (const stage of ["student", "working"] as const) {
    test(`plan picker ${stage} ${size.name}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      const email = await signUp(page);
      await pool.query(`update users set preferences = preferences || $2::jsonb where email = $1`, [email, JSON.stringify({ lifeStage: stage })]);
      await page.goto("/settings/plan");
      await page.getByTestId("plan-options").waitFor();
      await page.screenshot({ path: path.join(DIR!, `plan-picker-${stage === "student" ? "student" : "everyone-else"}-${size.name}.png`), fullPage: true });
      // the paywall: where a locked connection sends someone
      await page.goto("/settings/plan?need=google");
      await page.getByTestId("plan-options").waitFor();
      await page.screenshot({ path: path.join(DIR!, `paywall-${stage === "student" ? "student" : "everyone-else"}-${size.name}.png`), fullPage: true });
      await ctx.close();
    });
  }
}
