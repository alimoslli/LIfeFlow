import { expect, test, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";
import { signUp } from "./helpers";

const totp = (secret: string, offsetMs = 0) =>
  new TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(secret) }).generate({ timestamp: Date.now() + offsetMs });

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("weak passwords are refused at sign-up, with a live meter", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Weak Pass");
  await page.getByLabel("Email").fill(`weak-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("password123");
  await expect(page.getByText(/weak/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/Choose a stronger password/)).toBeVisible();
});

test("two-step sign-in: turn on, then a code is required to sign in", async ({ page }) => {
  const email = await signUp(page, "Secure Sam");
  await page.goto("/settings/security");
  await page.getByRole("button", { name: "Turn on" }).click();
  const secret = (await page.getByLabel("Setup key").textContent())!.replace(/\s/g, "");
  await page.getByLabel("Code from the app").fill(totp(secret));
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("list", { name: "Backup codes" }).getByRole("listitem")).toHaveCount(10);
  const codes = (await page.getByRole("list", { name: "Backup codes" }).getByRole("listitem").allTextContents()).map((c) => c.trim());
  expect(codes).toHaveLength(10);
  await page.getByRole("button", { name: "I've saved them" }).click();
  await expect(page.getByText(/On since/)).toBeVisible();

  // Sign out, then the password alone is not enough.
  await page.getByRole("button", { name: "Sign out" }).click();
  await signIn(page, email);
  await page.waitForURL("**/login/verify");
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/); // no session yet

  // Wrong code, then a backup code.
  await page.goto("/login/verify");
  await page.getByLabel("Authenticator code").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText(/didn't match/)).toBeVisible();
  await page.getByRole("button", { name: /Use a backup code/ }).click();
  await page.getByLabel("Backup code").fill(codes[0]);
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((u) => u.pathname === "/");

  // Next time, a fresh authenticator code works; the used backup code doesn't.
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await signIn(page, email);
  await page.waitForURL("**/login/verify");
  await page.getByRole("button", { name: /Use a backup code/ }).click();
  await page.getByLabel("Backup code").fill(codes[0]);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText(/didn't match/)).toBeVisible();
  await page.getByRole("button", { name: /authenticator app instead/ }).click();
  await page.getByLabel("Authenticator code").fill(totp(secret, 30_000));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((u) => u.pathname === "/");
});

test("Privacy Policy and Terms are public and linked from sign-up", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("link", { name: "Privacy Policy" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
  await expect(page.getByText(/Limited Use requirements/)).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "Terms" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Terms of Use" })).toBeVisible();
  expect(await page.locator("article").innerText()).not.toMatch(/[—–]/);
});
