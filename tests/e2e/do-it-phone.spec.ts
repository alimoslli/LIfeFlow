import { expect, test } from "@playwright/test";
import { askJarvis, queryAsUser, signUp } from "./helpers";

// Program item 8: when the skyling's answer ends by offering to do something, yes is one tap ("Do it"), not typing.
// The test model repeats what it was sent, so a message that is an offer makes its answer end with that offer.
test("an answer that offers to do something gets Do it and Not now; Do it is sent as the reply", async ({ page }) => {
  const email = await signUp(page, "Tap Yes");
  await page.goto("/jarvis");
  await askJarvis(page, "Want me to move the study block to Wednesday at 3 PM?");
  const doIt = page.getByRole("button", { name: "Do it", exact: true });
  await expect(doIt).toBeVisible();
  await expect(page.getByRole("button", { name: "Not now", exact: true })).toBeVisible();
  // 44 px or more: a thumb can hit it
  expect((await doIt.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await doIt.click();
  await expect
    .poll(
      async () =>
        (await queryAsUser<{ content: string }>(email, "select content from messages where role = 'user' order by created_at desc limit 1"))[0]?.content,
    )
    .toBe("Do it");
  // the next answer is not an offer, so the usual follow-ups come back
  await expect(page.getByText(/You said: Do it/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Do it", exact: true })).toHaveCount(0);
});

test("a plain question back is not an offer: no Do it", async ({ page }) => {
  await signUp(page, "No Offer");
  await page.goto("/jarvis");
  await askJarvis(page, "Which class is it for?");
  await expect(page.getByText(/You said: Which class/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Do it", exact: true })).toHaveCount(0);
});
