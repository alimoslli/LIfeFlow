import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { localInstant, pool, signUp } from "./helpers";

/**
 * The pictures for the owner's okay on the Today list (2026-11-16): Today, Money and the Calendar on a phone browser's
 * short window (390 x 664) and a laptop, by day and at night, from the busy made-up week. Off unless TODAY_V2_SHOTS=1.
 */
const DIR = "docs/audits/today-v2";
const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e";
const SCREENS = [
  { name: "phone", viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true },
  { name: "laptop", viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
] as const;
const MOMENTS = [
  { name: "day", hour: 13, minute: 0, scheme: "light" },
  { name: "night", hour: 21, minute: 30, scheme: "dark" },
] as const;

test.skip(!process.env.TODAY_V2_SHOTS, "pictures only on request");
test.setTimeout(180_000);

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(900);
}

for (const screen of SCREENS)
  test(`pictures on a ${screen.name}`, async ({ browser }) => {
    mkdirSync(DIR, { recursive: true });
    const context = await browser.newContext({ viewport: screen.viewport, isMobile: screen.isMobile, hasTouch: screen.hasTouch, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const email = await signUp(page, "Maya Torres");
    execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/dev/seed-clock-look.ts", email, "--busy"], {
      env: { ...process.env, DATABASE_URL: E2E_DB },
    });
    const { rows } = await pool.query<{ timezone: string }>("select timezone from users where email = $1", [email.toLowerCase()]);
    const tz = rows[0].timezone;
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const m of MOMENTS) {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: m.scheme });
      const at = localInstant(tz, m.hour, m.minute);
      // the app server's clock too, when the run gives it one (E2E_SERVER_NODE_OPTIONS loads scripts/test-user/clock.cjs and
      // LF_TEST_CLOCK names its file): without it the server words the note at the real time, not the picture's
      if (process.env.LF_TEST_CLOCK) {
        writeFileSync(process.env.LF_TEST_CLOCK, String(at.getTime() - Date.now()));
        await page.waitForTimeout(400);
      }
      await page.clock.setFixedTime(at);
      await page.goto("/");
      await expect(page.getByTestId("day-clock")).toHaveAttribute("data-ready", "true");
      await settle(page);
      await page.screenshot({ path: `${DIR}/${screen.name}-${m.name}-today.png` });
      await page.goto("/money");
      await settle(page);
      await page.screenshot({ path: `${DIR}/${screen.name}-${m.name}-money.png`, fullPage: screen.name === "laptop" });
      if (m.name === "day") {
        const month = page.getByTestId("money-month");
        await month.locator("summary").click();
        await settle(page);
        if (screen.name === "laptop") await page.screenshot({ path: `${DIR}/${screen.name}-${m.name}-money-month-open.png`, fullPage: true });
        else
          // a phone: what a thumb sees after the tap, one screen at a time (a full-page picture leaves the tabs mid-page)
          for (const [i, part] of ["summary", "[aria-label='Next 30 days']", "[aria-label='Where it went']"].entries()) {
            await month
              .locator(part)
              .first()
              .evaluate((el) => el.scrollIntoView({ block: "start" }));
            await page.waitForTimeout(300);
            await page.screenshot({ path: `${DIR}/${screen.name}-${m.name}-money-month-open-${i + 1}.png` });
          }
      }
      await page.goto("/plan");
      await settle(page);
      await page.screenshot({ path: `${DIR}/${screen.name}-${m.name}-calendar.png` });
    }
    await context.close();
  });
