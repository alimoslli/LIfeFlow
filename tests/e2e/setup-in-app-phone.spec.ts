import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { pool, queryAsUser, signUp, fillBirthday } from "./helpers";

// Setup in the app (owner, 2026-11-12): the new account lands on the real Today and the skyling walks them through it.
test.use({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  // a fake microphone only: no real voice or model call is made (the voice service address is blocked below)
  permissions: ["microphone"],
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
});

const SHOTS = process.env.SETUP_SHOTS; // set to a folder to write the pictures for the owner
const OLD = SHOTS ? `${SHOTS}/old` : null;
async function shot(page: Page, name: string, dir = SHOTS) {
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(700); // the motion settles
  await page.screenshot({ path: `${dir}/${name}.png` });
}

const FEED = "https://canvas-e2e.example.edu/feeds/calendars/user_E2eFakeFeedLink0123456789.ics";
const note = (page: Page) => page.getByTestId("setup-note");

/** A made-up class schedule, drawn as a picture and uploaded like a screenshot (nothing real). */
async function schedulePicture(page: Page) {
  const p = await page.context().newPage();
  await p.setViewportSize({ width: 390, height: 420 });
  await p.setContent(`<body style="font:16px sans-serif;margin:0;padding:18px;background:#fff">
    <h2 style="margin:0 0 10px">Fall schedule (made up)</h2>
    <table style="width:100%;border-collapse:collapse" border="1" cellpadding="8">
      <tr><td>BIO 110</td><td>Mon Wed Fri</td><td>10:00 to 10:50</td><td>Room 210</td></tr>
      <tr><td>ENG 101</td><td>Tue Thu</td><td>1:00 to 2:15</td><td></td></tr></table></body>`);
  const buffer = await p.screenshot({ type: "png" });
  await p.close();
  return { name: "schedule.png", mimeType: "image/png", buffer };
}

/** Sign-up, then the setup inside the app: the first steps up to "pick the first connection". */
async function toConnect(page: Page, opts: { shots?: boolean } = {}) {
  const email = await signUp(page, "Maya Chen", { onboarding: "stay", ai: false });
  await page.goto("/setup");
  await page.waitForURL((u) => u.pathname === "/");
  // the real Today: the same sky and the same chat bar, with the skyling's note where its note always sits
  await expect(page.getByTestId("day-clock")).toBeVisible();
  await expect(page.locator(".dc-today[data-setup=meet]")).toBeVisible();
  await expect(page.getByRole("link", { name: "Money" })).toHaveCount(0); // the app's tabs wait until setup is done
  await expect(page.locator(".dc-dock").getByRole("textbox", { name: "Message Ray" })).toBeVisible();
  await expect(note(page).getByRole("button", { name: "Meet the skylings" })).toBeVisible();
  if (opts.shots) await shot(page, "01-meet-the-skylings-note");
  await note(page).getByRole("button", { name: "Meet the skylings" }).click();
  const meet = page.getByRole("dialog", { name: "Meet the skylings" });
  await meet.getByRole("radio", { name: /^Ray/ }).click();
  await meet.getByLabel("Skyling's name").fill("Nova");
  expect(Math.round((await meet.getByLabel("Skyling's name").boundingBox())!.height)).toBeGreaterThanOrEqual(44);
  if (opts.shots) await shot(page, "02-meet-the-skylings-sheet");
  await meet.getByRole("button", { name: "This one" }).click();

  await expect(note(page).getByText("I'm Nova.", { exact: false })).toBeVisible();
  if (opts.shots) await shot(page, "03-about-you-note");
  await note(page).getByRole("button", { name: "About you" }).click();
  const about = page.getByRole("dialog", { name: "About you" });
  await about.getByLabel("What should I call you?").fill("Maya");
  await about.getByRole("radio", { name: /^Both/ }).click();
  await fillBirthday(about, "2005-04-12");
  if (opts.shots) await shot(page, "04-about-you-sheet");
  await about.getByRole("button", { name: "Continue" }).click();
  await expect(note(page).getByText("Hi Maya.", { exact: false })).toBeVisible();
  await expect(page.locator(".dc-today[data-setup=connect]")).toBeVisible();
  return email;
}

test("a new account sets up on Today, connects Canvas for real, sees the week land, learns the sky and finishes", async ({ page }) => {
  const email = await toConnect(page, { shots: true });
  await shot(page, "05-first-connection-note");
  // nothing is skippable: there's no skip and no way to the rest of the app yet
  await expect(page.getByRole("button", { name: /skip/i })).toHaveCount(0);
  await page.goto("/plan");
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.locator(".dc-today[data-setup=connect]")).toBeVisible();
  const [before] = await queryAsUser<{ o: string }>(email, "select preferences->>'onboarding' as o from users where email = $1", [email]);
  expect(before.o).toBe("pending");

  await note(page).getByRole("button", { name: "Pick the first one" }).click();
  const sheet = page.getByRole("dialog", { name: "Your first connection" });
  // a student: the picture first (anyone can), Canvas next, then Google, Outlook and the bank last
  await expect(sheet.locator("[data-way]").first()).toHaveAttribute("data-way", "photo");
  await expect(sheet.locator("[data-way]").nth(1)).toHaveAttribute("data-way", "canvas");
  await expect(sheet.locator("[data-way]").last()).toHaveAttribute("data-way", "bank");
  await shot(page, "06-first-connection-sheet");
  await sheet.getByText("Nothing here works for me").click();
  await expect(sheet.getByTestId("no-connection")).toBeVisible();
  await expect(sheet.getByRole("button", { name: /skip|continue|finish/i })).toHaveCount(0);
  await shot(page, "07-nothing-works-message-or-voice");
  await sheet.getByRole("button", { name: "All the ways" }).click();

  await sheet.getByRole("button", { name: "Connect Canvas" }).click();
  await expect(sheet.getByText("Tap Calendar Feed (bottom right) and copy the link.")).toBeVisible();
  await sheet.getByLabel("Calendar Feed link").fill(FEED);
  await shot(page, "08-canvas-link");
  await sheet.getByRole("button", { name: "Connect Canvas" }).click();

  // landed: Canvas is connected for real and the week is on the wheel, opened
  await expect(page.locator(".dc-today[data-setup=landed]")).toBeVisible({ timeout: 30_000 });
  await expect(note(page).getByText("Look up, Maya", { exact: false })).toBeVisible();
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-state", "timeline");
  await expect(page.getByRole("button", { name: /^Lab report 2/ }).first()).toBeAttached();
  await shot(page, "09-the-week-lands-on-the-wheel");
  const [canvas] = await queryAsUser<{ status: string }>(email, "select status from integrations where provider = 'canvas'");
  expect(canvas.status).toBe("connected");

  // learn: fold, turn, open and fold it again on their own sky, then finish
  await note(page).getByRole("button", { name: "Show me how to read it" }).click();
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-state", "clock");
  await shot(page, "10-read-your-sky");
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-state", "timeline");
  await expect(note(page).getByText("Open it (done)")).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-state", "clock");
  await expect(note(page).getByText("Fold it back (done)")).toBeAttached();
  await shot(page, "11-read-your-sky-done");
  await page.getByRole("button", { name: "Go to my sky" }).click();
  await expect(page.locator(".dc-today[data-setup]")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Maya");
  await expect(page.getByRole("link", { name: "Money" }).first()).toBeVisible();
  const [after] = await queryAsUser<{ o: string; b: string }>(
    email,
    "select preferences->>'onboarding' as o, preferences->>'birthDate' as b from users where email = $1",
    [email],
  );
  expect(after).toEqual({ o: "done", b: "2005-04-12" });
  await shot(page, "12-their-own-today");
});

test("a picture of a class schedule: read, checked with one tap, and it lands on the wheel", async ({ page }) => {
  const email = await toConnect(page);
  await note(page).getByRole("button", { name: "Pick the first one" }).click();
  const sheet = page.getByRole("dialog", { name: "Your first connection" });
  await sheet.getByRole("button", { name: "Add a picture of your schedule" }).click();
  await expect(sheet.getByText("sends the picture to OpenAI", { exact: false })).toBeVisible();
  await shot(page, "p1-picture-sheet");
  await sheet.getByTestId("schedule-file").setInputFiles(await schedulePicture(page));
  await expect(sheet.getByRole("checkbox", { name: /BIO 110/ })).toBeVisible({ timeout: 30_000 });
  // nothing is on their sky until they tap Add
  expect((await queryAsUser(email, "select 1 from courses")).length).toBe(0);
  await expect(sheet.getByRole("checkbox", { name: /ENG 101/ })).toHaveAttribute("aria-checked", "true");
  await sheet.getByRole("checkbox", { name: /ENG 101/ }).click(); // one of them isn't right: leave it out
  await shot(page, "p2-check-what-was-found");
  await sheet.getByRole("button", { name: /^Add this to my sky/ }).click();
  await expect(page.locator(".dc-today[data-setup=landed]")).toBeVisible({ timeout: 30_000 });
  await expect(note(page).getByText("Added 1 class.", { exact: false })).toBeVisible();
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-state", "timeline");
  await expect(page.getByRole("button", { name: /^BIO 110, / }).first()).toBeAttached();
  await shot(page, "p3-the-classes-land");
  expect((await queryAsUser<{ name: string }>(email, "select name from courses")).map((c) => c.name)).toEqual(["BIO 110"]);
});

test("a plain sign-up lands in the in-app setup by default, and /welcome only forwards there", async ({ page }) => {
  await signUp(page, "Dana Default", { onboarding: "app", ai: false });
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.locator(".dc-today[data-setup=meet]")).toBeVisible();
  await page.goto("/welcome");
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.locator(".dc-today[data-setup]")).toBeVisible();
});

test("under 13 locks setup in the app exactly as before", async ({ page }) => {
  const email = await signUp(page, "Kid Example", { onboarding: "stay", ai: false });
  await page.goto("/setup");
  await page.waitForURL((u) => u.pathname === "/");
  await note(page).getByRole("button", { name: "Meet the skylings" }).click();
  await page.getByRole("dialog", { name: "Meet the skylings" }).getByRole("radio", { name: /^Ray/ }).click();
  await page.getByRole("dialog", { name: "Meet the skylings" }).getByRole("button", { name: "This one" }).click();
  await note(page).getByRole("button", { name: "About you" }).click();
  const about = page.getByRole("dialog", { name: "About you" });
  await about.getByLabel("What should I call you?").fill("Kid");
  await about.getByRole("radio", { name: /^Neither/ }).click();
  const year = new Date().getFullYear() - 10;
  await fillBirthday(about, `${year}-04-12`);
  await about.getByRole("button", { name: "Continue" }).click();
  // the one calm lock screen, and nothing of theirs kept
  await page.waitForURL("**/welcome");
  await expect(page.getByText("13", { exact: false }).first()).toBeVisible();
  const [row] = await queryAsUser<{ locked: string | null; b: string | null }>(
    email,
    "select preferences->>'ageBlockedAt' as locked, preferences->>'birthDate' as b from users where email = $1",
    [email],
  );
  expect(row.locked).toBeTruthy();
  expect(row.b).toBeNull();
  await page.goto("/");
  await page.waitForURL("**/welcome");
  expect(pool).toBeTruthy();
});

test("setup can't be finished without a connection: no finish, no skip, still in setup (the server rule is in setup-first.test.ts)", async ({ page }) => {
  const email = await toConnect(page);
  // the birthday is saved, nothing is connected: the finish never shows, and the account stays in setup
  await expect(page.getByRole("button", { name: "Go to my sky" })).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".dc-today[data-setup=connect]")).toBeVisible();
  const [row] = await queryAsUser<{ o: string }>(email, "select preferences->>'onboarding' as o from users where email = $1", [email]);
  expect(row.o).toBe("pending");
});

test("the old welcome is still there to compare", async ({ page }) => {
  test.skip(!OLD, "pictures only");
  await signUp(page, "Maya Chen", { onboarding: "stay", ai: false });
  await page.goto("/setup?old=1");
  await page.waitForURL("**/welcome");
  await shot(page, "old-1-meet-the-skylings", OLD!);
  await page.getByRole("radio", { name: /^Ray/ }).click();
  await shot(page, "old-2-picked", OLD!);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("What should I call you?").fill("Maya");
  await page.getByRole("radio", { name: /^Both/ }).click();
  await fillBirthday(page, "2005-04-12");
  await shot(page, "old-3-about-you", OLD!);
  await page.getByRole("button", { name: "Connect my sky" }).click();
  await expect(page.getByRole("heading", { name: "Connect your sky" })).toBeVisible();
  await shot(page, "old-4-connect-your-sky", OLD!);
  await page.getByRole("button", { name: "I'll connect later" }).click();
  await expect(page.getByRole("heading", { name: "Read your sky" })).toBeVisible();
  await shot(page, "old-5-read-your-sky", OLD!);
});

test("nothing to connect: tell the skyling the week in a message; only what is really saved moves setup on", async ({ page }) => {
  const email = await toConnect(page);
  await note(page).getByRole("button", { name: "Pick the first one" }).click();
  const sheet = page.getByRole("dialog", { name: "Your first connection" });
  await sheet.getByText("Nothing here works for me").click();
  await expect(sheet.getByRole("button", { name: "Talk to Nova" })).toBeVisible();
  expect(Math.round((await sheet.getByRole("button", { name: "Talk to Nova" }).boundingBox())!.height)).toBeGreaterThanOrEqual(44);
  await sheet.getByLabel("Tell Nova your week").fill("hello, nothing to see here");
  await shot(page, "m1-message-or-voice");
  await sheet.getByRole("button", { name: "Allow and send" }).click();
  // nothing was saved, so setup waits and says so (honest: no skip, no pretending)
  await expect(sheet.getByText("Nothing was added to your sky yet.", { exact: false })).toBeVisible({ timeout: 30_000 });
  await shot(page, "m2-nothing-saved-setup-waits");
  expect((await queryAsUser(email, "select 1 from courses")).length).toBe(0);
  await expect(page.locator(".dc-today[data-setup=connect]")).toBeVisible();
  // now a real week: the model saves it through set_up_schedule, and that is what lands on the wheel
  await sheet
    .getByLabel("Tell Nova your week")
    .fill('/tool set_up_schedule {"classes":[{"name":"BIO 110","days":[1,3,5],"startTime":"10:00","endTime":"10:50"}]}');
  await sheet.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".dc-today[data-setup=landed]")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-state", "timeline");
  await expect(page.getByRole("button", { name: /^BIO 110, / }).first()).toBeAttached();
  await shot(page, "m3-the-told-week-lands");
  expect((await queryAsUser<{ name: string }>(email, "select name from courses")).map((c) => c.name)).toEqual(["BIO 110"]);
});

test("nothing to connect: the voice button starts the app's own voice bar, and a call that saves nothing leaves setup waiting", async ({ page }) => {
  // the voice service is never reached: its address is blocked here (after a pause, so the voice bar can be pictured)
  await page.route("https://api.openai.com/**", async (r) => {
    await new Promise((done) => setTimeout(done, 5_000));
    await r.abort().catch(() => undefined);
  });
  const email = await toConnect(page);
  await note(page).getByRole("button", { name: "Pick the first one" }).click();
  const sheet = page.getByRole("dialog", { name: "Your first connection" });
  await sheet.getByText("Nothing here works for me").click();
  await sheet.getByRole("button", { name: "Talk to Nova" }).click();
  await expect(sheet.getByRole("group", { name: "Talking with Nova" })).toBeVisible();
  await shot(page, "m4-voice-bar");
  // no voice service is reachable in the tests: the bar closes with a plain line, and nothing is on the sky
  await expect(sheet.getByRole("group", { name: "Talking with Nova" })).toHaveCount(0, { timeout: 30_000 });
  await expect(sheet.getByRole("alert")).toBeVisible();
  expect((await queryAsUser(email, "select 1 from courses")).length).toBe(0);
  await expect(page.locator(".dc-today[data-setup=connect]")).toBeVisible();
});

test("on a laptop the same setup sits beside the wheel", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await signUp(page, "Maya Chen", { onboarding: "stay", ai: false });
  await page.goto("/setup");
  await page.waitForURL((u) => u.pathname === "/");
  const wide = page.getByTestId("setup-note-wide");
  await expect(wide.getByRole("button", { name: "Meet the skylings" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Message / }).first()).toBeVisible();
  expect(Math.round((await wide.getByRole("button", { name: "Meet the skylings" }).boundingBox())!.height)).toBeGreaterThanOrEqual(44);
  if (SHOTS) {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOTS}/laptop-1-meet-the-skylings-note.png` });
  }
  await ctx.close();
});
