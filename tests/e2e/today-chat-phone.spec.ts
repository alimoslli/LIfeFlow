import { expect, type Page, test } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

// Owner, 2026-11-10 (through the COO): "there's no different page for the assistant. You just type it below the timeline
// ... we want to see it being added to the timeline". The answer streams into a card under Today's bar, what it saves is
// on the sky at once, Undo and "Do it" work there, and the whole chat is one tap away. The test model answers.
test("Today's bar: the answer comes under it, what it saves lands on the sky, Undo and Do it work, the chat is one tap away", async ({ page }) => {
  const email = await signUp(page, "Tia Today");
  await page.goto("/");
  const dock = page.locator(".dc-dock");
  const box = dock.getByRole("textbox", { name: "Message Ray" });
  const reply = dock.getByTestId("today-reply");

  // 1. a to-do from the bar: saved, said in the card, on the sky, and still on Today
  await box.fill('/tool create_tasks {"tasks":[{"title":"Call the dentist"}]}');
  await box.press("Enter");
  await expect(reply.getByRole("list", { name: "Saved" })).toContainText("Call the dentist", { timeout: 15_000 });
  await expect(page).toHaveURL(/\/$/);
  expect(await queryAsUser(email, "select title from tasks where title = 'Call the dentist'")).toHaveLength(1);
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(page.locator(".dc-node", { hasText: "Call the dentist" })).toBeAttached();
  await page.getByRole("button", { name: /^Now, .* Back to Today$/ }).click();

  // nothing over anything: the sky ends above the bar, the skyling on it and its cloud while the answer is open
  await expectSkyClear(page);

  // 2. Undo takes it back, off the sky
  await reply.getByRole("button", { name: "Undo" }).click();
  await expect(reply).toContainText(/Took that back|took back/i);
  await expect.poll(async () => (await queryAsUser(email, "select title from tasks where title = 'Call the dentist'")).length).toBe(0);

  // 3. an answer that offers to act gets Do it / Not now; Do it is sent as the reply, in the same conversation
  await box.fill("Should I add it?");
  await box.press("Enter");
  await expect(reply).toContainText("You said: Should I add it?");
  await reply.getByRole("button", { name: "Do it" }).click();
  await expect(reply).toContainText("You said: Do it");

  // 4. the whole conversation is one tap away
  await reply.getByRole("link", { name: "Open the chat" }).click();
  await page.waitForURL((u) => /^\/jarvis\/[0-9a-f-]{36}$/.test(u.pathname));
  await expect(page.locator(".lf-bubble-me", { hasText: "Do it" })).toBeVisible();
});

// A long answer never pushes the bar over the sky. A shorter phone window (an iPhone SE) puts the bar and the card in the
// page under the sky while the answer is open, and the page brings the whole answer into view above the tabs; a tall
// phone (the installed app) keeps the bar where it is and the answer scrolls inside the card. Either way the sky stops
// getting shorter where its horizon and "Sun sets in…" need the room.
for (const [label, size] of [
  ["a small phone", { width: 375, height: 667 }],
  ["a tall phone", { width: 390, height: 844 }],
] as const)
  test(`on ${label} a long answer stays under the sky and in view`, async ({ page }) => {
    await page.setViewportSize(size);
    await signUp(page, "Sam Small");
    await page.goto("/");
    const dock = page.locator(".dc-dock");
    const box = dock.getByRole("textbox", { name: "Message Ray" });
    const reply = dock.getByTestId("today-reply");
    await box.fill(`Tell me about ${"my long week of classes, shifts and plans ".repeat(8)}`);
    await box.press("Enter");
    await expect(reply).toContainText("You said:", { timeout: 15_000 });
    const tabs = page.locator('nav[aria-label="Main"]:visible');
    await expect
      .poll(async () => {
        const card = (await reply.boundingBox())!;
        const nav = (await tabs.boundingBox())!;
        return Math.round(card.y + card.height - nav.y);
      })
      .toBeLessThanOrEqual(0);
    await expectSkyClear(page);
  });

/** The sky's own drawing ("Sun sets in…" on the water) and the sky itself end above the docked bar's highest part. The sky
 * redraws its words as it moves, so all of it is measured at once, once the chip is back (after the line folds away). */
async function expectSkyClear(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const chip = document.querySelector(".dc-sunchip")?.getBoundingClientRect();
        const sky = document.querySelector('[data-testid="day-clock"]')!.getBoundingClientRect();
        const dock = document.querySelector(".dc-dock")!;
        const top = Math.min(
          ...[dock, ...dock.querySelectorAll("*")]
            .map((e) => e.getBoundingClientRect())
            .filter((r) => r.width && r.height)
            .map((r) => r.top),
        );
        return chip && chip.height ? Math.round(Math.max(chip.bottom - top, sky.bottom - top - 1)) : "no chip yet";
      }),
    )
    .toBeLessThanOrEqual(0);
}
