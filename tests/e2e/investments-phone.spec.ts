import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

/**
 * Investments live on Accounts (owner's page map, 2026-11-10: simplified, not removed). The old address lands there,
 * and adding a holding, "what if I invest monthly?" and the basics each open over the page.
 */
test("investments are part of Accounts: old link, add a holding, what if, basics", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, "Maya Torres");

  // No investment accounts yet: a quiet "Investing" line with what-if and the basics, no holdings form.
  await page.goto("/wealth");
  await page.waitForURL((u) => u.pathname === "/finances/accounts");
  const investing = page.getByRole("region", { name: "Investing" });
  await expect(investing.getByRole("button", { name: "What if I invest monthly?" })).toBeVisible();
  await expect(investing.getByRole("button", { name: "Holding" })).toHaveCount(0);

  // Add a Roth IRA by hand, then a holding in it.
  await page.getByRole("button", { name: "Add an account yourself" }).click();
  const add = page.getByRole("dialog", { name: "Add an account" });
  await add.getByLabel("Name").fill("Roth IRA");
  await add.getByLabel("Type").selectOption("investment");
  await add.getByLabel("Balance ($)").fill("1200");
  await add.getByRole("button", { name: "Add account" }).click();
  await expect(add).toBeHidden();

  const section = page.getByRole("region", { name: "Investments" });
  await expect(section.getByText("Roth IRA")).toBeVisible();
  await section.getByRole("button", { name: "Holding" }).click();
  const holding = page.getByRole("dialog", { name: "Add a holding" });
  await holding.getByLabel("Name").fill("Total Stock Market ETF");
  await holding.getByLabel("Symbol").fill("VTI");
  await holding.getByLabel("Quantity").fill("4");
  await holding.getByLabel("Worth now ($)").fill("1100");
  await holding.getByLabel("You paid ($)").fill("1000");
  await holding.getByRole("button", { name: "Add holding" }).click();
  await expect(holding).toBeHidden();
  const held = section.getByRole("list", { name: "What you hold" });
  await expect(held.getByText("VTI")).toBeVisible();
  await expect(held.getByText("+$100")).toBeVisible();

  // each sheet slides away before the next tap (as a person would wait for it)
  await section.getByRole("button", { name: "What if I invest monthly?" }).click();
  const whatIf = page.getByRole("dialog", { name: "What if I invest monthly?" });
  await expect(whatIf).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(whatIf).toBeHidden();
  await section.getByRole("button", { name: "Investing basics" }).click();
  const basics = page.getByRole("dialog", { name: "Investing basics" });
  await expect(basics.getByText("LifeFlow never trades or moves money.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(basics).toBeHidden();

  // A manual holding can be taken off again.
  page.once("dialog", (d) => d.accept());
  await held.getByRole("button", { name: "Remove VTI" }).click();
  await expect(held).toHaveCount(0);
});
