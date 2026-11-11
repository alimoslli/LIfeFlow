import { expect, type Page, test } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

// Owner, 2026-11-10: a phone's Today is one screen: the sky on top, the clouds (or the skyling's answer, in their place)
// in the middle, and the chat bar at the bottom, which stays when the day opens as a line. One chat keeps going: the
// skyling's tab opens the same one. The test model answers.
test("Today: the answer comes in the middle, what it saves lands on the sky, Undo and Do it work, one chat keeps going", async ({ page }) => {
  const email = await signUp(page, "Tia Today");
  await page.goto("/");
  const dock = page.locator(".dc-dock");
  const box = dock.getByRole("textbox", { name: "Message Ray" });
  const reply = page.locator('[data-testid="today-reply"]:visible');
  // one screen: nothing under Today to scroll to
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);

  // 1. a to-do from the bar: saved, said in the middle, on the sky, and still on Today
  await box.fill('/tool create_tasks {"tasks":[{"title":"Call the dentist"}]}');
  await box.press("Enter");
  await expect(reply.getByRole("list", { name: "Saved" })).toContainText("Call the dentist", { timeout: 15_000 });
  await expect(page).toHaveURL(/\/$/);
  expect(await queryAsUser(email, "select title from tasks where title = 'Call the dentist'")).toHaveLength(1);
  await expectInOrder(page);
  // the line keeps the chat bar (owner: "when it turns into a timeline theres no chatbox")
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(page.locator(".dc-node", { hasText: "Call the dentist" })).toBeAttached();
  await expect(box).toBeVisible();
  const pin = (await page.locator(".dc-pinbar button").boundingBox())!;
  const bar = (await dock.locator("form").boundingBox())!;
  expect(pin.y + pin.height).toBeLessThanOrEqual(bar.y);
  await page.getByRole("button", { name: /^Now, .* Back to Today$/ }).click();

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

  // 4. the skyling's tab opens the same chat, with no new chat to start
  await page.getByRole("navigation", { name: "Main" }).last().getByRole("link", { name: "Ray" }).click();
  await expect(page).toHaveURL(/\/jarvis$/);
  await expect(page.locator(".lf-bubble-me", { hasText: "Do it" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Let's clear your sky." })).toBeVisible();
  await expect(page.getByRole("link", { name: "New chat" })).toHaveCount(0);
  expect(await queryAsUser(email, "select id from conversations")).toHaveLength(1);
});

// COO, 2026-11-10 (seen while filming, 432x768): a lookup showed "✓ Done" as if it had saved something, and Today jumped
// while the answer streamed (it redrew after every tool). A lookup gets no ✓ line and Today doesn't redraw for it; the bar
// stays put the whole time.
test("a lookup answer: no ✓ line, no redraw, and the bar stays still while it streams", async ({ page }) => {
  await page.setViewportSize({ width: 432, height: 768 });
  await signUp(page, "Lou Lookup");
  await page.goto("/");
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-ready", "true");
  const form = page.locator(".dc-dock form");
  const box = form.getByRole("textbox", { name: "Message Ray" });
  // every redraw of Today asks the server for it again
  let redraws = 0;
  page.on("request", (r) => {
    if (r.headers()["rsc"] === "1" && new URL(r.url()).pathname === "/") redraws++;
  });
  // where the bar sits, every frame, from the send until the answer is done
  await page.evaluate(() => {
    const el = document.querySelector(".dc-dock form")!;
    const tops: number[] = ((window as unknown as { tops: number[] }).tops = []);
    const tick = () => {
      tops.push(Math.round(el.getBoundingClientRect().top));
      if (tops.length < 400) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await box.fill("/tool tonight {}");
  await box.press("Enter");
  const reply = page.locator('[data-testid="today-reply"]:visible');
  // the test model words its answer from the tool's result ("Done: {…}")
  await expect(reply).toContainText("Done:", { timeout: 15_000 });
  await expect(reply.getByRole("list", { name: "Saved" })).toHaveCount(0);
  await page.waitForTimeout(800);
  expect(redraws).toBe(0);
  const tops = await page.evaluate(() => [...new Set((window as unknown as { tops: number[] }).tops)]);
  expect(tops).toHaveLength(1);
});

// A long answer stays in the middle, between the sky and the bar, and scrolls inside it: on a small and a tall phone.
for (const [label, size] of [
  ["a small phone", { width: 375, height: 667 }],
  ["a tall phone", { width: 390, height: 844 }],
] as const)
  test(`on ${label} a long answer stays in the middle`, async ({ page }) => {
    await page.setViewportSize(size);
    await signUp(page, "Sam Small");
    await page.goto("/");
    const box = page.locator(".dc-dock").getByRole("textbox", { name: "Message Ray" });
    await box.fill(`Tell me about ${"my long week of classes, shifts and plans ".repeat(8)}`);
    await box.press("Enter");
    const reply = page.locator('[data-testid="today-reply"]:visible');
    await expect(reply).toContainText("You said:", { timeout: 15_000 });
    // its words can be read: the card has room for a few lines (more scroll inside it)
    expect(await reply.evaluate((el) => el.clientHeight)).toBeGreaterThanOrEqual(90);
    await expect(reply.getByText(/You said:/)).toBeInViewport();
    await expectInOrder(page);
  });

/** Top to bottom with nothing over anything: the sky's own drawing ("Sun sets in…" on the water), the middle, then the
 * docked bar's highest part (the skyling standing on it). The sky redraws as it moves, so it's all read at once. */
async function expectInOrder(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const chip = document.querySelector(".dc-sunchip")?.getBoundingClientRect();
        const sky = document.querySelector('[data-testid="day-clock"]')!.getBoundingClientRect();
        const mid = document.querySelector(".dc-middle")!.getBoundingClientRect();
        const dock = document.querySelector(".dc-dock")!;
        const top = Math.min(
          ...[dock, ...dock.querySelectorAll("*")]
            .map((e) => e.getBoundingClientRect())
            .filter((r) => r.width && r.height)
            .map((r) => r.top),
        );
        if (!chip?.height) return "no chip yet";
        return Math.round(Math.max(chip.bottom - mid.top, sky.bottom - mid.top - 1, mid.bottom - top - 1));
      }),
    )
    .toBeLessThanOrEqual(0);
}

// COO, 2026-11-11 (seen while filming, 432x768): Undo lay over the answer's lines after "✓ Event added"; and the owner:
// "when I send a lot of text into the chat box, especially on the phone, I can't see the rest of it". The answer scrolls
// under its top row with its buttons after the words; the bar grows to three lines and then scrolls, without covering the answer or
// moving the sky, and Enter still sends. The chat page's box grows too.
test("432x768: Undo never lies on the answer, and a long message grows the bar without covering anything", async ({ page }) => {
  await page.setViewportSize({ width: 432, height: 768 });
  await signUp(page, "Gus Grow");
  await page.goto("/");
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-ready", "true");
  const form = page.locator(".dc-dock form");
  const box = form.getByRole("textbox", { name: "Message Ray" });
  const reply = page.locator('[data-testid="today-reply"]:visible');

  await box.fill('/tool create_events {"events":[{"title":"Dentist checkup","date":"2026-11-13","startTime":"15:00","location":"Main Street Dental"}]}');
  await box.press("Enter");
  const undo = reply.getByRole("button", { name: "Undo" });
  await expect(undo).toBeVisible({ timeout: 15_000 });
  const body = (await reply.getByTestId("today-reply-body").boundingBox())!;
  expect(body.y + body.height).toBeLessThanOrEqual((await undo.boundingBox())!.y);

  // a long message: the bar grows, the sky doesn't move, and the bar stays under the answer
  const sky = (await page.getByTestId("day-clock").boundingBox())!;
  const oneLine = (await box.boundingBox())!.height;
  await box.fill("Can you move my study block to after work on Thursday? ".repeat(3));
  await expect.poll(async () => (await box.boundingBox())!.height).toBeGreaterThan(oneLine * 2);
  const card = (await reply.boundingBox())!;
  expect(card.y + card.height).toBeLessThanOrEqual((await form.boundingBox())!.y + 1);
  expect((await page.getByTestId("day-clock").boundingBox())!.y).toBe(sky.y);
  // far more than three lines scrolls inside the box, and Send is still there
  await box.fill("Plan my week around my shifts and the BIO exam please. ".repeat(12));
  expect((await box.boundingBox())!.height).toBeLessThanOrEqual(3 * 24 + 20 + 1);
  expect(await box.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect(form.getByRole("button", { name: "Send" })).toBeInViewport();
  await box.press("Enter");
  await expect(reply).toContainText("You said: Plan my week", { timeout: 15_000 });
  await expect.poll(async () => (await box.boundingBox())!.height).toBe(oneLine);

  // the chat page's box grows the same way
  await page.goto("/jarvis");
  const chatBox = page.getByRole("textbox", { name: "Message Ray" });
  const chatOne = (await chatBox.boundingBox())!.height;
  await chatBox.fill("One more thing about Thursday. ".repeat(6));
  await expect.poll(async () => (await chatBox.boundingBox())!.height).toBeGreaterThan(chatOne * 2);
});
