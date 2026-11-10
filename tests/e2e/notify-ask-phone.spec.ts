import { expect, test } from "@playwright/test";
import { pool, signUp } from "./helpers";

/**
 * The calm ask for notifications (owner's program, item 3, 2026-11-10): the welcome's last beat offers them once; "Not
 * now" is remembered on the device, so it never comes back there.
 */
test("the welcome ends with one calm ask for notifications, and Not now is remembered", async ({ page }) => {
  // a browser that hasn't said yes or no yet (headless Chromium always reports "denied")
  await page.addInitScript(() => Object.defineProperty(Notification, "permission", { get: () => "default" }));
  const email = await signUp(page, "Nia Notify", { onboarding: "stay" });
  // about you is already saved, so the welcome opens on connecting (it keeps its place)
  await pool.query(
    `update users set preferences = preferences || '{"birthDate":"2004-04-04","lifeStage":"student","companion":"ray"}'::jsonb where email = $1`,
    [email],
  );
  await page.goto("/welcome");
  await page.getByRole("button", { name: "I'll connect later" }).click();
  const ask = page.getByRole("region", { name: "Notifications" });
  await expect(ask).toContainText("check-ins as notifications?");
  await expect(ask.getByRole("button", { name: "Turn on" })).toBeVisible();
  await ask.getByRole("button", { name: "Not now" }).click();
  await expect(ask).toHaveCount(0);
  // back to the same beat: not asked again on this device
  await page.reload();
  await page.getByRole("button", { name: "I'll connect later" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Notifications" })).toHaveCount(0);
});
