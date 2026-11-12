import { expect, test } from "@playwright/test";
import { askJarvis, COMPOSER, queryAsUser, signUp } from "./helpers";

test.use({ permissions: ["microphone"], launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

test("talking happens inside the chat: no call screen, same conversation, and a clear message when it can't connect", async ({ page }) => {
  const email = await signUp(page, "Voice Vee");
  await page.goto("/jarvis");
  await askJarvis(page, "hello there");
  await expect(page).toHaveURL(/\/jarvis$/);
  const chatUrl = page.url();

  await page.getByRole("button", { name: "Talk to Ray" }).click();
  // The composer turns into the voice bar; there's no separate call screen.
  await expect(page.getByRole("group", { name: "Talking with Ray" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The test environment can't reach OpenAI's voice servers: the bar closes and the chat says why.
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("group", { name: "Talking with Ray" })).toHaveCount(0);
  await expect(page.getByLabel(COMPOSER)).toBeVisible();
  // Still the same chat, and the call was recorded in that conversation (no content).
  expect(page.url()).toBe(chatUrl);
  // the chat this window is in is the latest one of the person's (the address doesn't carry it)
  const [{ id: conversationId }] = await queryAsUser<{ id: string }>(email, "select id from conversations order by last_message_at desc limit 1");
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
