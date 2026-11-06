import { test, type Browser } from "@playwright/test";
import { pool } from "./helpers";

const OUT = "/tmp/claude-0/-workspace/f7ab8f55-8a1f-5074-8497-6dd61dec11e5/scratchpad/hq-shots";
const EMAIL = "admin-owner@example.com";

async function owner(browser: Browser, opts: object) {
  await pool.query("delete from users where email = $1", [EMAIL]);
  const ctx = await browser.newContext({ deviceScaleFactor: 1, ...opts });
  const p = await ctx.newPage();
  await p.goto("/signup");
  await pool.query("delete from rate_limit_buckets where key like 'signup:ip:%'");
  await p.getByLabel("Your name").fill("Owner Olu");
  await p.getByLabel("Email").fill(EMAIL);
  await p.getByLabel("Password").fill("correct horse battery");
  await p.getByRole("button", { name: "Create account" }).click();
  await p.waitForURL("**/welcome");
  await p.getByRole("button", { name: "Skip setup" }).click();
  await p.waitForURL((u) => u.pathname === "/");
  await p.getByRole("button", { name: "Skip tour" }).click();
  await pool.query("update users set totp_enabled_at = now() where email = $1", [EMAIL]);
  return p;
}

test("shots", async ({ browser }) => {
  test.setTimeout(180_000);
  for (const scheme of ["light", "dark"] as const) {
    for (const [name, vp, mobile] of [["phone", { width: 393, height: 852 }, true], ["desktop", { width: 1280, height: 900 }, false]] as const) {
      const p = await owner(browser, { viewport: vp, isMobile: mobile, hasTouch: mobile, colorScheme: scheme });
      await p.goto("/admin/hq");
      await p.waitForTimeout(500);
      await p.screenshot({ path: `${OUT}/office-${name}-${scheme}.png`, fullPage: true });
      if (scheme === "light" && name === "desktop") {
        await p.goto("/admin/hq?view=workspace");
        await p.screenshot({ path: `${OUT}/workspace-desktop-light.png`, fullPage: true });
        await p.goto("/admin/hq/developer");
        await p.screenshot({ path: `${OUT}/developer-desktop-light.png`, fullPage: true });
        await p.goto("/admin/hq/missions");
        await p.screenshot({ path: `${OUT}/missions-desktop-light.png`, fullPage: true });
      }
      await p.context().close();
    }
  }
});
