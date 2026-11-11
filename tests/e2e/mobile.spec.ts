import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("core pages fit a phone screen without horizontal scrolling", async ({ page }) => {
  await signUp(page, "Phone User", { onboarding: "stay" });
  // The helper saves the name after /welcome loaded (sign-up asks only email and password); reload so the first screen has it.
  await page.reload();
  // Every onboarding step fits: the skylings, about you (with long names), connect your sky, read your sky.
  const fits = async (label: string) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `/welcome (${label}) overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  };
  await fits("skyling");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("What should I call you?").fill("Tara");
  await page.getByLabel("Your birthday").fill("2004-03-15");
  await page.getByRole("radio", { name: /Both/ }).click();
  await page.getByLabel("Your school").fill("Introduction to Organic Chemistry University");
  await page.getByLabel("Where you work").fill("Campus Coffee and Bakery Downtown");
  await fits("about");
  await page.getByRole("button", { name: "Connect my sky" }).click();
  await fits("connect");
  await page.getByRole("button", { name: "I'll connect later" }).click();
  await fits("learn");
  await page.getByRole("button", { name: "Skip setup" }).click();
  await page.waitForURL((u) => u.pathname === "/");
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
