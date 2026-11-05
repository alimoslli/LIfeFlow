import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

/**
 * Jarvis on a phone with the keyboard open. Browsers under test have no on-screen keyboard,
 * so this fakes iOS's: the visible area (VisualViewport) gets shorter by the keyboard's height.
 * What must hold: the page doesn't move, only the message bar sits on the keyboard, the tab
 * bar hides, and typing goes into the box.
 */
test("Jarvis keyboard: the page stays still and only the message bar rides up", async ({ page }) => {
  await page.addInitScript(() => {
    let kb = 0;
    const real = Object.getOwnPropertyDescriptor(VisualViewport.prototype, "height")!;
    Object.defineProperty(VisualViewport.prototype, "height", {
      configurable: true,
      get() {
        return (real.get!.call(this) as number) - kb;
      },
    });
    (window as unknown as { keyboard: (h: number) => void }).keyboard = (h: number) => {
      kb = h;
      window.visualViewport!.dispatchEvent(new Event("resize"));
    };
  });
  await signUp(page, "Kim Keys");
  await page.goto("/jarvis");
  const box = page.getByRole("textbox", { name: "Message Jarvis" });
  const header = page.getByRole("link", { name: "Assistant profile" });
  const tabbar = page.locator(".lf-tabbar");
  await expect(box).toBeVisible();
  const headerBefore = (await header.boundingBox())!;
  const screen = page.viewportSize()!.height;

  // First time: the keyboard opens, then the bar slides onto it and gets focus.
  await box.tap();
  await page.evaluate(() => (window as unknown as { keyboard: (h: number) => void }).keyboard(320));
  await expect(box).toBeFocused();
  await expect(tabbar).toHaveCSS("opacity", "0");
  await expect
    .poll(async () => Math.round((await page.locator(".lf-composer").boundingBox())!.y + (await page.locator(".lf-composer").boundingBox())!.height))
    .toBeLessThanOrEqual(screen - 320);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect((await header.boundingBox())!.y).toBe(headerBefore.y);
  await page.keyboard.type("hello there");
  await expect(box).toHaveValue("hello there");

  // Keyboard closes: everything back, tab bar too.
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.evaluate(() => (window as unknown as { keyboard: (h: number) => void }).keyboard(0));
  await expect(tabbar).toHaveCSS("opacity", "1");

  // Next time the height is known, so the bar moves with the keyboard, before it finishes opening.
  await box.tap();
  await expect(page.locator(".lf-chat-viewport")).toHaveAttribute("data-keyboard", "");
  await page.evaluate(() => (window as unknown as { keyboard: (h: number) => void }).keyboard(320));
  await expect(box).toBeFocused();
  await expect(box).toHaveValue("hello there");
});
