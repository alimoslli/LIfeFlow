import { expect, test } from "@playwright/test";
import { askJarvis, COMPOSER, queryAsUser, signUp } from "./helpers";

const save = (content: string) => `/tool save_memory {"content":"${content}","category":"preference","basis":"stated"}`;

test("Jarvis suggests a memory; it's used only after the user taps Keep", async ({ page }) => {
  const email = await signUp(page, "Robin Park");
  await page.goto("/jarvis");

  // No explicit "remember" in the user's words → a suggestion, not a saved memory.
  await askJarvis(page, save("Prefers evening study sessions."));
  const card = page.getByLabel("Memory suggestion");
  await expect(card).toContainText("Prefers evening study sessions.");
  expect(await queryAsUser(email, "select status from memories")).toEqual([{ status: "proposed" }]);

  await card.getByRole("button", { name: "Keep" }).click();
  await expect(card).toContainText("✓ Saved to memory");
  await expect.poll(async () => (await queryAsUser<{ status: string }>(email, "select status from memories"))[0]?.status).toBe("active");

  // The decision survives a reload of the conversation.
  await page.reload();
  await expect(page.getByLabel("Memory suggestion")).toContainText("✓ Saved to memory");

  // Settings shows it, and run metrics were recorded for this user.
  await page.goto("/jarvis/memory");
  await expect(page.getByText("Prefers evening study sessions.")).toBeVisible();
  await page.goto("/jarvis/memory?debug=1");
  await expect(page.getByText("Requests (30 days)")).toBeVisible();
  const runs = await queryAsUser<{ n: number }>(email, "select count(*)::int as n from jarvis_runs");
  expect(runs[0].n).toBeGreaterThanOrEqual(1);
});

test("an explicit request saves directly; dismissed suggestions are not used", async ({ page }) => {
  const email = await signUp(page, "Sam Cole");
  await page.goto("/jarvis");
  await askJarvis(page, `remember this please\n${save("Likes short answers.")}`);
  await expect(page.getByText(/^Done:/).first()).toBeVisible();
  await expect(page.getByLabel("Memory suggestion")).toHaveCount(0);

  await askJarvis(page, save("Enjoys jazz."));
  await page.getByLabel("Memory suggestion").getByRole("button", { name: "Not now" }).click();
  await expect(page.getByLabel("Memory suggestion")).toContainText("Not saved");
  await expect
    .poll(async () =>
      (await queryAsUser<{ content: string; status: string }>(email, "select content, status from memories order by created_at")).map((r) => r.status),
    )
    .toEqual(["active", "rejected"]);

  // Turning suggestions off is a visible, working control.
  await page.goto("/jarvis/memory");
  await page.getByRole("button", { name: "Turn memory suggestions off" }).click();
  await expect(page.getByRole("button", { name: "Turn memory suggestions on" })).toBeVisible();
});

test("Ideas open Jarvis ready to send, and an import from another AI saves only what's ticked", async ({ page }) => {
  const email = await signUp(page, "Idea Tester");
  await page.goto("/jarvis/ideas");
  await expect(page.getByRole("region", { name: "For you" })).toContainText("No savings goal yet");
  await page.getByRole("button", { name: /Quiz me before a test/ }).click();
  // the chat page, with the idea typed in and nothing sent (no side panel, owner 2026-11-10)
  await page.waitForURL("**/jarvis?ask=*");
  await expect(page.getByLabel(COMPOSER)).toHaveValue("Quiz me on my next exam's topics, one question at a time.");
  await expect(page.locator(".lf-bubble-me")).toHaveCount(0);
  await page.goto("/jarvis/ideas");

  await page.getByRole("link", { name: /Bring what your other AI knows/ }).click();
  await page
    .getByLabel("Paste the answer here")
    .fill(
      "ABOUT ME:\n- I work at Target on weekends.\n- My password is hunter2\nPREFERENCES:\n- I prefer studying at night.\nMILESTONES:\n- 2022 - Graduated from Lincoln High\n- Learned to drive\nGOALS:\n- Get a 3.5 GPA",
    );
  await page.getByRole("button", { name: "Sort it for me" }).click();
  await expect(page.getByRole("region", { name: "Milestones" })).toContainText("Graduated from Lincoln High");
  await expect(page.getByRole("region", { name: "Milestones" })).toContainText("2022 · School");
  await page
    .getByRole("region", { name: "Milestones" })
    .getByLabel(/Learned to drive/)
    .uncheck();
  await page.getByRole("button", { name: "Save 5 items" }).click();
  await expect(page).toHaveURL(/\/milestones\?imported=2\.1\.1/);
  await expect(page.getByRole("status")).toContainText("Imported 2 about you, 1 milestone, 1 goal");
  await expect(page.getByRole("region", { name: "2022" })).toContainText("Graduated from Lincoln High");
  await expect(page.getByText("Learned to drive")).toHaveCount(0);
  expect(await queryAsUser<{ status: string; category: string }>(email, "select status, category from memories order by category")).toEqual([
    { status: "active", category: "fact" },
    { status: "active", category: "preference" },
  ]);

  // Add one by hand.
  await page.getByLabel("What happened", { exact: true }).fill("Moved to Atlanta");
  await page.getByLabel("When", { exact: true }).fill("May 2023");
  await page.getByLabel("Kind", { exact: true }).selectOption("travel");
  await page.getByRole("button", { name: "Add milestone" }).click();
  await expect(page.getByRole("region", { name: "2023" })).toContainText("May 2023 · Travel");
  await page.getByRole("navigation", { name: "Milestones and goals" }).getByRole("link", { name: "Goals" }).click();
  await expect(page).toHaveURL(/\/goals$/);
  await expect(page.getByText("Get a 3.5 GPA")).toBeVisible();
});
