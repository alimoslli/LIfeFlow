import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("core pages fit a phone screen without horizontal scrolling", async ({ page }) => {
  await signUp(page, "Phone User", { onboarding: "stay" });
  // The helper saves the name after /welcome loaded (sign-up asks only email and password); reload so the first screen has it.
  await page.reload();
  // Every onboarding step fits: hello, your week, a class and job, make it yours, your day connected (animating and done).
  const fits = async (label: string) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `/welcome (${label}) overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  };
  await fits("hello");
  await page.getByRole("button", { name: "Let's go" }).click();
  await page.getByRole("radio", { name: /Both/ }).click();
  await fits("week");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("A class you're taking").fill("Introduction to Organic Chemistry II");
  await page.getByLabel("Where you work").fill("Campus Coffee and Bakery Downtown");
  await fits("details");
  await page.getByRole("button", { name: "Continue" }).click();
  await fits("yours");
  await page.getByRole("button", { name: "Show me my day" }).click();
  await page.waitForTimeout(3500);
  await fits("day, connecting");
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(3);
  await fits("day, result");
  await page.getByRole("button", { name: "Skip setup" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await page.getByRole("button", { name: "Skip tour" }).click();
  for (const path of ["/", "/plan", "/money", "/tasks", "/school", "/calendar", "/finances", "/work", "/notes", "/jarvis", "/settings"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  }
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Plan" }).click();
  await expect(page).toHaveURL(/\/plan/);
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
  // The assistant's Profile cards grow with the text instead of clipping their icons (audit A26), and their words stay
  // inside the card's padding, on 360, 375 and 393 px phones.
  for (const width of [360, 375, 393]) {
    await page.setViewportSize({ width, height: 852 });
    await page.goto("/jarvis/profile");
    await page.waitForLoadState("networkidle");
    for (const name of [/Personality/, /Memory/]) {
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
