import { expect, test } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

// The cast (docs/design/companions/cast.md): in Settings › your assistant, picking a companion saves at once, brings its
// name (unless the assistant has a name of its own) and its tone, and it's the one on top of Today.
test("picking a companion in Settings makes it the assistant and puts it on the wheel", async ({ page }) => {
  const email = await signUp(page, "Cast Tester");
  await page.goto("/settings/jarvis");
  const six = page.getByRole("radiogroup", { name: "Your companion" });
  await expect(six.getByRole("radio")).toHaveCount(6);
  for (const r of await six.getByRole("radio").all()) expect((await r.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  await six.getByRole("radio", { name: /^Goldie/ }).click();
  await expect(six.getByRole("radio", { name: /^Goldie/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("heading", { name: "Goldie" })).toBeVisible();
  await expect
    .poll(async () => (await queryAsUser<{ p: Record<string, string> }>(email, "select preferences as p from users where email = $1", [email]))[0].p.companion)
    .toBe("goldie");
  const [{ p }] = await queryAsUser<{ p: Record<string, string> }>(email, "select preferences as p from users where email = $1", [email]);
  expect(p).toMatchObject({ companion: "goldie", assistantName: "Goldie", assistantStyle: "friend" });

  // A name of their own stays when they switch companions.
  await page.reload();
  await page.getByLabel("Name", { exact: true }).fill("Pip");
  await page.getByRole("button", { name: /^Save/ }).first().click();
  await expect
    .poll(
      async () => (await queryAsUser<{ p: Record<string, string> }>(email, "select preferences as p from users where email = $1", [email]))[0].p.assistantName,
    )
    .toBe("Pip");
  await six.getByRole("radio", { name: /^Noon/ }).click();
  await expect
    .poll(async () => (await queryAsUser<{ p: Record<string, string> }>(email, "select preferences as p from users where email = $1", [email]))[0].p.companion)
    .toBe("noon");
  const [{ p: after }] = await queryAsUser<{ p: Record<string, string> }>(email, "select preferences as p from users where email = $1", [email]);
  expect(after).toMatchObject({ assistantName: "Pip", assistantStyle: "direct" });

  await page.goto("/");
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-companion", "noon");
});
