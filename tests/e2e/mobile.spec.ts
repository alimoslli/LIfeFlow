import { expect, test } from "@playwright/test";
import { giveSomething, setupAbout, shown, signUp } from "./helpers";

test("core pages fit a phone screen without horizontal scrolling", async ({ page }) => {
  const email = await signUp(page, "Phone User", { onboarding: "stay" });
  // The helper saves the name after Today loaded (sign-up asks only email and password); reload so the first screen has it.
  await page.reload();
  // Every step of setup fits: the note on Today, the skylings, about you, the ways to connect, the week landing, reading it.
  const fits = async (label: string) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `setup (${label}) overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  };
  await fits("the first note");
  await shown(page, "Meet the skylings").click();
  await fits("the skylings");
  await page.getByRole("dialog", { name: "Meet the skylings" }).getByRole("radio", { name: /^Ray/ }).click();
  await page.getByRole("dialog", { name: "Meet the skylings" }).getByRole("button", { name: "This one" }).click();
  const about = await setupAbout(page, { name: "Tara", birthday: "2004-03-15", week: "Both" }, true);
  await fits("about you");
  await about.getByRole("button", { name: "Continue" }).click();
  await shown(page, "Pick the first one").click();
  await fits("the ways to connect");
  await page.keyboard.press("Escape");
  await giveSomething(email);
  await page.reload();
  await expect(page.locator(".dc-today[data-setup=landed]")).toBeVisible();
  await fits("the week lands");
  await shown(page, "Show me how to read it").click();
  await fits("read your sky");
  await shown(page, "Go to my sky").click();
  await expect(page.locator(".dc-today[data-setup]")).toHaveCount(0);
  for (const path of ["/", "/plan", "/money", "/tasks", "/school", "/calendar", "/finances", "/work", "/notes", "/jarvis", "/settings"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  }
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Today" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("Extra large text still fits a phone screen", async ({ page, context, baseURL }) => {
  await signUp(page, "Big Text");
  await context.addCookies([{ name: "lf_text", value: "xlarge", url: baseURL! }]);
  for (const path of ["/", "/plan", "/money", "/school", "/jarvis", "/settings", "/settings/profile", "/settings/invite"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveAttribute("data-text", "xlarge");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows by ${overflow}px at Extra large text`).toBeLessThanOrEqual(1);
  }
  // The skyling's page: its Personality tile grows with the text instead of clipping its icon (audit A26), and its words
  // stay inside the padding, on 360, 375 and 393 px phones. What it knows is a section of the same page now (merge 4).
  for (const width of [360, 375, 393]) {
    await page.setViewportSize({ width, height: 852 });
    await page.goto("/jarvis/profile");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("region", { name: /knows$/ })).toBeVisible();
    for (const name of [/Personality/]) {
      const card = page.getByRole("link", { name });
      const [box, icon] = [await card.boundingBox(), await card.locator("svg").last().boundingBox()];
      expect(icon!.height, `${name} icon is squeezed at Extra large text, ${width} px`).toBeGreaterThan(20);
      expect(icon!.y + icon!.height, `${name} icon is clipped at Extra large text, ${width} px`).toBeLessThanOrEqual(box!.y + box!.height);
      // How far the words themselves (each text node, not its box) reach past the card's padding on the right.
      const spill = await card.evaluate((c) => {
        const right = c.getBoundingClientRect().right - parseFloat(getComputedStyle(c).paddingRight);
        const walk = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
        let most = -Infinity;
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const rect of range.getClientRects()) most = Math.max(most, rect.right - right);
        }
        return most;
      });
      expect(spill, `${name} text spills past the card at Extra large text, ${width} px`).toBeLessThanOrEqual(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  }
});

test("is installable: manifest and icons load without signing in", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ name: "LifeFlow", display: "standalone", start_url: "/" });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
  expect((await request.get("/icons/apple-touch-icon.png")).status()).toBe(200);
});
