import { expect, test } from "@playwright/test";
import { askJarvis, COMPOSER, queryAsUser, signUp } from "./helpers";

test.use({ permissions: ["microphone"], launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

test("talking happens inside the chat: no call screen, same conversation, and a clear message when it can't connect", async ({ page }) => {
  const email = await signUp(page, "Voice Vee");
  await page.goto("/jarvis");
  await askJarvis(page, "hello there");
  await expect(page).toHaveURL(/\/jarvis\/[0-9a-f-]{36}$/);
  const chatUrl = page.url();

  await page.getByRole("button", { name: "Talk to your assistant" }).click();
  // The composer turns into the voice bar; there's no separate call screen.
  await expect(page.getByRole("group", { name: "Talking with your assistant" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The test environment can't reach OpenAI's voice servers: the bar closes and the chat says why.
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("group", { name: "Talking with your assistant" })).toHaveCount(0);
  await expect(page.getByLabel(COMPOSER)).toBeVisible();
  // Still the same chat, and the call was recorded in that conversation (no content).
  expect(page.url()).toBe(chatUrl);
  const conversationId = chatUrl.split("/").pop();
  await expect
    .poll(
      async () =>
        (
          await queryAsUser<{ outcome: string; conversation_id: string }>(
            email,
            "select outcome, conversation_id from jarvis_runs where provider = 'openai-realtime'",
          )
        )[0],
    )
    .toMatchObject({ outcome: "error", conversation_id: conversationId });
});
