import { expect, test } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

// A promise whose time has come gets one "Did you?" card on Today, answered with one tap. Nothing is decided without that answer.
test("a due promise asks once on Today and in Updates, and 'Yes, I did it' keeps it with a warm reply", async ({ page }) => {
  const email = await signUp(page, "Priya Shah");
  await queryAsUser(
    email,
    "insert into promises (user_id, text, due_at) values (current_setting('app.user_id')::uuid, 'Study for Bio', now() - interval '10 minutes')",
  );
  await page.goto("/"); // opening Today is what asks
  // v3's Today is the clock (no updates link on it): the card below, there only because Today asked, is the proof.
  await page.goto("/jarvis/says");
  const card = page.getByTestId("jarvis-message").filter({ hasText: "Study for Bio" });
  await expect(card).toBeVisible();
  await expect(card.getByText(/Did you do it\?/)).toBeVisible();
  // Open until they answer: the page load decided nothing.
  expect(await queryAsUser<{ status: string }>(email, "select status from promises")).toEqual([{ status: "open" }]);
  await expect(card.getByRole("button", { name: "Tomorrow instead" })).toBeVisible();
  await card.getByRole("button", { name: "Yes, I did it" }).click();
  await expect(page.getByText(/did it|Look at you|kept/i).first()).toBeVisible();
  await expect
    .poll(async () => (await queryAsUser<{ status: string; resolved_by: string }>(email, "select status, resolved_by from promises"))[0])
    .toEqual({
      status: "kept",
      resolved_by: "you",
    });
});
