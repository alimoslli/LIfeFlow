import { expect, test, type Page } from "@playwright/test";
import { pool, queryAsUser, signUp } from "./helpers";

/** A virtual platform authenticator (like Face ID): real WebAuthn ceremonies, approved automatically. */
async function addFaceId(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return cdp;
}

async function signOut(page: Page) {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
}

test("passkeys: offered after a password sign-in, managed in Settings, used to sign in and to unlock Money", async ({ page }) => {
  const email = await signUp(page, "Pia Passkey");
  await signOut(page);
  await addFaceId(page);

  // Sign in with the password; the app offers Face ID for next time.
  await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveAttribute("autocomplete", "username webauthn");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const offer = page.getByRole("dialog", { name: "Use Face ID next time?" });
  await expect(offer).toBeVisible();
  await offer.getByRole("button", { name: "Use Face ID" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Next time, sign in with Face ID" })).toBeVisible();

  // Settings lists it; rename it.
  await page.goto("/settings/security");
  await expect(page.getByText("iPhone", { exact: true })).toBeVisible();
  await expect(page.getByText(/not used yet/)).toBeVisible();
  await page.getByRole("button", { name: "Rename iPhone" }).click();
  const rename = page.getByRole("dialog", { name: "Rename passkey" });
  await rename.getByLabel("Name").fill("Pia's iPhone");
  await rename.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Pia's iPhone", { exact: true })).toBeVisible();

  // Turn on the Money lock.
  await page.getByRole("checkbox", { name: /Require Face ID/ }).check();
  await page.getByRole("button", { name: "Save" }).last().click();
  await expect(page.getByRole("status").filter({ hasText: "Money locks after 5 minutes" })).toBeVisible();
  await page.goto("/money");
  await expect(page.getByTestId("money-locked")).toHaveCount(0); // just turned on: unlocked for now

  // Idle past the window (move the unlock time back), and Money locks: on the server, before any data loads.
  await pool.query("update sessions set money_unlocked_at = now() - interval '1 hour' where user_id = (select id from users where email = $1)", [email]);
  await page.goto("/finances/transactions");
  await expect(page.getByTestId("money-locked")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Money is locked" })).toBeVisible();
  await page.getByRole("button", { name: "Unlock with Face ID" }).click();
  await expect(page.getByTestId("money-locked")).toHaveCount(0);

  // Sign out: the passkey appears in the email field's autofill (conditional UI); the virtual authenticator picks it at once.
  await signOut(page);
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pia");

  // And with the "Sign in with a passkey" button (autofill turned off in this browser).
  await page.addInitScript(() => {
    Object.defineProperty(PublicKeyCredential, "isConditionalMediationAvailable", { value: async () => false });
  });
  await signOut(page);
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pia");

  const audit = (await queryAsUser<{ action: string }>(email, "select action from audit_events order by created_at")).map((r) => r.action);
  expect(audit).toEqual(expect.arrayContaining(["auth.passkey_added", "auth.passkey_renamed", "money.lock_settings", "money.unlocked", "auth.login"]));
  const [pk] = (await pool.query("select name, last_used_at, public_key from passkeys where user_id = (select id from users where email = $1)", [email])).rows;
  expect(pk.name).toBe("Pia's iPhone");
  expect(pk.last_used_at).not.toBeNull();
});

test("forgot password and Sign in with Apple say plainly when they aren't set up", async ({ page }) => {
  await page.goto("/login");
  // No Apple keys on this server: no Apple button rather than one that can't work.
  await expect(page.getByRole("link", { name: "Sign in with Apple" })).toHaveCount(0);
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();
  await expect(page.getByText("Password reset by email isn't available yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send reset link" })).toBeDisabled();
  await page.goto("/login?error=apple-unavailable");
  await expect(page.getByRole("alert").filter({ hasText: "Sign in with Apple isn't set up" })).toBeVisible();
  // A reset link without its token explains what to do.
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "This link isn't complete." })).toBeVisible();
});
