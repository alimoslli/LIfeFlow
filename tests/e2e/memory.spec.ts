import { expect, test } from "@playwright/test";
import { askJarvis, queryAsUser, signUp } from "./helpers";

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
  await expect(page.getByText("Saved to memory", { exact: false }).first()).toBeVisible();
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

test("Ideas open Jarvis ready to send, and memory import waits for approval", async ({ page }) => {
  const email = await signUp(page, "Idea Tester");
  await page.goto("/jarvis/ideas");
  await expect(page.getByRole("region", { name: "For you" })).toContainText("No savings goal yet");
  await page.getByRole("button", { name: /Quiz me before a test/ }).click();
  await expect(page.getByRole("dialog").getByLabel("Message Jarvis")).toHaveValue("Quiz me on my next exam's topics, one question at a time.");
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: /Bring what your other AI knows/ }).click();
  await page.getByLabel("Paste the answer here").fill("- I work at Target on weekends.\n- I prefer studying at night.\n- My password is hunter2");
  await page.getByRole("button", { name: "Add as suggestions" }).click();
  await expect(page.getByText("2 suggestions added below")).toBeVisible();
  expect(await queryAsUser<{ status: string }>(email, "select status from memories")).toEqual([{ status: "proposed" }, { status: "proposed" }]);
});
