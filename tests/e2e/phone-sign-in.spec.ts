import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

// This test server has no email or texting set up, so a phone code can't travel: the option is hidden at sign-in and Settings says so plainly.
test("phone sign-in says plainly when codes can't be sent yet", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByText("Use my phone number instead")).toHaveCount(0);
  await signUp(page, "Dana Ruiz");
  await page.goto("/settings/security");
  await expect(page.getByRole("heading", { name: "Sign in with your phone number" })).toBeVisible();
  await expect(page.getByText(/This isn't available yet/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send me a code" })).toHaveCount(0);
});
