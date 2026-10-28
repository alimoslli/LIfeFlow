import { expect, test } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

test.use({ permissions: ["microphone"], launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

test("voice call starts a session and fails gracefully when the voice service is unreachable", async ({ page }) => {
  const email = await signUp(page, "Voice Vee");
  await page.goto("/jarvis");
  await page.getByRole("button", { name: "Talk to Jarvis" }).click();
  const call = page.getByRole("dialog", { name: "Voice call with Jarvis" });
  await expect(call).toBeVisible();
  // The test environment can't reach OpenAI's voice servers, so the call ends with a clear message.
  await expect(call.getByText("Couldn't connect")).toBeVisible({ timeout: 20_000 });
  await expect(call.getByRole("link", { name: "View transcript" })).toBeVisible();
  // A conversation was opened and the failed call was recorded (no content).
  await expect
    .poll(async () => (await queryAsUser<{ outcome: string }>(email, "select outcome from jarvis_runs where provider = 'openai-realtime'"))[0]?.outcome)
    .toBe("error");
  await call.getByRole("button", { name: "Done" }).click();
  await expect(call).toHaveCount(0);
});
