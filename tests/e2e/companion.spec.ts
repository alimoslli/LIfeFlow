import { expect, test } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

// The cast (docs/design/companions/cast.md): in Settings › your skyling, picking a skyling saves at once, brings its
// name (unless the skyling has a name of its own) and its tone, and it's the one on top of Today.
test("picking a skyling in Settings makes it the skyling and puts it on the wheel", async ({ page }) => {
  const email = await signUp(page, "Cast Tester");
  await page.goto("/settings/jarvis");
  const six = page.getByRole("radiogroup", { name: "Your skyling" });
  // the six, and a seventh choice: "Changes with the sky"
  await expect(six.getByRole("radio")).toHaveCount(7);
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

test.describe("changes with the sky", () => {
  test.use({ timezoneId: "America/New_York" });

  // Owner, 2026-11-10: whoever's moment it is; one name and one way of talking all day.
  test("picked in Settings, Ray is up at 8 AM and Star at 11 PM, and the name stays", async ({ page }) => {
    const email = await signUp(page, "Sky Tester");
    await page.goto("/settings/jarvis");
    const picker = page.getByRole("radiogroup", { name: "Your skyling" });
    await picker.getByRole("radio", { name: /^Changes with the sky/ }).click();
    await expect(page.getByText("Whoever's up: Dawn at first light, Ray in the morning, Star at night.").first()).toBeVisible();
    await expect
      .poll(
        async () => (await queryAsUser<{ p: Record<string, string> }>(email, "select preferences as p from users where email = $1", [email]))[0].p.companion,
      )
      .toBe("sky");

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
    for (const [time, who] of [
      ["08:00", "ray"],
      ["23:00", "star"],
    ] as const) {
      await page.clock.setFixedTime(new Date(`${today}T${time}:00-05:00`));
      await page.goto("/");
      const clock = page.getByTestId("day-clock");
      await expect(clock).toHaveAttribute("data-companion", "sky");
      await expect(clock).toHaveAttribute("data-skyling-now", who);
    }
    const [{ p }] = await queryAsUser<{ p: Record<string, string | undefined> }>(email, "select preferences as p from users where email = $1", [email]);
    expect(p.assistantName).toBeUndefined();
  });
});
