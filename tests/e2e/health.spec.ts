import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("Apple Health: create a key, the Shortcut's request is saved, revoking stops it", async ({ page, request }) => {
  await signUp(page, "Health Hana");
  await page.goto("/settings/integrations");
  await expect(page.getByText("Not set up")).toBeVisible();
  await page.getByRole("button", { name: "Create a key" }).click();
  const key = (await page.locator("code", { hasText: /^lfh_/ }).textContent())!.trim();

  // What the iOS Shortcut sends (no cookies, just the key).
  const send = (token: string) =>
    request.post("/api/apple-health/ingest", { headers: { authorization: `Bearer ${token}` }, data: { metrics: { steps: "8,532", weightLb: 172.4 } } });
  expect((await send("lfh_nope")).status()).toBe(401);
  const ok = await send(key);
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toMatchObject({ ok: true, saved: 2 });

  await page.reload();
  await expect(page.getByText("Receiving data")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Revoke My iPhone" }).click();
  await expect(page.getByRole("button", { name: "Revoke My iPhone" })).toHaveCount(0);
  expect((await send(key)).status()).toBe(401);
});
